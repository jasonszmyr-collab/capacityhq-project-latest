-- Local candidate only. Database commit is not controller RELEASE/completion.
BEGIN;
ALTER TABLE honorpole_handover_r1.requests DROP CONSTRAINT requests_phase_check;
ALTER TABLE honorpole_handover_r1.requests ADD CONSTRAINT requests_phase_check
 CHECK(phase IN('offered','accepted','quiescing','cancel_requested','cancelled','expired','releasing','completed'));
DROP INDEX honorpole_handover_r1.one_pending_request_per_device;
CREATE UNIQUE INDEX one_pending_request_per_device ON honorpole_handover_r1.requests(device_id)
 WHERE phase IN('offered','accepted','quiescing','cancel_requested','releasing');

-- Old evidence deliberately remains unbound and cannot authorize finalization.
ALTER TABLE honorpole_handover_r1.directives
 ADD COLUMN credential_hash text CHECK(credential_hash ~ '^[0-9a-f]{64}$'),
 ADD COLUMN issue_seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE;

ALTER FUNCTION public.honorpole_handover_issue_hold_r1(text,text,text,text,bigint)
 RENAME TO hp_handover_issue_hold_unbound_r1;
REVOKE ALL ON FUNCTION public.hp_handover_issue_hold_unbound_r1(text,text,text,text,bigint)
 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.honorpole_handover_issue_hold_r1(p_device text,p_secret_hash text,p_boot text,p_ticket text,p_deadline bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; d honorpole_handover_r1.directives%rowtype;
BEGIN
 PERFORM honorpole_handover_r1.device_auth(p_device,p_secret_hash);
 SELECT * INTO d FROM honorpole_handover_r1.directives WHERE device_id=p_device AND boot=p_boot AND ticket=p_ticket;
 IF FOUND AND d.credential_hash IS DISTINCT FROM p_secret_hash THEN
  RAISE EXCEPTION 'Credential-bound challenge required' USING ERRCODE='HP409';
 END IF;
 result:=public.hp_handover_issue_hold_unbound_r1(p_device,p_secret_hash,p_boot,p_ticket,p_deadline);
 IF result->'directive'<>'null'::jsonb THEN
  UPDATE honorpole_handover_r1.directives SET credential_hash=p_secret_hash
   WHERE device_id=p_device AND boot=p_boot AND ticket=p_ticket AND credential_hash IS NULL;
 END IF;
 RETURN result;
END $$;
ALTER FUNCTION public.honorpole_handover_record_quiesced_r1(text,text,jsonb)
 RENAME TO hp_handover_record_quiesced_unbound_r1;
REVOKE ALL ON FUNCTION public.hp_handover_record_quiesced_unbound_r1(text,text,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.honorpole_handover_record_quiesced_r1(p_device text,p_secret_hash text,p_ack jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d honorpole_handover_r1.directives%rowtype;
BEGIN
 PERFORM honorpole_handover_r1.device_auth(p_device,p_secret_hash);
 SELECT * INTO d FROM honorpole_handover_r1.directives WHERE device_id=p_device
  AND boot=p_ack->>'boot' AND ticket=p_ack->>'ticket' FOR UPDATE;
 IF NOT FOUND OR d.credential_hash IS DISTINCT FROM p_secret_hash THEN
  RAISE EXCEPTION 'Credential-bound challenge required' USING ERRCODE='HP409';
 END IF;
 -- The trusted HTTP verifier still verifies the MAC before calling this RPC.
 RETURN public.hp_handover_record_quiesced_unbound_r1(p_device,p_secret_hash,p_ack);
END $$;

CREATE TABLE honorpole_handover_r1.finalizer_permits(
 backend_pid integer NOT NULL,transaction_id bigint NOT NULL,device_id text NOT NULL,
 request_id uuid NOT NULL,recipient uuid NOT NULL,generation bigint NOT NULL,
 PRIMARY KEY(backend_pid,transaction_id,device_id)
);
CREATE TABLE honorpole_handover_r1.finalizations(
 request_id uuid PRIMARY KEY REFERENCES honorpole_handover_r1.requests(id),
 device_id text NOT NULL,previous_owner uuid NOT NULL,new_owner uuid NOT NULL,
 generation bigint NOT NULL,next_generation bigint NOT NULL,
 boot text NOT NULL,ticket text NOT NULL,credential_hash text NOT NULL,
 proof_signature text NOT NULL,proof_acknowledged_at timestamptz NOT NULL,
 committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(device_id,boot,ticket) REFERENCES honorpole_handover_r1.directives(device_id,boot,ticket)
);
ALTER TABLE honorpole_handover_r1.finalizer_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE honorpole_handover_r1.finalizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON honorpole_handover_r1.finalizer_permits,honorpole_handover_r1.finalizations
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION honorpole_handover_r1.finalizer_write_allowed(d text,t text,op text,u uuid,role_name text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
  SELECT 1 FROM honorpole_handover_r1.finalizer_permits p
  JOIN honorpole_handover_r1.controls c ON c.device_id=p.device_id AND c.active_request=p.request_id AND c.generation=p.generation
  JOIN honorpole_handover_r1.requests r ON r.id=p.request_id AND r.device_id=p.device_id AND r.recipient=p.recipient AND r.phase='quiescing'
  WHERE p.backend_pid=pg_backend_pid() AND p.transaction_id=txid_current() AND p.device_id=d
  AND ((t='device_users' AND (op='DELETE' OR (op='INSERT' AND u=p.recipient AND role_name='admin')))
    OR (t='honorpole_shares' AND op='DELETE'))
 )
$$;
CREATE OR REPLACE FUNCTION honorpole_handover_r1.guard_related_writer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE before_device text;after_device text;d text;tightening boolean:=false;allowed boolean;
BEGIN
 IF TG_OP<>'INSERT' THEN before_device:=OLD.device_id;END IF;
 IF TG_OP<>'DELETE' THEN after_device:=NEW.device_id;END IF;
 IF TG_TABLE_NAME='honorpole_factory_credentials' AND TG_OP='UPDATE' THEN
  tightening:=NEW.revoked_at IS NOT NULL AND (to_jsonb(NEW)-'revoked_at')=(to_jsonb(OLD)-'revoked_at');
 END IF;
 FOR d IN SELECT DISTINCT x FROM unnest(ARRAY[before_device,after_device]) x WHERE x IS NOT NULL ORDER BY x LOOP
  allowed:=false;
  IF TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME='device_users' THEN
   IF TG_OP='INSERT' THEN
    allowed:=honorpole_handover_r1.finalizer_write_allowed(d,TG_TABLE_NAME,TG_OP,NEW.user_id,NEW.role);
   ELSIF TG_OP='DELETE' THEN
    allowed:=honorpole_handover_r1.finalizer_write_allowed(d,TG_TABLE_NAME,TG_OP,NULL,NULL);
   END IF;
  ELSIF TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME='honorpole_shares' AND TG_OP='DELETE' THEN
   allowed:=honorpole_handover_r1.finalizer_write_allowed(d,TG_TABLE_NAME,TG_OP,NULL,NULL);
  END IF;
  IF NOT allowed THEN PERFORM honorpole_handover_r1.writer_open(d,tightening);END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION honorpole_handover_r1.finalization_view(f honorpole_handover_r1.finalizations)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('requestId',(f).request_id,'deviceId',(f).device_id,
  'newOwner',(f).new_owner,'generation',(f).generation,'nextGeneration',(f).next_generation,
  'phase','releasing','frozen',true,'committedAt',(f).committed_at)
$$;

CREATE FUNCTION public.honorpole_handover_finalize_r1(p_request uuid,p_secret_hash text,p_boot text,p_ticket text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r honorpole_handover_r1.requests%rowtype;c honorpole_handover_r1.controls%rowtype;
 d honorpole_handover_r1.directives%rowtype;f honorpole_handover_r1.finalizations%rowtype;
BEGIN
 r:=honorpole_handover_r1.lock_request(p_request);
 PERFORM honorpole_handover_r1.device_auth(r.device_id,p_secret_hash);
 SELECT * INTO c FROM honorpole_handover_r1.controls WHERE device_id=r.device_id;
 SELECT * INTO f FROM honorpole_handover_r1.finalizations WHERE request_id=r.id;
 IF FOUND THEN
  IF f.boot IS DISTINCT FROM p_boot OR f.ticket IS DISTINCT FROM p_ticket OR f.credential_hash IS DISTINCT FROM p_secret_hash
   OR r.phase<>'releasing' OR c.active_request IS DISTINCT FROM r.id OR c.generation<>f.next_generation THEN
   RAISE EXCEPTION 'Finalization retry conflict' USING ERRCODE='HP409';
  END IF;
  -- Return the durable original receipt. Never remove memberships on a retry.
  RETURN honorpole_handover_r1.finalization_view(f);
 END IF;
 IF r.phase<>'quiescing' OR c.active_request IS DISTINCT FROM r.id OR c.generation<>r.generation
  OR c.generation>=9007199254740991 THEN RAISE EXCEPTION 'Handover state changed' USING ERRCODE='HP409';END IF;
 IF r.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Consent expired' USING ERRCODE='HP410';END IF;
 PERFORM honorpole_handover_r1.assert_owner(r.device_id,r.initiator);
 -- Account deletion uses the parent-device lock and may deadlock/retry; it
 -- cannot race a committed removal of the recipient into this transaction.
 PERFORM 1 FROM auth.users WHERE id=r.recipient FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recipient unavailable' USING ERRCODE='HP404';END IF;
 SELECT * INTO d FROM honorpole_handover_r1.directives WHERE device_id=r.device_id AND boot=p_boot AND ticket=p_ticket FOR UPDATE;
 IF NOT FOUND OR d.request_id<>r.id OR d.generation<>r.generation OR d.credential_hash IS DISTINCT FROM p_secret_hash
  OR d.ack_signature IS NULL OR d.acknowledged_at IS NULL
  OR d.acknowledged_at<clock_timestamp()-interval '2 minutes' OR d.acknowledged_at>clock_timestamp()
  OR EXISTS(SELECT 1 FROM honorpole_handover_r1.directives newer WHERE newer.device_id=r.device_id AND newer.issue_seq>d.issue_seq)
 THEN RAISE EXCEPTION 'Fresh current credential-bound proof required' USING ERRCODE='HP409';END IF;
 INSERT INTO honorpole_handover_r1.finalizer_permits VALUES(pg_backend_pid(),txid_current(),r.device_id,r.id,r.recipient,r.generation);
 DELETE FROM public.honorpole_shares WHERE device_id=r.device_id;
 DELETE FROM public.device_users WHERE device_id=r.device_id;
 INSERT INTO public.device_users(device_id,user_id,role) VALUES(r.device_id,r.recipient,'admin');
 DELETE FROM honorpole_handover_r1.finalizer_permits
  WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND device_id=r.device_id;
 UPDATE honorpole_handover_r1.controls SET generation=r.generation+1 WHERE device_id=r.device_id;
 UPDATE honorpole_handover_r1.requests SET phase='releasing' WHERE id=r.id;
 INSERT INTO honorpole_handover_r1.finalizations(request_id,device_id,previous_owner,new_owner,generation,next_generation,
  boot,ticket,credential_hash,proof_signature,proof_acknowledged_at)
 VALUES(r.id,r.device_id,r.initiator,r.recipient,r.generation,r.generation+1,d.boot,d.ticket,p_secret_hash,d.ack_signature,d.acknowledged_at)
 RETURNING * INTO f;
 RETURN honorpole_handover_r1.finalization_view(f);
END $$;
REVOKE ALL ON FUNCTION honorpole_handover_r1.finalizer_write_allowed(text,text,text,uuid,text),
 honorpole_handover_r1.finalization_view(honorpole_handover_r1.finalizations)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.honorpole_handover_finalize_r1(uuid,text,text,text),
 public.honorpole_handover_issue_hold_r1(text,text,text,text,bigint),
 public.honorpole_handover_record_quiesced_r1(text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.honorpole_handover_finalize_r1(uuid,text,text,text),
 public.honorpole_handover_issue_hold_r1(text,text,text,text,bigint),
 public.honorpole_handover_record_quiesced_r1(text,text,jsonb) TO service_role;
-- App confirmation remains revoked. No gate reopening or RELEASE RPC is added.
COMMIT;
