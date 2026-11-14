-- Candidate only. Gate opens solely after correlated RELEASED acknowledgement.
BEGIN;
CREATE TABLE honorpole_handover_r1.release_directives(
 device_id text NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
 boot text NOT NULL CHECK(boot ~ '^[0-9A-F]{32}$'),
 ticket text NOT NULL CHECK(ticket ~ '^[0-9A-F]{32}$'),
 request_id uuid NOT NULL REFERENCES honorpole_handover_r1.finalizations(request_id),
 generation bigint NOT NULL CHECK(generation BETWEEN 0 AND 9007199254740990),
 next_generation bigint NOT NULL CHECK(next_generation=generation+1),
 deadline bigint NOT NULL CHECK(deadline BETWEEN 0 AND 4294967295),
 credential_hash text NOT NULL CHECK(credential_hash ~ '^[0-9a-f]{64}$'),
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 acknowledged_at timestamptz,ack_signature text CHECK(ack_signature ~ '^[0-9A-F]{64}$'),
 PRIMARY KEY(device_id,boot,ticket),
 CHECK((acknowledged_at IS NULL)=(ack_signature IS NULL))
);
ALTER TABLE honorpole_handover_r1.release_directives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON honorpole_handover_r1.release_directives FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION honorpole_handover_r1.release_view(d honorpole_handover_r1.release_directives)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('deviceId',(d).device_id,'boot',(d).boot,'ticket',(d).ticket,
 'requestId',(d).request_id,'action','RELEASE','generation',(d).generation,'nextGeneration',(d).next_generation,'deadline',(d).deadline)
