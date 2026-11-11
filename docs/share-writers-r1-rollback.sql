BEGIN;
CREATE OR REPLACE FUNCTION public.redeem_honorpole_share(p_token_hash text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_user uuid:=auth.uid();
 v_share public.honorpole_shares%rowtype;
BEGIN
 IF v_user IS NULL THEN
  RAISE EXCEPTION 'Authentication required' USING errcode='28000';
 END IF;
 -- One redeemer owns the code row until this transaction ends.
 SELECT * INTO v_share FROM public.honorpole_shares
 WHERE token_hash=p_token_hash FOR UPDATE;
 IF NOT FOUND OR v_share.redeemed_by IS NOT NULL
 OR v_share.expires_at<=clock_timestamp() OR v_share.created_by=v_user THEN
  RAISE EXCEPTION 'Share code invalid, expired, or already used' USING errcode='22023';
 END IF;
 -- Serialize redemption with removal or role changes of the issuing administrator.
 PERFORM 1 FROM public.device_users
 WHERE device_id=v_share.device_id AND user_id=v_share.created_by AND role='admin'
 FOR SHARE;
 IF NOT FOUND OR v_share.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'Share code invalid, expired, or already used' USING errcode='22023';
 END IF;
 UPDATE public.honorpole_shares SET redeemed_by=v_user WHERE token_hash=p_token_hash;
 INSERT INTO public.device_users(device_id,user_id,role)
 VALUES(v_share.device_id,v_user,'viewer') ON CONFLICT DO NOTHING;
 RETURN v_share.device_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.redeem_honorpole_share(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.redeem_honorpole_share(text) TO authenticated;
DROP FUNCTION public.honorpole_create_share_r1(text,text);
COMMIT;
