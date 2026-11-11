-- Candidate migration. Validate in disposable database before any live adoption.
BEGIN;
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
COMMIT;
