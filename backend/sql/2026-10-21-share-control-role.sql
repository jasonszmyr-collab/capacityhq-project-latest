-- Shared accounts receive the role accepted by command authorization.
-- Existing memberships remain unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.redeem_honorpole_share(p_token_hash text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_device_id text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING errcode = '28000';
    END IF;

    UPDATE public.honorpole_shares
       SET redeemed_by = auth.uid()
     WHERE token_hash = p_token_hash
       AND redeemed_by IS NULL
       AND expires_at > now()
       AND created_by <> auth.uid()
     RETURNING device_id INTO v_device_id;

    IF v_device_id IS NULL THEN
        RAISE EXCEPTION 'Share code invalid, expired, or already used'
            USING errcode = '22023';
    END IF;

    INSERT INTO public.device_users (device_id, user_id, role)
    VALUES (v_device_id, auth.uid(), 'viewer')
    ON CONFLICT DO NOTHING;

    RETURN v_device_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.redeem_honorpole_share(text) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_honorpole_share(text) TO authenticated;

COMMIT;