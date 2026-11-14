-- Candidate permission change only; rehearse before any proposed adoption.
BEGIN;
REVOKE TRUNCATE ON public.device_tokens FROM anon,authenticated;
DO $$ BEGIN
 IF has_table_privilege('anon','public.device_tokens','TRUNCATE') OR has_table_privilege('authenticated','public.device_tokens','TRUNCATE')
 THEN RAISE EXCEPTION 'Token TRUNCATE still inherited; explicit grant review required';END IF;
END $$;
COMMIT;
