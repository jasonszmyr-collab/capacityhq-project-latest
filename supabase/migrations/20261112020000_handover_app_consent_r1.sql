-- Candidate only. User-facing contract is disabled until reviewed activation.
BEGIN;
CREATE TABLE honorpole_handover_r1.app_policy(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),new_transfers boolean NOT NULL DEFAULT false);
INSERT INTO honorpole_handover_r1.app_policy VALUES(true,false);
CREATE TABLE honorpole_handover_r1.invitations(
 id uuid PRIMARY KEY,device_id text NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
 initiator uuid NOT NULL,generation bigint NOT NULL CHECK(generation BETWEEN 0 AND 9007199254740990),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 state text NOT NULL CHECK(state IN('open','claimed','cancelled','expired')),
 recipient uuid,request_id uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 FOREIGN KEY(device_id,request_id) REFERENCES honorpole_handover_r1.requests(device_id,id),
 CHECK((state='claimed' AND recipient IS NOT NULL AND recipient<>initiator AND request_id IS NOT NULL AND request_id=id)
    OR (state<>'claimed' AND recipient IS NULL AND request_id IS NULL))
);
CREATE UNIQUE INDEX one_open_invitation_per_device ON honorpole_handover_r1.invitations(device_id) WHERE state='open';
CREATE INDEX invitation_participants ON honorpole_handover_r1.invitations(initiator,recipient,created_at DESC);
ALTER TABLE honorpole_handover_r1.app_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE honorpole_handover_r1.invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON honorpole_handover_r1.app_policy,honorpole_handover_r1.invitations FROM PUBLIC,anon,authenticated,service_role,honorpole_recovery_operator;
CREATE FUNCTION honorpole_handover_r1.app_actor() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u) THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='HP401';END IF;
 RETURN u;
END $$;
CREATE FUNCTION honorpole_handover_r1.app_new_allowed() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT COALESCE((SELECT new_transfers FROM honorpole_handover_r1.app_policy WHERE singleton),false)
 THEN RAISE EXCEPTION 'New transfers unavailable' USING ERRCODE='HP503';END IF;
END $$;
CREATE FUNCTION honorpole_handover_r1.app_owner(d text,u uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.device_users WHERE device_id=d AND user_id=u AND role='admin')
  AND (SELECT count(*) FROM public.device_users WHERE device_id=d AND role='admin')<>1
 THEN RAISE EXCEPTION 'Single current owner required' USING ERRCODE='HP409';END IF;
 PERFORM honorpole_handover_r1.assert_owner(d,u);
END $$;
CREATE FUNCTION honorpole_handover_r1.invitation_view(i honorpole_handover_r1.invitations) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r honorpole_handover_r1.requests%rowtype;p text;f boolean:=false;e text;
BEGIN
 IF i.request_id IS NOT NULL THEN
  SELECT * INTO r FROM honorpole_handover_r1.requests WHERE id=i.request_id AND device_id=i.device_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request unavailable' USING ERRCODE='HP409';END IF;
  p:=r.phase;
  SELECT COALESCE(active_request=i.request_id,false) INTO f FROM honorpole_handover_r1.controls WHERE device_id=i.device_id;
 ELSE p:=CASE WHEN i.state='open' THEN 'offered' ELSE i.state END;END IF;
 IF p IN('offered','accepted') AND i.expires_at<=clock_timestamp() THEN p:='expired';END IF;
 SELECT to_jsonb(u)->>'email' INTO e FROM auth.users u WHERE id=i.recipient;
 RETURN jsonb_build_object('invitationId',i.id,'deviceId',i.device_id,'initiator',i.initiator,
 'recipient',i.recipient,'recipientEmail',e,'generation',i.generation,'phase',p,
 'expiresAt',i.expires_at,'frozen',COALESCE(f,false));
END $$;
CREATE FUNCTION public.honorpole_handover_app_capabilities_r1() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM honorpole_handover_r1.app_actor();
 RETURN jsonb_build_object('available',true,'canStart',COALESCE((SELECT new_transfers FROM honorpole_handover_r1.app_policy WHERE singleton),false));