$$;
CREATE FUNCTION public.honorpole_handover_issue_directive_r1(p_device text,p_secret_hash text,p_boot text,p_ticket text,p_deadline bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c honorpole_handover_r1.controls%rowtype;r honorpole_handover_r1.requests%rowtype;
 f honorpole_handover_r1.finalizations%rowtype;d honorpole_handover_r1.release_directives%rowtype;known boolean;
BEGIN
 PERFORM honorpole_handover_r1.device_auth(p_device,p_secret_hash);
 IF p_boot IS NULL OR p_boot !~ '^[0-9A-F]{32}$' OR p_ticket IS NULL OR p_ticket !~ '^[0-9A-F]{32}$'
 OR p_deadline IS NULL OR p_deadline<0 OR p_deadline>4294967295 THEN RAISE EXCEPTION 'Invalid challenge' USING ERRCODE='HP400';END IF;
 SELECT * INTO c FROM honorpole_handover_r1.controls WHERE device_id=p_device;
 IF c.active_request IS NULL THEN RETURN jsonb_build_object('deviceId',p_device,'directive',NULL);END IF;
 SELECT * INTO r FROM honorpole_handover_r1.requests WHERE id=c.active_request AND device_id=p_device FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Handover state changed' USING ERRCODE='HP409';END IF;
 SELECT * INTO d FROM honorpole_handover_r1.release_directives WHERE device_id=p_device AND boot=p_boot AND ticket=p_ticket;
 known:=FOUND;
 IF NOT known AND NOT EXISTS(SELECT 1 FROM honorpole_handover_r1.directives WHERE device_id=p_device AND boot=p_boot AND ticket=p_ticket)
 AND (SELECT count(*) FROM honorpole_handover_r1.directives WHERE device_id=p_device)+
     (SELECT count(*) FROM honorpole_handover_r1.release_directives WHERE device_id=p_device)>=1024
 THEN RAISE EXCEPTION 'Directive capacity reached' USING ERRCODE='HP503';END IF;
 IF r.phase IN('quiescing','cancel_requested') THEN
  IF known THEN RAISE EXCEPTION 'Challenge reuse conflict' USING ERRCODE='HP409';END IF;
  RETURN public.honorpole_handover_issue_hold_r1(p_device,p_secret_hash,p_boot,p_ticket,p_deadline);
 END IF;
 SELECT * INTO f FROM honorpole_handover_r1.finalizations WHERE request_id=r.id AND device_id=p_device;
 IF NOT FOUND OR r.phase<>'releasing' OR c.generation<>f.next_generation OR r.generation<>f.generation
  OR f.credential_hash IS DISTINCT FROM p_secret_hash THEN RAISE EXCEPTION 'Handover state changed' USING ERRCODE='HP409';END IF;
 IF EXISTS(SELECT 1 FROM honorpole_handover_r1.directives WHERE device_id=p_device AND boot=p_boot AND ticket=p_ticket)
 THEN RAISE EXCEPTION 'Challenge reuse conflict' USING ERRCODE='HP409';END IF;
 IF known THEN
  IF d.request_id<>r.id OR d.generation<>f.generation OR d.next_generation<>f.next_generation OR d.deadline<>p_deadline
   OR d.credential_hash IS DISTINCT FROM p_secret_hash THEN RAISE EXCEPTION 'Challenge reuse conflict' USING ERRCODE='HP409';END IF;
 ELSE
  INSERT INTO honorpole_handover_r1.release_directives(device_id,boot,ticket,request_id,generation,next_generation,deadline,credential_hash)
  VALUES(p_device,p_boot,p_ticket,r.id,f.generation,f.next_generation,p_deadline,p_secret_hash) RETURNING * INTO d;
 END IF;
 RETURN jsonb_build_object('deviceId',p_device,'directive',honorpole_handover_r1.release_view(d));
END $$;
CREATE FUNCTION public.honorpole_handover_get_directive_r1(p_device text,p_secret_hash text,p_boot text,p_ticket text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d honorpole_handover_r1.release_directives%rowtype;
BEGIN
 PERFORM honorpole_handover_r1.device_auth(p_device,p_secret_hash);
 SELECT * INTO d FROM honorpole_handover_r1.release_directives WHERE device_id=p_device AND boot=p_boot AND ticket=p_ticket;
 IF FOUND THEN
  IF d.credential_hash IS DISTINCT FROM p_secret_hash THEN RAISE EXCEPTION 'Credential changed' USING ERRCODE='HP409';END IF;
  RETURN jsonb_build_object('deviceId',p_device,'directive',honorpole_handover_r1.release_view(d));
 END IF;
 RETURN public.honorpole_handover_get_issued_r1(p_device,p_secret_hash,p_boot,p_ticket);
END $$;
CREATE FUNCTION public.honorpole_handover_record_ack_r1(p_device text,p_secret_hash text,p_ack jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d honorpole_handover_r1.release_directives%rowtype;r honorpole_handover_r1.requests%rowtype;
 c honorpole_handover_r1.controls%rowtype;f honorpole_handover_r1.finalizations%rowtype;s text;
BEGIN
 -- Trusted backend has verified the MAC. Recheck credential/correlation under locks.
 PERFORM honorpole_handover_r1.device_auth(p_device,p_secret_hash);
 IF p_ack->>'action'='HOLD' THEN RETURN public.honorpole_handover_record_quiesced_r1(p_device,p_secret_hash,p_ack);END IF;
 SELECT * INTO d FROM honorpole_handover_r1.release_directives WHERE device_id=p_device
  AND boot=p_ack->>'boot' AND ticket=p_ack->>'ticket' FOR UPDATE;
 IF NOT FOUND OR d.credential_hash IS DISTINCT FROM p_secret_hash THEN RAISE EXCEPTION 'No current issued directive' USING ERRCODE='HP409';END IF;
 s:=p_ack->>'signature';
 IF s IS NULL OR s !~ '^[0-9A-F]{64}$' OR p_ack<>(honorpole_handover_r1.release_view(d)||jsonb_build_object('state','RELEASED','signature',s))
 THEN RAISE EXCEPTION 'Acknowledgement correlation failed' USING ERRCODE='HP409';END IF;
 IF d.ack_signature IS NOT NULL AND d.ack_signature<>s THEN RAISE EXCEPTION 'Acknowledgement conflict' USING ERRCODE='HP409';END IF;
 SELECT * INTO r FROM honorpole_handover_r1.requests WHERE id=d.request_id AND device_id=p_device FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Handover state changed' USING ERRCODE='HP409';END IF;
 SELECT * INTO f FROM honorpole_handover_r1.finalizations WHERE request_id=r.id AND device_id=p_device;
 SELECT * INTO c FROM honorpole_handover_r1.controls WHERE device_id=p_device;
 IF f.request_id IS NULL OR f.generation<>d.generation OR f.next_generation<>d.next_generation
  OR f.credential_hash IS DISTINCT FROM p_secret_hash THEN RAISE EXCEPTION 'Finalization changed' USING ERRCODE='HP409';END IF;
 IF r.phase='releasing' THEN
  IF c.active_request IS DISTINCT FROM r.id OR c.generation<>d.next_generation THEN
   RAISE EXCEPTION 'Handover state changed' USING ERRCODE='HP409';END IF;
  UPDATE honorpole_handover_r1.requests SET phase='completed' WHERE id=r.id;
  UPDATE honorpole_handover_r1.controls SET active_request=NULL WHERE device_id=p_device;
 ELSIF r.phase<>'completed' THEN RAISE EXCEPTION 'Handover state changed' USING ERRCODE='HP409';END IF;
 -- A completed request's late/duplicate ACK is receipted without touching the
 -- current gate or generation, even if another handover has since started.
 UPDATE honorpole_handover_r1.release_directives SET acknowledged_at=COALESCE(acknowledged_at,clock_timestamp()),ack_signature=s
  WHERE device_id=p_device AND boot=d.boot AND ticket=d.ticket;
 RETURN jsonb_build_object('accepted',true,'deviceId',p_device,'boot',d.boot,'ticket',d.ticket,'signature',s);
END $$;
REVOKE ALL ON FUNCTION honorpole_handover_r1.release_view(honorpole_handover_r1.release_directives)
 FROM PUBLIC,anon,authenticated,service_role;
-- Preserve idempotent commit receipts after RELEASE, including after another
-- handover starts. Receipt fields describe the original commit, not live gate state.
ALTER FUNCTION public.honorpole_handover_finalize_r1(uuid,text,text,text)
 RENAME TO hp_handover_finalize_inflight_r1;
REVOKE ALL ON FUNCTION public.hp_handover_finalize_inflight_r1(uuid,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.honorpole_handover_finalize_r1(p_request uuid,p_secret_hash text,p_boot text,p_ticket text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r honorpole_handover_r1.requests%rowtype;f honorpole_handover_r1.finalizations%rowtype;g bigint;
BEGIN
 r:=honorpole_handover_r1.lock_request(p_request);
 PERFORM honorpole_handover_r1.device_auth(r.device_id,p_secret_hash);
 IF r.phase='completed' THEN
  SELECT * INTO f FROM honorpole_handover_r1.finalizations WHERE request_id=r.id AND device_id=r.device_id;
  SELECT generation INTO g FROM honorpole_handover_r1.controls WHERE device_id=r.device_id;
  IF NOT FOUND OR f.request_id IS NULL OR f.boot IS DISTINCT FROM p_boot OR f.ticket IS DISTINCT FROM p_ticket
   OR f.credential_hash IS DISTINCT FROM p_secret_hash OR g<f.next_generation THEN
   RAISE EXCEPTION 'Finalization retry conflict' USING ERRCODE='HP409';END IF;
  RETURN honorpole_handover_r1.finalization_view(f);
 END IF;
 RETURN public.hp_handover_finalize_inflight_r1(p_request,p_secret_hash,p_boot,p_ticket);
END $$;
REVOKE ALL ON FUNCTION public.honorpole_handover_finalize_r1(uuid,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.honorpole_handover_finalize_r1(uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.honorpole_handover_issue_directive_r1(text,text,text,text,bigint),
 public.honorpole_handover_get_directive_r1(text,text,text,text),public.honorpole_handover_record_ack_r1(text,text,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.honorpole_handover_issue_directive_r1(text,text,text,text,bigint),
 public.honorpole_handover_get_directive_r1(text,text,text,text),public.honorpole_handover_record_ack_r1(text,text,jsonb) TO service_role;
COMMIT;
