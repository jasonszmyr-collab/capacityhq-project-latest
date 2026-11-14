-- Draft, service-only HOLD delivery/evidence. No ownership or generation mutation.
BEGIN;
CREATE TABLE honorpole_handover_r1.directives(
 device_id text NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
 boot text NOT NULL CHECK(boot ~ '^[0-9A-F]{32}$'),
 ticket text NOT NULL CHECK(ticket ~ '^[0-9A-F]{32}$'),
 request_id uuid NOT NULL,
 generation bigint NOT NULL CHECK(generation BETWEEN 0 AND 9007199254740991),
 deadline bigint NOT NULL CHECK(deadline BETWEEN 0 AND 4294967295),
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 acknowledged_at timestamptz,
 ack_signature text CHECK(ack_signature ~ '^[0-9A-F]{64}$'),
 PRIMARY KEY(device_id,boot,ticket),
 FOREIGN KEY(device_id,request_id) REFERENCES honorpole_handover_r1.requests(device_id,id),
 CHECK((acknowledged_at IS NULL)=(ack_signature IS NULL))
);
ALTER TABLE honorpole_handover_r1.directives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON honorpole_handover_r1.directives FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION honorpole_handover_r1.device_auth(d text,h text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF d IS NULL OR d !~ '^HP-[0-9]{3,6}$' OR d ~ '^HP-0{3,6}$' OR h IS NULL OR h !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'Device authentication required' USING ERRCODE='HP401';END IF;
 PERFORM honorpole_handover_r1.lock_device(d);
 -- A fresh locked credential check, never the process-local registry cache.
 PERFORM 1 FROM public.honorpole_factory_credentials WHERE device_id=d AND secret_hash=h AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Device authentication required' USING ERRCODE='HP401';END IF;
END $$;
CREATE FUNCTION honorpole_handover_r1.directive_view(d honorpole_handover_r1.directives) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('deviceId',(d).device_id,'boot',(d).boot,'ticket',(d).ticket,
 'requestId',(d).request_id,'action','HOLD','generation',(d).generation,'nextGeneration',(d).generation,'deadline',(d).deadline)
$$;
CREATE FUNCTION public.honorpole_handover_issue_hold_r1(p_device text,p_secret_hash text,p_boot text,p_ticket text,p_deadline bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c honorpole_handover_r1.controls%rowtype;r honorpole_handover_r1.requests%rowtype;d honorpole_handover_r1.directives%rowtype;
BEGIN
 PERFORM honorpole_handover_r1.device_auth(p_device,p_secret_hash);
 IF p_boot IS NULL OR p_boot !~ '^[0-9A-F]{32}$' OR p_ticket IS NULL OR p_ticket !~ '^[0-9A-F]{32}$'
 OR p_deadline IS NULL OR p_deadline<0 OR p_deadline>4294967295 THEN
 RAISE EXCEPTION 'Invalid challenge' USING ERRCODE='HP400';END IF;
 SELECT * INTO c FROM honorpole_handover_r1.controls WHERE device_id=p_device;
 IF c.active_request IS NULL THEN RETURN jsonb_build_object('deviceId',p_device,'directive',NULL);END IF;
 SELECT * INTO r FROM honorpole_handover_r1.requests WHERE id=c.active_request AND device_id=p_device FOR UPDATE;
 IF NOT FOUND OR r.phase NOT IN('quiescing','cancel_requested') OR r.generation<>c.generation OR c.generation>9007199254740991 THEN
 RAISE EXCEPTION 'Handover state changed' USING ERRCODE='HP409';END IF;
 SELECT * INTO d FROM honorpole_handover_r1.directives WHERE device_id=p_device AND boot=p_boot AND ticket=p_ticket;
 IF FOUND THEN
  IF d.request_id<>r.id OR d.generation<>c.generation OR d.deadline<>p_deadline THEN
   RAISE EXCEPTION 'Challenge reuse conflict' USING ERRCODE='HP409';END IF;
 ELSE
  -- No automatic pruning: late offline ACKs must retain their issuance record.
  -- Capacity is bounded until an explicit archival/reconciliation policy exists.
  IF (SELECT count(*) FROM honorpole_handover_r1.directives WHERE device_id=p_device)>=1024 THEN
   RAISE EXCEPTION 'Directive capacity reached' USING ERRCODE='HP503';END IF;
  INSERT INTO honorpole_handover_r1.directives(device_id,boot,ticket,request_id,generation,deadline)
  VALUES(p_device,p_boot,p_ticket,r.id,c.generation,p_deadline) RETURNING * INTO d;
 END IF;
 RETURN jsonb_build_object('deviceId',p_device,'directive',honorpole_handover_r1.directive_view(d));
END $$;
CREATE FUNCTION public.honorpole_handover_get_issued_r1(p_device text,p_secret_hash text,p_boot text,p_ticket text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d honorpole_handover_r1.directives%rowtype;
BEGIN
 PERFORM honorpole_handover_r1.device_auth(p_device,p_secret_hash);
 SELECT * INTO d FROM honorpole_handover_r1.directives WHERE device_id=p_device AND boot=p_boot AND ticket=p_ticket;
 IF NOT FOUND THEN RAISE EXCEPTION 'No issued directive' USING ERRCODE='HP409';END IF;
 RETURN jsonb_build_object('deviceId',p_device,'directive',honorpole_handover_r1.directive_view(d));
END $$;
CREATE FUNCTION public.honorpole_handover_record_quiesced_r1(p_device text,p_secret_hash text,p_ack jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d honorpole_handover_r1.directives%rowtype;s text;
BEGIN
 PERFORM honorpole_handover_r1.device_auth(p_device,p_secret_hash);
 SELECT * INTO d FROM honorpole_handover_r1.directives WHERE device_id=p_device
  AND boot=p_ack->>'boot' AND ticket=p_ack->>'ticket' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'No issued directive' USING ERRCODE='HP409';END IF;
 s:=p_ack->>'signature';
 IF s IS NULL OR s !~ '^[0-9A-F]{64}$' OR p_ack<>(honorpole_handover_r1.directive_view(d)||jsonb_build_object('state','QUIESCED','signature',s))
 THEN RAISE EXCEPTION 'Acknowledgement correlation failed' USING ERRCODE='HP409';END IF;
 IF d.ack_signature IS NOT NULL AND d.ack_signature<>s THEN
  RAISE EXCEPTION 'Acknowledgement conflict' USING ERRCODE='HP409';END IF;
 UPDATE honorpole_handover_r1.directives SET acknowledged_at=COALESCE(acknowledged_at,clock_timestamp()),ack_signature=s
 WHERE device_id=p_device AND boot=d.boot AND ticket=d.ticket;
 -- Evidence only. This function never changes ownership, gate or generation.
 RETURN jsonb_build_object('accepted',true,'deviceId',p_device,'boot',d.boot,'ticket',d.ticket,'signature',s);
END $$;
REVOKE ALL ON FUNCTION honorpole_handover_r1.device_auth(text,text),
 honorpole_handover_r1.directive_view(honorpole_handover_r1.directives) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.honorpole_handover_issue_hold_r1(text,text,text,text,bigint),
 public.honorpole_handover_get_issued_r1(text,text,text,text),
 public.honorpole_handover_record_quiesced_r1(text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.honorpole_handover_issue_hold_r1(text,text,text,text,bigint),
 public.honorpole_handover_get_issued_r1(text,text,text,text),
 public.honorpole_handover_record_quiesced_r1(text,text,jsonb) TO service_role;
COMMIT;
