-- Candidate only. Frozen cancellation preserves access and uses authenticated RELEASE.
BEGIN;
ALTER TABLE honorpole_handover_r1.requests DROP CONSTRAINT requests_phase_check;
ALTER TABLE honorpole_handover_r1.requests ADD CONSTRAINT requests_phase_check
 CHECK(phase IN('offered','accepted','quiescing','cancel_requested','cancel_releasing','cancelled','expired','releasing','completed'));
DROP INDEX honorpole_handover_r1.one_pending_request_per_device;
CREATE UNIQUE INDEX one_pending_request_per_device ON honorpole_handover_r1.requests(device_id)
 WHERE phase IN('offered','accepted','quiescing','cancel_requested','cancel_releasing','releasing');
CREATE TABLE honorpole_handover_r1.cancellations(
 request_id uuid PRIMARY KEY REFERENCES honorpole_handover_r1.requests(id),
 device_id text NOT NULL,owner_id uuid NOT NULL,generation bigint NOT NULL,
 next_generation bigint NOT NULL CHECK(next_generation=generation+1),
 boot text NOT NULL,ticket text NOT NULL,credential_hash text NOT NULL,
 proof_signature text NOT NULL,proof_acknowledged_at timestamptz NOT NULL,
 memberships jsonb NOT NULL,prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(device_id,boot,ticket) REFERENCES honorpole_handover_r1.directives(device_id,boot,ticket)
);
ALTER TABLE honorpole_handover_r1.cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON honorpole_handover_r1.cancellations FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE honorpole_handover_r1.release_directives DROP CONSTRAINT release_directives_request_id_fkey;
ALTER TABLE honorpole_handover_r1.release_directives ADD FOREIGN KEY(request_id) REFERENCES honorpole_handover_r1.requests(id);
ALTER TABLE honorpole_handover_r1.release_directives ADD COLUMN outcome text NOT NULL DEFAULT 'transfer' CHECK(outcome IN('transfer','cancel'));

