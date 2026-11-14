-- Candidate only. Auth deletion owns one transaction and its FK cascades.
BEGIN;
DO $$
DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['public.device_users','public.device_tokens'] LOOP
  IF NOT EXISTS(
   SELECT 1 FROM pg_catalog.pg_constraint c
   JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attname='user_id'
   JOIN pg_catalog.pg_attribute b ON b.attrelid=c.confrelid AND b.attname='id'
   WHERE c.contype='f' AND c.conrelid=relation::regclass AND c.confrelid='auth.users'::regclass
    AND c.confdeltype='c' AND c.convalidated AND c.conkey=ARRAY[a.attnum] AND c.confkey=ARRAY[b.attnum]
  ) THEN RAISE EXCEPTION 'Required Auth cascade missing on %',relation;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='auth.users'::regclass
  AND tgname='hp_handover_account_r1' AND tgenabled IN('O','A') AND NOT tgisinternal AND (tgtype & 11)=11
  AND tgfoid='honorpole_handover_r1.guard_account_writer()'::regprocedure) THEN
  RAISE EXCEPTION 'Required Auth handover guard missing or disabled';
 END IF;
END $$;
CREATE FUNCTION public.honorpole_prepare_account_deletion_r1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();d text;
BEGIN
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u) THEN
  RAISE EXCEPTION 'Current authenticated account required' USING ERRCODE='HP401';END IF;
 FOR d IN
  SELECT device_id FROM public.device_users WHERE user_id=u
  UNION
  SELECT device_id FROM honorpole_handover_r1.requests
   WHERE (initiator=u OR recipient=u) AND phase NOT IN('cancelled','expired','completed')
  ORDER BY device_id
 LOOP
  PERFORM honorpole_handover_r1.writer_open(d);
 END LOOP;
 -- UX preflight only. Locks end with this transaction; the Auth DELETE trigger
 -- remains authoritative if a freeze commits before the later Auth API call.
 RETURN jsonb_build_object('ready',true,'userId',u);
END $$;
REVOKE ALL ON FUNCTION public.honorpole_prepare_account_deletion_r1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.honorpole_prepare_account_deletion_r1() TO authenticated;
COMMIT;
