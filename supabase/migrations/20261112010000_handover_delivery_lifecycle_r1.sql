-- Candidate only. Durable issuance journals are not a lifetime delivery quota.
-- One current delivery slot per device, with original proof/receipt rows retained.
BEGIN;
CREATE TABLE honorpole_handover_r1.delivery_slots(
 device_id text PRIMARY KEY REFERENCES public.devices(device_id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN('HOLD','RELEASE')),
 boot text NOT NULL CHECK(boot ~ '^[0-9A-F]{32}$'),
 ticket text NOT NULL CHECK(ticket ~ '^[0-9A-F]{32}$'),
 selected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(device_id,request_id) REFERENCES honorpole_handover_r1.requests(device_id,id)
);
ALTER TABLE honorpole_handover_r1.delivery_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON honorpole_handover_r1.delivery_slots FROM PUBLIC,anon,authenticated,service_role,honorpole_recovery_operator;
COMMENT ON TABLE honorpole_handover_r1.delivery_slots IS
 'Bounded current delivery working set: at most one slot per device. Issuance/proof/receipt journals remain durable and grow with audited history; this is not a bound on audit storage.';
CREATE FUNCTION honorpole_handover_r1.remember_delivery(p_device text,p_request uuid,p_action text,p_boot text,p_ticket text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Caller holds device/controls/request locks and has just validated/inserted issuance.
 INSERT INTO honorpole_handover_r1.delivery_slots(device_id,request_id,action,boot,ticket)
 VALUES(p_device,p_request,p_action,p_boot,p_ticket)
 ON CONFLICT(device_id) DO UPDATE SET request_id=EXCLUDED.request_id,action=EXCLUDED.action,
 boot=EXCLUDED.boot,ticket=EXCLUDED.ticket,selected_at=clock_timestamp();
END $$;
CREATE FUNCTION honorpole_handover_r1.clear_finished_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 DELETE FROM honorpole_handover_r1.delivery_slots s WHERE s.device_id=NEW.device_id
  AND s.request_id IS DISTINCT FROM NEW.active_request;
 RETURN NEW;
END $$;
CREATE TRIGGER hp_handover_delivery_finished_r1 AFTER UPDATE OF active_request
 ON honorpole_handover_r1.controls FOR EACH ROW EXECUTE FUNCTION honorpole_handover_r1.clear_finished_delivery();
REVOKE ALL ON FUNCTION honorpole_handover_r1.remember_delivery(text,uuid,text,text,text),
 honorpole_handover_r1.clear_finished_delivery() FROM PUBLIC,anon,authenticated,service_role,honorpole_recovery_operator;

-- Adopt existing frozen candidate state without rewriting proof or receipt data.
INSERT INTO honorpole_handover_r1.delivery_slots(device_id,request_id,action,boot,ticket)
SELECT c.device_id,c.active_request,x.action,x.boot,x.ticket
FROM honorpole_handover_r1.controls c JOIN honorpole_handover_r1.requests r ON r.id=c.active_request AND r.device_id=c.device_id
CROSS JOIN LATERAL (
 SELECT 'HOLD'::text AS action,d.boot,d.ticket,d.issued_at,d.issue_seq FROM honorpole_handover_r1.directives d
 WHERE d.device_id=c.device_id AND d.request_id=c.active_request AND r.phase IN('quiescing','cancel_requested')
 UNION ALL
 SELECT 'RELEASE',d.boot,d.ticket,d.issued_at,0::bigint FROM honorpole_handover_r1.release_directives d
 WHERE d.device_id=c.device_id AND d.request_id=c.active_request AND r.phase IN('releasing','cancel_releasing')
 ORDER BY issue_seq DESC,issued_at DESC,boot DESC,ticket DESC LIMIT 1
) x;

CREATE OR REPLACE FUNCTION public.honorpole_handover_issue_hold_r1(p_device text,p_secret_hash text,p_boot text,p_ticket text,p_deadline bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c honorpole_handover_r1.controls%rowtype;r honorpole_handover_r1.requests%rowtype;
 d honorpole_handover_r1.directives%rowtype;
BEGIN
 PERFORM honorpole_handover_r1.device_auth(p_device,p_secret_hash);
 IF p_boot IS NULL OR p_boot !~ '^[0-9A-F]{32}$' OR p_ticket IS NULL OR p_ticket !~ '^[0-9A-F]{32}$'
 OR p_deadline IS NULL OR p_deadline<0 OR p_deadline>4294967295 THEN
  RAISE EXCEPTION 'Invalid challenge' USING ERRCODE='HP400';END IF;
 SELECT * INTO c FROM honorpole_handover_r1.controls WHERE device_id=p_device;
 IF c.active_request IS NULL THEN RETURN jsonb_build_object('deviceId',p_device,'directive',NULL);END IF;
 SELECT * INTO r FROM honorpole_handover_r1.requests WHERE id=c.active_request AND device_id=p_device FOR UPDATE;
 IF NOT FOUND OR r.phase NOT IN('quiescing','cancel_requested') OR r.generation<>c.generation OR c.generation>9007199254740991
 THEN RAISE EXCEPTION 'Handover state changed' USING ERRCODE='HP409';END IF;
 IF EXISTS(SELECT 1 FROM honorpole_handover_r1.release_directives WHERE device_id=p_device AND boot=p_boot AND ticket=p_ticket)
 THEN RAISE EXCEPTION 'Challenge reuse conflict' USING ERRCODE='HP409';END IF;
 SELECT * INTO d FROM honorpole_handover_r1.directives WHERE device_id=p_device AND boot=p_boot AND ticket=p_ticket;
 IF FOUND THEN
  IF d.request_id<>r.id OR d.generation<>c.generation OR d.deadline<>p_deadline OR d.credential_hash IS DISTINCT FROM p_secret_hash
  THEN RAISE EXCEPTION 'Challenge reuse conflict' USING ERRCODE='HP409';END IF;
 ELSE
  INSERT INTO honorpole_handover_r1.directives(device_id,boot,ticket,request_id,generation,deadline,credential_hash)
  VALUES(p_device,p_boot,p_ticket,r.id,c.generation,p_deadline,p_secret_hash) RETURNING * INTO d;
  PERFORM honorpole_handover_r1.remember_delivery(p_device,r.id,'HOLD',p_boot,p_ticket);
 END IF;
 RETURN jsonb_build_object('deviceId',p_device,'directive',honorpole_handover_r1.directive_view(d));
END $$;
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
  PERFORM honorpole_handover_r1.remember_delivery(p_device,r.id,'RELEASE',p_boot,p_ticket);
 END IF;
 RETURN jsonb_build_object('deviceId',p_device,'directive',honorpole_handover_r1.release_view(d));
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
  INSERT INTO honorpole_handover_r1.release_directives(device_id,boot,ticket,request_id,generation,next_generation,deadline,credential_hash,outcome)
  VALUES(p_device,p_boot,p_ticket,r.id,f.generation,f.next_generation,p_deadline,p_secret_hash,'cancel') RETURNING * INTO d;
  PERFORM honorpole_handover_r1.remember_delivery(p_device,r.id,'RELEASE',p_boot,p_ticket);
 END IF;
 RETURN jsonb_build_object('deviceId',p_device,'directive',honorpole_handover_r1.release_view(d));
END $$;

-- Existing ACK validators deliberately keep their exact issuance, credential,
-- request, generation, immutable proof and terminal-retry checks. A valid late
-- ACK may finish its own still-active request; it cannot thaw a subsequent one.
-- Slots are delivery bookkeeping, never replacement authorization or a gate.
-- The completion trigger runs in the same transaction; ACK failure restores it.
REVOKE ALL ON FUNCTION public.hp_handover_issue_transfer_r1(text,text,text,text,bigint)
 FROM PUBLIC,anon,authenticated,service_role,honorpole_recovery_operator;
REVOKE ALL ON FUNCTION public.honorpole_handover_issue_hold_r1(text,text,text,text,bigint),
 public.honorpole_handover_issue_directive_r1(text,text,text,text,bigint)
 FROM PUBLIC,anon,authenticated,service_role,honorpole_recovery_operator;
GRANT EXECUTE ON FUNCTION public.honorpole_handover_issue_hold_r1(text,text,text,text,bigint),
 public.honorpole_handover_issue_directive_r1(text,text,text,text,bigint) TO service_role;
COMMIT;