CREATE FUNCTION honorpole_handover_r1.expire_frozen(d text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE honorpole_handover_r1.requests r SET phase='cancel_requested'
 FROM honorpole_handover_r1.controls c WHERE c.device_id=d AND c.active_request=r.id
  AND r.device_id=d AND r.phase='quiescing' AND r.generation=c.generation AND r.expires_at<=clock_timestamp();
END $$;
CREATE FUNCTION honorpole_handover_r1.prepare_cancel(request uuid,h text,b text,t text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r honorpole_handover_r1.requests%rowtype;c honorpole_handover_r1.controls%rowtype;
 d honorpole_handover_r1.directives%rowtype;m jsonb;
BEGIN
 r:=honorpole_handover_r1.lock_request(request);
 PERFORM honorpole_handover_r1.device_auth(r.device_id,h);
 SELECT * INTO c FROM honorpole_handover_r1.controls WHERE device_id=r.device_id;
 IF r.phase<>'cancel_requested' OR c.active_request IS DISTINCT FROM r.id OR c.generation<>r.generation
  OR c.generation>=9007199254740991 THEN RAISE EXCEPTION 'Cancellation state changed' USING ERRCODE='HP409';END IF;
 PERFORM honorpole_handover_r1.assert_owner(r.device_id,r.initiator);
 SELECT * INTO d FROM honorpole_handover_r1.directives WHERE device_id=r.device_id AND boot=b AND ticket=t FOR UPDATE;
 IF NOT FOUND OR d.request_id<>r.id OR d.generation<>r.generation OR d.credential_hash IS DISTINCT FROM h
  OR d.ack_signature IS NULL OR d.acknowledged_at IS NULL OR d.acknowledged_at<clock_timestamp()-interval '2 minutes'
  OR d.acknowledged_at>clock_timestamp()
  OR EXISTS(SELECT 1 FROM honorpole_handover_r1.directives newer WHERE newer.device_id=r.device_id AND newer.issue_seq>d.issue_seq)
 THEN RAISE EXCEPTION 'Fresh cancellation proof required' USING ERRCODE='HP409';END IF;
 SELECT jsonb_agg(to_jsonb(u) ORDER BY u.user_id) INTO m FROM public.device_users u WHERE u.device_id=r.device_id;
 INSERT INTO honorpole_handover_r1.cancellations(request_id,device_id,owner_id,generation,next_generation,
  boot,ticket,credential_hash,proof_signature,proof_acknowledged_at,memberships)
 VALUES(r.id,r.device_id,r.initiator,r.generation,r.generation+1,b,t,h,d.ack_signature,d.acknowledged_at,m);
 UPDATE honorpole_handover_r1.controls SET generation=r.generation+1 WHERE device_id=r.device_id;
 UPDATE honorpole_handover_r1.requests SET phase='cancel_releasing' WHERE id=r.id;
 -- No membership, invitation, device identity or factory credential writes.
END $$;

ALTER FUNCTION public.honorpole_handover_issue_directive_r1(text,text,text,text,bigint) RENAME TO hp_handover_issue_transfer_r1;
REVOKE ALL ON FUNCTION public.hp_handover_issue_transfer_r1(text,text,text,text,bigint) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.honorpole_handover_issue_directive_r1(p_device text,p_secret_hash text,p_boot text,p_ticket text,p_deadline bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c honorpole_handover_r1.controls%rowtype;r honorpole_handover_r1.requests%rowtype;
 f honorpole_handover_r1.cancellations%rowtype;d honorpole_handover_r1.release_directives%rowtype;
BEGIN
 PERFORM honorpole_handover_r1.device_auth(p_device,p_secret_hash);
 PERFORM honorpole_handover_r1.expire_frozen(p_device);
 SELECT * INTO c FROM honorpole_handover_r1.controls WHERE device_id=p_device;
 SELECT * INTO r FROM honorpole_handover_r1.requests WHERE id=c.active_request AND device_id=p_device FOR UPDATE;
 IF r.phase IS DISTINCT FROM 'cancel_releasing' THEN
  RETURN public.hp_handover_issue_transfer_r1(p_device,p_secret_hash,p_boot,p_ticket,p_deadline);
 END IF;
 IF p_boot IS NULL OR p_boot !~ '^[0-9A-F]{32}$' OR p_ticket IS NULL OR p_ticket !~ '^[0-9A-F]{32}$'
 OR p_deadline IS NULL OR p_deadline<0 OR p_deadline>4294967295 THEN RAISE EXCEPTION 'Invalid challenge' USING ERRCODE='HP400';END IF;
 SELECT * INTO f FROM honorpole_handover_r1.cancellations WHERE request_id=r.id AND device_id=p_device;
 IF NOT FOUND OR c.generation<>f.next_generation OR r.generation<>f.generation OR f.credential_hash IS DISTINCT FROM p_secret_hash
 THEN RAISE EXCEPTION 'Cancellation state changed' USING ERRCODE='HP409';END IF;
 IF EXISTS(SELECT 1 FROM honorpole_handover_r1.directives WHERE device_id=p_device AND boot=p_boot AND ticket=p_ticket)
 THEN RAISE EXCEPTION 'Challenge reuse conflict' USING ERRCODE='HP409';END IF;
 SELECT * INTO d FROM honorpole_handover_r1.release_directives WHERE device_id=p_device AND boot=p_boot AND ticket=p_ticket;
 IF FOUND THEN
  IF d.outcome<>'cancel' OR d.request_id<>r.id OR d.generation<>f.generation OR d.next_generation<>f.next_generation
   OR d.deadline<>p_deadline OR d.credential_hash IS DISTINCT FROM p_secret_hash THEN
   RAISE EXCEPTION 'Challenge reuse conflict' USING ERRCODE='HP409';END IF;
 ELSE
  IF (SELECT count(*) FROM honorpole_handover_r1.directives WHERE device_id=p_device)+
   (SELECT count(*) FROM honorpole_handover_r1.release_directives WHERE device_id=p_device)>=1024 THEN
   RAISE EXCEPTION 'Directive capacity reached' USING ERRCODE='HP503';END IF;
  INSERT INTO honorpole_handover_r1.release_directives(device_id,boot,ticket,request_id,generation,next_generation,deadline,credential_hash,outcome)
  VALUES(p_device,p_boot,p_ticket,r.id,f.generation,f.next_generation,p_deadline,p_secret_hash,'cancel') RETURNING * INTO d;
 END IF;
 RETURN jsonb_build_object('deviceId',p_device,'directive',honorpole_handover_r1.release_view(d));
END $$;

ALTER FUNCTION public.honorpole_handover_record_ack_r1(text,text,jsonb) RENAME TO hp_handover_record_transfer_ack_r1;
REVOKE ALL ON FUNCTION public.hp_handover_record_transfer_ack_r1(text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.honorpole_handover_record_ack_r1(p_device text,p_secret_hash text,p_ack jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d honorpole_handover_r1.release_directives%rowtype;r honorpole_handover_r1.requests%rowtype;
 c honorpole_handover_r1.controls%rowtype;f honorpole_handover_r1.cancellations%rowtype;s text;
BEGIN
 PERFORM honorpole_handover_r1.device_auth(p_device,p_secret_hash);
 SELECT * INTO d FROM honorpole_handover_r1.release_directives WHERE device_id=p_device
  AND boot=p_ack->>'boot' AND ticket=p_ack->>'ticket' FOR UPDATE;
 IF p_ack->>'action' IS DISTINCT FROM 'RELEASE' OR d.outcome IS DISTINCT FROM 'cancel' THEN
  RETURN public.hp_handover_record_transfer_ack_r1(p_device,p_secret_hash,p_ack);
 END IF;
 s:=p_ack->>'signature';
 IF d.credential_hash IS DISTINCT FROM p_secret_hash OR s IS NULL OR s !~ '^[0-9A-F]{64}$'
  OR p_ack<>(honorpole_handover_r1.release_view(d)||jsonb_build_object('state','RELEASED','signature',s))
  OR (d.ack_signature IS NOT NULL AND d.ack_signature<>s)
 THEN RAISE EXCEPTION 'Cancellation acknowledgement conflict' USING ERRCODE='HP409';END IF;
 SELECT * INTO r FROM honorpole_handover_r1.requests WHERE id=d.request_id AND device_id=p_device FOR UPDATE;
 SELECT * INTO f FROM honorpole_handover_r1.cancellations WHERE request_id=d.request_id AND device_id=p_device;
 SELECT * INTO c FROM honorpole_handover_r1.controls WHERE device_id=p_device;
 IF r.id IS NULL OR f.request_id IS NULL OR f.generation<>d.generation OR f.next_generation<>d.next_generation
  OR f.credential_hash IS DISTINCT FROM p_secret_hash THEN RAISE EXCEPTION 'Cancellation proof changed' USING ERRCODE='HP409';END IF;
 IF r.phase='cancel_releasing' THEN
  IF c.active_request IS DISTINCT FROM r.id OR c.generation<>d.next_generation THEN
   RAISE EXCEPTION 'Cancellation gate changed' USING ERRCODE='HP409';END IF;
  -- Freeze guards exclude normal membership writers until this transaction opens.
  IF f.memberships IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(u) ORDER BY u.user_id) FROM public.device_users u WHERE u.device_id=p_device)
  THEN RAISE EXCEPTION 'Original access changed' USING ERRCODE='HP409';END IF;
  UPDATE honorpole_handover_r1.requests SET phase='cancelled' WHERE id=r.id;
  UPDATE honorpole_handover_r1.controls SET active_request=NULL WHERE device_id=p_device;
 ELSIF r.phase<>'cancelled' THEN RAISE EXCEPTION 'Cancellation state changed' USING ERRCODE='HP409';END IF;
 -- Terminal retries never touch a later request's gate, memberships or generation.
 UPDATE honorpole_handover_r1.release_directives SET acknowledged_at=COALESCE(acknowledged_at,clock_timestamp()),ack_signature=s
  WHERE device_id=p_device AND boot=d.boot AND ticket=d.ticket;
 RETURN jsonb_build_object('accepted',true,'deviceId',p_device,'boot',d.boot,'ticket',d.ticket,'signature',s);
END $$;

ALTER FUNCTION public.honorpole_handover_advance_ack_r1(text,text,jsonb) RENAME TO hp_handover_advance_transfer_r1;
REVOKE ALL ON FUNCTION public.hp_handover_advance_transfer_r1(text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.honorpole_handover_advance_ack_r1(p_device text,p_secret_hash text,p_ack jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;r honorpole_handover_r1.requests%rowtype;c honorpole_handover_r1.controls%rowtype;
BEGIN
 PERFORM honorpole_handover_r1.device_auth(p_device,p_secret_hash);
 PERFORM honorpole_handover_r1.expire_frozen(p_device);
 result:=public.hp_handover_advance_transfer_r1(p_device,p_secret_hash,p_ack);
 IF p_ack->>'action'='HOLD' THEN
  SELECT * INTO r FROM honorpole_handover_r1.requests WHERE id=(p_ack->>'requestId')::uuid AND device_id=p_device FOR UPDATE;
  SELECT * INTO c FROM honorpole_handover_r1.controls WHERE device_id=p_device;
  IF r.phase='cancel_requested' AND c.active_request=r.id THEN
   BEGIN
    PERFORM honorpole_handover_r1.prepare_cancel(r.id,p_secret_hash,p_ack->>'boot',p_ack->>'ticket');
   EXCEPTION WHEN SQLSTATE 'HP409' THEN RETURN result;END;
  END IF;
 END IF;
 RETURN result;
END $$;

ALTER FUNCTION public.honorpole_handover_cancel_r1(uuid) RENAME TO hp_handover_cancel_unprepared_r1;
REVOKE ALL ON FUNCTION public.hp_handover_cancel_unprepared_r1(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.honorpole_handover_cancel_r1(p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();r honorpole_handover_r1.requests%rowtype;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='HP401';END IF;
 r:=honorpole_handover_r1.lock_request(p_request);
 IF (u<>r.initiator AND u<>r.recipient) OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u)
 THEN RAISE EXCEPTION 'Handover participant required' USING ERRCODE='HP403';END IF;
 IF r.phase IN('cancel_releasing','cancelled','expired') THEN RETURN honorpole_handover_r1.view_request(r);END IF;
 RETURN public.hp_handover_cancel_unprepared_r1(p_request);
END $$;
REVOKE ALL ON FUNCTION honorpole_handover_r1.prepare_cancel(uuid,text,text,text),honorpole_handover_r1.expire_frozen(text)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.honorpole_handover_issue_directive_r1(text,text,text,text,bigint),
 public.honorpole_handover_record_ack_r1(text,text,jsonb),public.honorpole_handover_advance_ack_r1(text,text,jsonb),
 public.honorpole_handover_cancel_r1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.honorpole_handover_issue_directive_r1(text,text,text,text,bigint),
 public.honorpole_handover_record_ack_r1(text,text,jsonb),public.honorpole_handover_advance_ack_r1(text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.honorpole_handover_cancel_r1(uuid) TO authenticated;
COMMIT;
