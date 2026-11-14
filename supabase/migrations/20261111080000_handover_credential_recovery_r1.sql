-- Candidate only. Provisioning authority is separate from user/device/backend roles.
BEGIN;
CREATE ROLE honorpole_recovery_operator NOLOGIN NOINHERIT;
GRANT USAGE ON SCHEMA public TO honorpole_recovery_operator;
CREATE TABLE honorpole_handover_r1.credential_recoveries(
 recovery_id uuid PRIMARY KEY,device_id text NOT NULL,request_id uuid NOT NULL,
 request_generation bigint NOT NULL,control_generation bigint NOT NULL,phase text NOT NULL,
 installation_id uuid NOT NULL UNIQUE,installation_hash text NOT NULL,
 old_credential jsonb NOT NULL,new_credential jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(device_id,request_id) REFERENCES honorpole_handover_r1.requests(device_id,id)
);
CREATE TABLE honorpole_handover_r1.retired_credentials(
 device_id text NOT NULL,secret_hash text NOT NULL,
 recovery_id uuid NOT NULL REFERENCES honorpole_handover_r1.credential_recoveries(recovery_id),
 PRIMARY KEY(device_id,secret_hash)
);
CREATE TABLE honorpole_handover_r1.credential_permits(
 backend_pid integer NOT NULL,transaction_id bigint NOT NULL,device_id text NOT NULL,
 old_credential jsonb NOT NULL,new_credential jsonb NOT NULL,
 PRIMARY KEY(backend_pid,transaction_id,device_id)
);
ALTER TABLE honorpole_handover_r1.credential_recoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE honorpole_handover_r1.retired_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE honorpole_handover_r1.credential_permits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON honorpole_handover_r1.credential_recoveries,honorpole_handover_r1.retired_credentials,
 honorpole_handover_r1.credential_permits FROM PUBLIC,anon,authenticated,service_role,honorpole_recovery_operator;
CREATE FUNCTION honorpole_handover_r1.guard_factory_recovery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE before_device text;after_device text;d text;tightening boolean:=false;
BEGIN
 IF TG_OP IN('INSERT','UPDATE') THEN
  IF EXISTS(SELECT 1 FROM honorpole_handover_r1.retired_credentials k WHERE k.device_id=NEW.device_id AND k.secret_hash=NEW.secret_hash) THEN
   RAISE EXCEPTION 'Retired credential cannot be restored' USING ERRCODE='HP409';
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND EXISTS(
  SELECT 1 FROM honorpole_handover_r1.credential_permits p WHERE p.backend_pid=pg_backend_pid()
   AND p.transaction_id=txid_current() AND p.device_id=OLD.device_id AND p.device_id=NEW.device_id
   AND p.old_credential=to_jsonb(OLD) AND p.new_credential=to_jsonb(NEW)
 ) THEN RETURN NEW;END IF;
 IF TG_OP<>'INSERT' THEN before_device:=OLD.device_id;END IF;
 IF TG_OP<>'DELETE' THEN after_device:=NEW.device_id;END IF;
 IF TG_OP='UPDATE' THEN
  tightening:=NEW.revoked_at IS NOT NULL AND (to_jsonb(NEW)-'revoked_at')=(to_jsonb(OLD)-'revoked_at');
 END IF;
 FOR d IN SELECT DISTINCT x FROM unnest(ARRAY[before_device,after_device]) x WHERE x IS NOT NULL ORDER BY x LOOP
  PERFORM honorpole_handover_r1.writer_open(d,tightening);
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $$;
DROP TRIGGER hp_handover_factory_r1 ON public.honorpole_factory_credentials;
CREATE TRIGGER hp_handover_factory_r1 BEFORE INSERT OR UPDATE OR DELETE ON public.honorpole_factory_credentials
 FOR EACH ROW EXECUTE FUNCTION honorpole_handover_r1.guard_factory_recovery();
CREATE FUNCTION honorpole_handover_r1.release_key_allowed(request uuid,h text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM honorpole_handover_r1.finalizations f WHERE f.request_id=request AND f.credential_hash=h)
 OR EXISTS(SELECT 1 FROM honorpole_handover_r1.cancellations f WHERE f.request_id=request AND f.credential_hash=h)
 OR EXISTS(
  SELECT 1 FROM honorpole_handover_r1.credential_recoveries k
  JOIN honorpole_handover_r1.requests r ON r.id=k.request_id AND r.device_id=k.device_id
  WHERE k.request_id=request AND k.new_credential->>'secret_hash'=h AND k.request_generation=r.generation
 )