END $$;
CREATE FUNCTION public.honorpole_handover_invite_r1(p_invitation uuid,p_device text,p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=honorpole_handover_r1.app_actor();g bigint;i honorpole_handover_r1.invitations%rowtype;
BEGIN
 PERFORM honorpole_handover_r1.app_new_allowed();
 IF p_invitation IS NULL OR p_device IS NULL OR p_device !~ '^HP-[0-9]{3,6}$' OR p_device ~ '^HP-0{3,6}$'
  OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='HP400';END IF;
 PERFORM honorpole_handover_r1.lock_device(p_device);
 PERFORM honorpole_handover_r1.app_owner(p_device,u);
 SELECT generation INTO g FROM honorpole_handover_r1.controls WHERE device_id=p_device;
 IF g>=9007199254740991 THEN RAISE EXCEPTION 'Generation exhausted' USING ERRCODE='HP409';END IF;
 SELECT * INTO i FROM honorpole_handover_r1.invitations WHERE id=p_invitation FOR UPDATE;
 IF FOUND THEN
  IF i.device_id<>p_device OR i.initiator<>u OR i.generation<>g OR i.token_hash<>p_hash
  THEN RAISE EXCEPTION 'Invitation retry conflict' USING ERRCODE='HP409';END IF;
  RETURN honorpole_handover_r1.invitation_view(i);
 END IF;
 PERFORM honorpole_handover_r1.assert_open(p_device);
 UPDATE honorpole_handover_r1.invitations SET state='expired' WHERE device_id=p_device AND state='open'
  AND (expires_at<=clock_timestamp() OR generation<>g OR initiator<>u);
 UPDATE honorpole_handover_r1.requests SET phase='expired' WHERE device_id=p_device AND phase IN('offered','accepted') AND expires_at<=clock_timestamp();
 IF EXISTS(SELECT 1 FROM honorpole_handover_r1.requests WHERE device_id=p_device AND phase IN('offered','accepted','quiescing','cancel_requested','releasing','cancel_releasing'))
  OR EXISTS(SELECT 1 FROM honorpole_handover_r1.invitations WHERE device_id=p_device AND state='open')
  OR EXISTS(SELECT 1 FROM honorpole_handover_r1.invitations WHERE token_hash=p_hash)
  OR EXISTS(SELECT 1 FROM honorpole_handover_r1.requests WHERE id=p_invitation)
 THEN RAISE EXCEPTION 'Invitation conflict' USING ERRCODE='HP409';END IF;
 INSERT INTO honorpole_handover_r1.invitations(id,device_id,initiator,generation,token_hash,state,expires_at)
 VALUES(p_invitation,p_device,u,g,p_hash,'open',clock_timestamp()+interval '15 minutes') RETURNING * INTO i;
 RETURN honorpole_handover_r1.invitation_view(i);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Invitation conflict' USING ERRCODE='HP409';
END $$;
CREATE FUNCTION public.honorpole_handover_redeem_r1(p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=honorpole_handover_r1.app_actor();i honorpole_handover_r1.invitations%rowtype;d text;g bigint;result jsonb;
BEGIN
 PERFORM honorpole_handover_r1.app_new_allowed();
 IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='HP400';END IF;
 SELECT device_id INTO d FROM honorpole_handover_r1.invitations WHERE token_hash=p_hash;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='HP404';END IF;
 PERFORM honorpole_handover_r1.lock_device(d);
 SELECT * INTO i FROM honorpole_handover_r1.invitations WHERE token_hash=p_hash FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='HP404';END IF;
 IF u=i.initiator THEN RAISE EXCEPTION 'Different recipient required' USING ERRCODE='HP403';END IF;
 IF i.state='claimed' THEN
  IF i.recipient<>u THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='HP403';END IF;
  RETURN honorpole_handover_r1.invitation_view(i);
 END IF;
 IF i.state<>'open' THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='HP409';END IF;
 IF i.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Invitation expired' USING ERRCODE='HP410';END IF;
 PERFORM honorpole_handover_r1.app_owner(d,i.initiator);
 SELECT generation INTO g FROM honorpole_handover_r1.controls WHERE device_id=d;
 IF g<>i.generation THEN RAISE EXCEPTION 'Ownership generation changed' USING ERRCODE='HP409';END IF;
 PERFORM honorpole_handover_r1.assert_open(d);
 IF EXISTS(SELECT 1 FROM honorpole_handover_r1.requests WHERE device_id=d AND phase IN('offered','accepted','quiescing','cancel_requested','releasing','cancel_releasing'))
 THEN RAISE EXCEPTION 'Another transfer is pending' USING ERRCODE='HP409';END IF;
 INSERT INTO honorpole_handover_r1.requests(id,device_id,initiator,recipient,generation,phase,expires_at)
 VALUES(i.id,d,i.initiator,u,g,'offered',i.expires_at);
 -- Existing named-recipient primitive supplies the recipient's explicit consent.
 result:=public.honorpole_handover_accept_r1(i.id);
 UPDATE honorpole_handover_r1.invitations SET state='claimed',recipient=u,request_id=id WHERE id=i.id RETURNING * INTO i;
 RETURN honorpole_handover_r1.invitation_view(i);
END $$;
CREATE FUNCTION public.honorpole_handover_app_confirm_r1(p_invitation uuid,p_recipient uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=honorpole_handover_r1.app_actor();i honorpole_handover_r1.invitations%rowtype;d text;result jsonb;
BEGIN
 PERFORM honorpole_handover_r1.app_new_allowed();
 SELECT device_id INTO d FROM honorpole_handover_r1.invitations WHERE id=p_invitation AND initiator=u;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='HP404';END IF;
 PERFORM honorpole_handover_r1.lock_device(d);
 SELECT * INTO i FROM honorpole_handover_r1.invitations WHERE id=p_invitation FOR UPDATE;
 IF i.initiator<>u OR i.state<>'claimed' OR i.recipient IS DISTINCT FROM p_recipient OR p_recipient IS NULL
 THEN RAISE EXCEPTION 'Accepted recipient required' USING ERRCODE='HP409';END IF;
 PERFORM honorpole_handover_r1.app_owner(d,u);
 -- The original confirm remains revoked from authenticated. This guarded wrapper
 -- checks the server-bound recipient again and invokes it as the trusted owner.
 result:=public.honorpole_handover_confirm_r1(i.request_id);
 RETURN honorpole_handover_r1.invitation_view(i);
END $$;
CREATE FUNCTION public.honorpole_handover_app_status_r1(p_invitation uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=honorpole_handover_r1.app_actor();i honorpole_handover_r1.invitations%rowtype;
BEGIN
 SELECT * INTO i FROM honorpole_handover_r1.invitations WHERE id=p_invitation AND (initiator=u OR recipient=u);
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='HP404';END IF;
 RETURN honorpole_handover_r1.invitation_view(i);
END $$;
CREATE FUNCTION public.honorpole_handover_app_list_r1() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=honorpole_handover_r1.app_actor();result jsonb;
BEGIN
 SELECT COALESCE(jsonb_agg(x.v ORDER BY x.pending DESC,x.created_at DESC,x.id),'[]'::jsonb) INTO result FROM(
  SELECT i.id,i.created_at,honorpole_handover_r1.invitation_view(i) AS v,
   COALESCE(r.phase IN('quiescing','cancel_requested','releasing','cancel_releasing') OR
    (i.expires_at>clock_timestamp() AND (i.state='open' OR r.phase IN('offered','accepted'))),false) AS pending
  FROM honorpole_handover_r1.invitations i LEFT JOIN honorpole_handover_r1.requests r ON r.id=i.request_id
  WHERE i.initiator=u OR i.recipient=u
  ORDER BY pending DESC,i.created_at DESC,i.id LIMIT 50
 )x;
 RETURN result;
END $$;
CREATE FUNCTION public.honorpole_handover_app_cancel_r1(p_invitation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=honorpole_handover_r1.app_actor();i honorpole_handover_r1.invitations%rowtype;d text;result jsonb;
BEGIN
 -- Recovery/cancellation remains callable when new transfers are disabled.
 SELECT device_id INTO d FROM honorpole_handover_r1.invitations WHERE id=p_invitation AND (initiator=u OR recipient=u);
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='HP404';END IF;
 PERFORM honorpole_handover_r1.lock_device(d);
 SELECT * INTO i FROM honorpole_handover_r1.invitations WHERE id=p_invitation FOR UPDATE;
 IF i.request_id IS NULL THEN
  UPDATE honorpole_handover_r1.invitations SET state='cancelled' WHERE id=i.id AND state='open' RETURNING * INTO i;
  IF NOT FOUND THEN SELECT * INTO i FROM honorpole_handover_r1.invitations WHERE id=p_invitation;END IF;
 ELSE result:=public.honorpole_handover_cancel_r1(i.request_id);END IF;
 RETURN honorpole_handover_r1.invitation_view(i);
END $$;
REVOKE ALL ON FUNCTION honorpole_handover_r1.app_owner(text,uuid),honorpole_handover_r1.app_actor(),honorpole_handover_r1.app_new_allowed(),
 honorpole_handover_r1.invitation_view(honorpole_handover_r1.invitations) FROM PUBLIC,anon,authenticated,service_role,honorpole_recovery_operator;
REVOKE ALL ON FUNCTION public.honorpole_handover_app_capabilities_r1(),public.honorpole_handover_invite_r1(uuid,text,text),
 public.honorpole_handover_redeem_r1(text),public.honorpole_handover_app_confirm_r1(uuid,uuid),
 public.honorpole_handover_app_status_r1(uuid),public.honorpole_handover_app_list_r1(),public.honorpole_handover_app_cancel_r1(uuid)
 FROM PUBLIC,anon,authenticated,service_role,honorpole_recovery_operator;
GRANT EXECUTE ON FUNCTION public.honorpole_handover_app_capabilities_r1(),public.honorpole_handover_invite_r1(uuid,text,text),
 public.honorpole_handover_redeem_r1(text),public.honorpole_handover_app_confirm_r1(uuid,uuid),
 public.honorpole_handover_app_status_r1(uuid),public.honorpole_handover_app_list_r1(),public.honorpole_handover_app_cancel_r1(uuid) TO authenticated;
COMMIT;
