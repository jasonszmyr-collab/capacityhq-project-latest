-- Candidate only: consent and persistent share gate. No ownership finalizer.
BEGIN;
CREATE SCHEMA honorpole_handover_r1;
REVOKE ALL ON SCHEMA honorpole_handover_r1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE honorpole_handover_r1.requests(
 id uuid PRIMARY KEY,
 device_id text NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
 initiator uuid NOT NULL, recipient uuid NOT NULL CHECK(recipient<>initiator),
 generation bigint NOT NULL CHECK(generation>=0),
 phase text NOT NULL CHECK(phase IN('offered','accepted','quiescing','cancel_requested','cancelled','expired')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 UNIQUE(device_id,id)
);
CREATE UNIQUE INDEX one_pending_request_per_device ON honorpole_handover_r1.requests(device_id)
 WHERE phase IN('offered','accepted','quiescing','cancel_requested');
CREATE TABLE honorpole_handover_r1.controls(
 device_id text PRIMARY KEY REFERENCES public.devices(device_id) ON DELETE CASCADE,
 generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0),
 active_request uuid,
 FOREIGN KEY(device_id,active_request) REFERENCES honorpole_handover_r1.requests(device_id,id)
);
ALTER TABLE honorpole_handover_r1.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE honorpole_handover_r1.controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA honorpole_handover_r1 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION honorpole_handover_r1.lock_device(d text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.devices WHERE device_id=d AND active AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active device required' USING ERRCODE='HP404'; END IF;
 INSERT INTO honorpole_handover_r1.controls(device_id) VALUES(d) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM honorpole_handover_r1.controls WHERE device_id=d FOR UPDATE;
END $$;
CREATE FUNCTION honorpole_handover_r1.assert_open(d text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Caller must already hold the device lock. No expiry reopens a frozen gate.
 IF EXISTS(SELECT 1 FROM honorpole_handover_r1.controls WHERE device_id=d AND active_request IS NOT NULL) THEN
  RAISE EXCEPTION 'Ownership handover is in progress' USING ERRCODE='HP409';
 END IF;
END $$;
CREATE FUNCTION honorpole_handover_r1.assert_owner(d text,u uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.device_users WHERE device_id=d AND user_id=u AND role='admin' FOR SHARE;
 IF NOT FOUND OR (SELECT count(*) FROM public.device_users WHERE device_id=d AND role='admin')<>1
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u) THEN
  RAISE EXCEPTION 'Single current owner required' USING ERRCODE='HP403';
 END IF;
END $$;
CREATE FUNCTION honorpole_handover_r1.lock_request(request uuid)
RETURNS honorpole_handover_r1.requests LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d text; r honorpole_handover_r1.requests%rowtype;
BEGIN
 SELECT device_id INTO d FROM honorpole_handover_r1.requests WHERE id=request;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='HP404'; END IF;
 PERFORM honorpole_handover_r1.lock_device(d);
 SELECT * INTO r FROM honorpole_handover_r1.requests WHERE id=request FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='HP404'; END IF;
 RETURN r;
END $$;
CREATE FUNCTION honorpole_handover_r1.view_request(r honorpole_handover_r1.requests)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('requestId',(r).id,'deviceId',(r).device_id,'initiator',(r).initiator,
  'recipient',(r).recipient,'generation',(r).generation,'phase',(r).phase,'expiresAt',(r).expires_at,
  'frozen',EXISTS(SELECT 1 FROM honorpole_handover_r1.controls WHERE device_id=(r).device_id AND active_request=(r).id))
$$;

CREATE FUNCTION public.honorpole_handover_offer_r1(p_request uuid,p_device text,p_recipient uuid,p_generation bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();g bigint;r honorpole_handover_r1.requests%rowtype;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='HP401';END IF;
 IF p_request IS NULL OR p_device IS NULL OR p_device !~ '^HP-[0-9]{3,6}$' OR p_generation IS NULL OR p_generation<0
 OR p_recipient IS NULL OR p_recipient=u THEN RAISE EXCEPTION 'Invalid handover offer' USING ERRCODE='HP400';END IF;
 PERFORM honorpole_handover_r1.lock_device(p_device);
 PERFORM honorpole_handover_r1.assert_owner(p_device,u);
 SELECT generation INTO g FROM honorpole_handover_r1.controls WHERE device_id=p_device;
 IF g<>p_generation THEN RAISE EXCEPTION 'Ownership generation changed' USING ERRCODE='HP409';END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_recipient) THEN RAISE EXCEPTION 'Recipient unavailable' USING ERRCODE='HP404';END IF;
 SELECT * INTO r FROM honorpole_handover_r1.requests WHERE id=p_request FOR UPDATE;
 IF FOUND THEN
  IF r.device_id<>p_device OR r.initiator<>u OR r.recipient<>p_recipient OR r.generation<>g THEN
   RAISE EXCEPTION 'Request identity conflict' USING ERRCODE='HP409';END IF;
  RETURN honorpole_handover_r1.view_request(r);
 END IF;
 PERFORM honorpole_handover_r1.assert_open(p_device);
 UPDATE honorpole_handover_r1.requests SET phase='expired' WHERE device_id=p_device
  AND phase IN('offered','accepted') AND expires_at<=clock_timestamp();
 IF EXISTS(SELECT 1 FROM honorpole_handover_r1.requests WHERE device_id=p_device AND phase IN('offered','accepted','quiescing','cancel_requested')) THEN
  RAISE EXCEPTION 'Another handover is pending' USING ERRCODE='HP409';END IF;
 INSERT INTO honorpole_handover_r1.requests(id,device_id,initiator,recipient,generation,phase,expires_at)
 VALUES(p_request,p_device,u,p_recipient,g,'offered',clock_timestamp()+interval '15 minutes') RETURNING * INTO r;
 RETURN honorpole_handover_r1.view_request(r);
END $$;

CREATE FUNCTION public.honorpole_handover_accept_r1(p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();r honorpole_handover_r1.requests%rowtype;g bigint;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='HP401';END IF;
 r:=honorpole_handover_r1.lock_request(p_request);
 IF u<>r.recipient OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u) THEN RAISE EXCEPTION 'Named recipient required' USING ERRCODE='HP403';END IF;
 PERFORM honorpole_handover_r1.assert_owner(r.device_id,r.initiator);
 SELECT generation INTO g FROM honorpole_handover_r1.controls WHERE device_id=r.device_id;
 IF g<>r.generation THEN RAISE EXCEPTION 'Ownership generation changed' USING ERRCODE='HP409';END IF;
 PERFORM honorpole_handover_r1.assert_open(r.device_id);
 IF r.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Offer expired' USING ERRCODE='HP410';END IF;
 IF r.phase NOT IN('offered','accepted') THEN RAISE EXCEPTION 'Invalid handover state' USING ERRCODE='HP409';END IF;
 UPDATE honorpole_handover_r1.requests SET phase='accepted' WHERE id=p_request RETURNING * INTO r;
 RETURN honorpole_handover_r1.view_request(r);
END $$;

CREATE FUNCTION public.honorpole_handover_confirm_r1(p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();r honorpole_handover_r1.requests%rowtype;g bigint;active uuid;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='HP401';END IF;
 r:=honorpole_handover_r1.lock_request(p_request);
 IF u<>r.initiator THEN RAISE EXCEPTION 'Initiating owner required' USING ERRCODE='HP403';END IF;
 PERFORM honorpole_handover_r1.assert_owner(r.device_id,u);
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=r.recipient) THEN RAISE EXCEPTION 'Recipient unavailable' USING ERRCODE='HP404';END IF;
 SELECT generation,active_request INTO g,active FROM honorpole_handover_r1.controls WHERE device_id=r.device_id;
 IF g<>r.generation THEN RAISE EXCEPTION 'Ownership generation changed' USING ERRCODE='HP409';END IF;
 IF r.phase='quiescing' AND active=r.id THEN RETURN honorpole_handover_r1.view_request(r);END IF;
 PERFORM honorpole_handover_r1.assert_open(r.device_id);
 IF r.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Offer expired' USING ERRCODE='HP410';END IF;
 IF r.phase<>'accepted' THEN RAISE EXCEPTION 'Recipient acceptance required' USING ERRCODE='HP409';END IF;
 UPDATE honorpole_handover_r1.controls SET active_request=r.id WHERE device_id=r.device_id;
 UPDATE honorpole_handover_r1.requests SET phase='quiescing' WHERE id=p_request RETURNING * INTO r;
 RETURN honorpole_handover_r1.view_request(r);
END $$;

CREATE FUNCTION public.honorpole_handover_cancel_r1(p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();r honorpole_handover_r1.requests%rowtype;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='HP401';END IF;
 r:=honorpole_handover_r1.lock_request(p_request);
 IF u<>r.initiator AND u<>r.recipient THEN RAISE EXCEPTION 'Handover participant required' USING ERRCODE='HP403';END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u) THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='HP403';END IF;
 IF r.phase IN('offered','accepted') THEN
  UPDATE honorpole_handover_r1.requests SET phase='cancelled' WHERE id=p_request RETURNING * INTO r;
 ELSIF r.phase='quiescing' THEN
  -- Device may have received the barrier. Keep the durable gate until a later
  -- verified recovery/release workflow resolves it; cancellation never thaws it.
  UPDATE honorpole_handover_r1.requests SET phase='cancel_requested' WHERE id=p_request RETURNING * INTO r;
 ELSIF r.phase NOT IN('cancelled','cancel_requested') THEN
  RAISE EXCEPTION 'Invalid handover state' USING ERRCODE='HP409';
 END IF;
 RETURN honorpole_handover_r1.view_request(r);
END $$;

CREATE FUNCTION public.honorpole_handover_status_r1(p_request uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();r honorpole_handover_r1.requests%rowtype;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='HP401';END IF;
 SELECT * INTO r FROM honorpole_handover_r1.requests WHERE id=p_request;
 IF NOT FOUND OR (u<>r.initiator AND u<>r.recipient) OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u) THEN
  RAISE EXCEPTION 'Request not found' USING ERRCODE='HP404';END IF;
 RETURN honorpole_handover_r1.view_request(r);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA honorpole_handover_r1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.honorpole_handover_offer_r1(uuid,text,uuid,bigint),
 public.honorpole_handover_accept_r1(uuid),public.honorpole_handover_confirm_r1(uuid),
 public.honorpole_handover_cancel_r1(uuid),public.honorpole_handover_status_r1(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.honorpole_handover_offer_r1(uuid,text,uuid,bigint),
 public.honorpole_handover_accept_r1(uuid),public.honorpole_handover_confirm_r1(uuid),
 public.honorpole_handover_cancel_r1(uuid),public.honorpole_handover_status_r1(uuid) TO authenticated;

-- Gate the two cooperating device-first share writers.
CREATE OR REPLACE FUNCTION public.honorpole_create_share_r1(p_device_id text,p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); expires timestamptz;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='HP401'; END IF;
 IF p_device_id IS NULL OR p_device_id !~ '^HP-[0-9]{3,6}$' OR
    p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'Invalid share request' USING ERRCODE='HP400';
 END IF;
 -- All cooperating ownership/share writers lock device before dependent rows.
 PERFORM 1 FROM public.devices WHERE device_id=p_device_id AND active AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Device unavailable' USING ERRCODE='HP409'; END IF;
 PERFORM honorpole_handover_r1.assert_open(p_device_id);
 PERFORM 1 FROM public.device_users WHERE device_id=p_device_id AND user_id=u AND role='admin' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current administrator required' USING ERRCODE='HP403'; END IF;
 expires:=clock_timestamp()+interval '15 minutes';
 INSERT INTO public.honorpole_shares(token_hash,device_id,created_by,expires_at)
 VALUES(p_token_hash,p_device_id,u,expires);
 RETURN jsonb_build_object('deviceId',p_device_id,'expiresAt',expires);
END $$;
REVOKE ALL ON FUNCTION public.honorpole_create_share_r1(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.honorpole_create_share_r1(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_honorpole_share(p_token_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); d text; s public.honorpole_shares%rowtype;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
 IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'Share code invalid, expired, or already used' USING ERRCODE='22023';
 END IF;
 -- Lookup is not authority. Lock device first, then re-read the exact share.
 SELECT device_id INTO d FROM public.honorpole_shares WHERE token_hash=p_token_hash;
 PERFORM 1 FROM public.devices WHERE device_id=d AND active AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Share code invalid, expired, or already used' USING ERRCODE='22023'; END IF;
 PERFORM honorpole_handover_r1.assert_open(d);
 SELECT * INTO s FROM public.honorpole_shares WHERE token_hash=p_token_hash AND device_id=d FOR UPDATE;
 IF NOT FOUND OR s.redeemed_by IS NOT NULL OR s.expires_at<=clock_timestamp() OR s.created_by=u THEN
  RAISE EXCEPTION 'Share code invalid, expired, or already used' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.device_users WHERE device_id=d AND user_id=s.created_by AND role='admin' FOR SHARE;
 IF NOT FOUND OR s.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'Share code invalid, expired, or already used' USING ERRCODE='22023';
 END IF;
 UPDATE public.honorpole_shares SET redeemed_by=u WHERE token_hash=p_token_hash;
 INSERT INTO public.device_users(device_id,user_id,role) VALUES(d,u,'viewer') ON CONFLICT DO NOTHING;
 RETURN d;
END $$;
REVOKE ALL ON FUNCTION public.redeem_honorpole_share(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.redeem_honorpole_share(text) TO authenticated;


-- No cached grant substitutes for a fresh database check at delivery.
CREATE FUNCTION public.honorpole_authorize_operation_r1(p_device text,p_channel text,p_generation bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();g bigint;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='HP401';END IF;
 IF p_channel IS NULL OR p_channel NOT IN('command','setup') OR (p_generation IS NOT NULL AND p_generation<0) THEN
  RAISE EXCEPTION 'Invalid operation' USING ERRCODE='HP400';END IF;
 PERFORM honorpole_handover_r1.lock_device(p_device);
 PERFORM honorpole_handover_r1.assert_open(p_device);
 SELECT generation INTO g FROM honorpole_handover_r1.controls WHERE device_id=p_device;
 IF p_generation IS NOT NULL AND g<>p_generation THEN RAISE EXCEPTION 'Ownership generation changed' USING ERRCODE='HP409';END IF;
 PERFORM 1 FROM public.device_users WHERE device_id=p_device AND user_id=u
  AND (role='admin' OR (p_channel='command' AND role='viewer')) FOR SHARE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u) THEN
  RAISE EXCEPTION 'Current device access required' USING ERRCODE='HP403';END IF;
 RETURN jsonb_build_object('allowed',true,'deviceId',p_device,'channel',p_channel,'generation',g);
END $$;
CREATE FUNCTION public.honorpole_authorize_auto_r1(p_device text,p_generation bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g bigint;
BEGIN
 IF p_generation IS NOT NULL AND p_generation<0 THEN RAISE EXCEPTION 'Invalid generation' USING ERRCODE='HP400';END IF;
 PERFORM honorpole_handover_r1.lock_device(p_device);
 PERFORM honorpole_handover_r1.assert_open(p_device);
 SELECT generation INTO g FROM honorpole_handover_r1.controls WHERE device_id=p_device;
 IF p_generation IS NOT NULL AND g<>p_generation THEN RAISE EXCEPTION 'Ownership generation changed' USING ERRCODE='HP409';END IF;
 RETURN jsonb_build_object('allowed',true,'deviceId',p_device,'channel','auto','generation',g);
END $$;
REVOKE ALL ON FUNCTION public.honorpole_authorize_operation_r1(text,text,bigint),public.honorpole_authorize_auto_r1(text,bigint)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.honorpole_authorize_operation_r1(text,text,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.honorpole_authorize_auto_r1(text,bigint) TO service_role;
-- Production activation is a separate reviewed step after every serving backend
-- and the device barrier/finalizer support the protocol. A UI flag is not ACL.
REVOKE EXECUTE ON FUNCTION public.honorpole_handover_confirm_r1(uuid) FROM authenticated;
COMMIT;