$$;
CREATE FUNCTION public.honorpole_handover_rekey_r1(p_recovery uuid,p_request uuid,p_expected_hash text,
 p_expected_factory_request uuid,p_new_hash text,p_installation_id uuid,p_installation_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r honorpole_handover_r1.requests%rowtype;c honorpole_handover_r1.controls%rowtype;
 k honorpole_handover_r1.credential_recoveries%rowtype;cred public.honorpole_factory_credentials%rowtype;
 before_record jsonb;after_record jsonb;
BEGIN
 IF p_recovery IS NULL OR p_request IS NULL OR p_expected_hash IS NULL OR p_expected_hash !~ '^[0-9a-f]{64}$'
  OR p_new_hash IS NULL OR p_new_hash !~ '^[0-9a-f]{64}$' OR p_installation_hash IS NULL OR p_installation_hash !~ '^[0-9a-f]{64}$'
  OR p_expected_factory_request IS NULL OR p_installation_id IS NULL OR p_new_hash=p_expected_hash
  OR p_installation_id=p_expected_factory_request THEN RAISE EXCEPTION 'Invalid recovery request' USING ERRCODE='HP400';END IF;
 r:=honorpole_handover_r1.lock_request(p_request);
 SELECT * INTO c FROM honorpole_handover_r1.controls WHERE device_id=r.device_id;
 SELECT * INTO cred FROM public.honorpole_factory_credentials WHERE device_id=r.device_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Enrolled credential required' USING ERRCODE='HP409';END IF;
 SELECT * INTO k FROM honorpole_handover_r1.credential_recoveries WHERE recovery_id=p_recovery;
 IF FOUND THEN
  IF k.request_id<>r.id OR k.device_id<>r.device_id OR k.old_credential->>'secret_hash'<>p_expected_hash
   OR k.old_credential->>'factory_request_id'<>p_expected_factory_request::text
   OR k.new_credential->>'secret_hash'<>p_new_hash OR k.installation_id<>p_installation_id
   OR k.installation_hash<>p_installation_hash OR to_jsonb(cred)<>k.new_credential
  THEN RAISE EXCEPTION 'Recovery retry conflict' USING ERRCODE='HP409';END IF;
  RETURN jsonb_build_object('recoveryId',k.recovery_id,'deviceId',k.device_id,'requestId',k.request_id,'rekeyed',true);
 END IF;
 IF c.active_request IS DISTINCT FROM r.id OR r.phase NOT IN('quiescing','cancel_requested','releasing','cancel_releasing')
  OR (r.phase IN('quiescing','cancel_requested') AND c.generation<>r.generation)
  OR (r.phase IN('releasing','cancel_releasing') AND c.generation<>r.generation+1)
 THEN RAISE EXCEPTION 'Frozen active handover required' USING ERRCODE='HP409';END IF;
 IF cred.secret_hash<>p_expected_hash OR cred.factory_request_id<>p_expected_factory_request
  OR EXISTS(SELECT 1 FROM honorpole_handover_r1.retired_credentials WHERE device_id=r.device_id AND secret_hash=p_new_hash)
  OR EXISTS(SELECT 1 FROM public.honorpole_factory_credentials WHERE factory_request_id=p_installation_id)
  OR EXISTS(SELECT 1 FROM honorpole_handover_r1.credential_recoveries WHERE installation_id=p_installation_id)
 THEN RAISE EXCEPTION 'Credential changed or retired' USING ERRCODE='HP409';END IF;
 before_record:=to_jsonb(cred);
 after_record:=before_record||jsonb_build_object('secret_hash',p_new_hash,'revoked_at',NULL);
 INSERT INTO honorpole_handover_r1.credential_recoveries(recovery_id,device_id,request_id,request_generation,control_generation,phase,installation_id,installation_hash,old_credential,new_credential)
 VALUES(p_recovery,r.device_id,r.id,r.generation,c.generation,r.phase,p_installation_id,p_installation_hash,before_record,after_record);
 INSERT INTO honorpole_handover_r1.retired_credentials VALUES(r.device_id,p_expected_hash,p_recovery);
 INSERT INTO honorpole_handover_r1.credential_permits VALUES(pg_backend_pid(),txid_current(),r.device_id,before_record,after_record);
 UPDATE public.honorpole_factory_credentials SET secret_hash=p_new_hash,revoked_at=NULL WHERE device_id=r.device_id;
 DELETE FROM honorpole_handover_r1.credential_permits WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND device_id=r.device_id;
 RETURN jsonb_build_object('recoveryId',p_recovery,'deviceId',r.device_id,'requestId',r.id,'rekeyed',true);
END $$;
REVOKE ALL ON FUNCTION public.honorpole_handover_rekey_r1(uuid,uuid,text,uuid,text,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role,honorpole_recovery_operator;
GRANT EXECUTE ON FUNCTION public.honorpole_handover_rekey_r1(uuid,uuid,text,uuid,text,uuid,text) TO honorpole_recovery_operator;
REVOKE ALL ON FUNCTION honorpole_handover_r1.guard_factory_recovery(),honorpole_handover_r1.release_key_allowed(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role,honorpole_recovery_operator;
-- Updated RELEASE routines below consult the trusted replacement audit while
-- keeping original ownership/cancellation proof immutable.

CREATE OR REPLACE FUNCTION public.hp_handover_issue_transfer_r1(p_device text,p_secret_hash text,p_boot text,p_ticket text,p_deadline bigint)
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
  OR NOT honorpole_handover_r1.release_key_allowed(r.id,p_secret_hash) THEN RAISE EXCEPTION 'Handover state changed' USING ERRCODE='HP409';END IF;
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
CREATE OR REPLACE FUNCTION public.hp_handover_record_transfer_ack_r1(p_device text,p_secret_hash text,p_ack jsonb)
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
  OR NOT honorpole_handover_r1.release_key_allowed(r.id,p_secret_hash) THEN RAISE EXCEPTION 'Finalization changed' USING ERRCODE='HP409';END IF;
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
CREATE OR REPLACE FUNCTION public.honorpole_handover_issue_directive_r1(p_device text,p_secret_hash text,p_boot text,p_ticket text,p_deadline bigint)
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
 IF NOT FOUND OR c.generation<>f.next_generation OR r.generation<>f.generation OR NOT honorpole_handover_r1.release_key_allowed(r.id,p_secret_hash)
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
CREATE OR REPLACE FUNCTION public.honorpole_handover_record_ack_r1(p_device text,p_secret_hash text,p_ack jsonb)
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
  OR NOT honorpole_handover_r1.release_key_allowed(r.id,p_secret_hash) THEN RAISE EXCEPTION 'Cancellation proof changed' USING ERRCODE='HP409';END IF;
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
COMMIT;
