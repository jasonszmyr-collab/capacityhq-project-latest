-- SOURCE-ONLY CANDIDATE. Not a complete Base44 cutover or activation migration.
-- Requires the reviewed handover schema and membership/account writer guards.
BEGIN;
DO $$
DECLARE expected record;
BEGIN
 FOR expected IN SELECT * FROM (VALUES
  ('public.device_users','hp_handover_membership_r1','honorpole_handover_r1.guard_related_writer()',31),
  ('public.devices','hp_handover_device_r1','honorpole_handover_r1.guard_device_writer()',27),
  ('auth.users','hp_handover_account_r1','honorpole_handover_r1.guard_account_writer()',27)
 ) v(relation,trigger_name,function_name,expected_type) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger
   WHERE tgrelid=expected.relation::regclass AND tgname=expected.trigger_name
    AND tgfoid=expected.function_name::regprocedure AND tgenabled IN('O','A') AND NOT tgisinternal
    AND tgtype=expected.expected_type) THEN
   RAISE EXCEPTION 'Required membership/account/device guard unavailable';
  END IF;
 END LOOP;
END $$;
CREATE SCHEMA honorpole_preferences_r1;
REVOKE ALL ON SCHEMA honorpole_preferences_r1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE honorpole_preferences_r1.preferences(
 device_id text PRIMARY KEY REFERENCES public.devices(device_id) ON DELETE CASCADE,
 settings jsonb,
 override_mode text NOT NULL DEFAULT 'AUTO' CHECK(override_mode IN('AUTO','FULL','HALF','DOWN')),
 testmode boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991)
);
CREATE TABLE honorpole_preferences_r1.operations(
 device_id text NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
 operation_id uuid NOT NULL,
 actor uuid NOT NULL,
 generation bigint NOT NULL,
 expected_revision bigint NOT NULL,
 kind text NOT NULL CHECK(kind IN('settings','override','testmode')),
 value jsonb NOT NULL,
 response jsonb NOT NULL,
 PRIMARY KEY(device_id,operation_id)
);
ALTER TABLE honorpole_preferences_r1.preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE honorpole_preferences_r1.operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA honorpole_preferences_r1 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION honorpole_preferences_r1.authorize(d text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();g bigint;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='HP401';END IF;
 IF d IS NULL OR d !~ '^HP-[0-9]{3,6}$' OR substring(d FROM 4)::bigint=0 THEN
  RAISE EXCEPTION 'Invalid device' USING ERRCODE='HP400';END IF;
 -- Same parent/control locks as membership revocation, handover and deletion.
 PERFORM honorpole_handover_r1.lock_device(d);
 PERFORM 1 FROM public.device_users WHERE device_id=d AND user_id=u AND role IN('admin','viewer') FOR SHARE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u) THEN
  RAISE EXCEPTION 'Current device access required' USING ERRCODE='HP403';END IF;
 SELECT generation INTO g FROM honorpole_handover_r1.controls WHERE device_id=d;
 IF g IS NULL OR g NOT BETWEEN 0 AND 9007199254740991 THEN RAISE EXCEPTION 'Generation unavailable' USING ERRCODE='HP409';END IF;
 RETURN g;
END $$;
CREATE FUNCTION honorpole_preferences_r1.view_preferences(d text,g bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('deviceId',d,'generation',g,'revision',COALESCE(p.revision,0),
  'settings',p.settings,'override_mode',COALESCE(p.override_mode,'AUTO'),'testmode',COALESCE(p.testmode,false))
 FROM (SELECT 1) seed LEFT JOIN honorpole_preferences_r1.preferences p ON p.device_id=d
$$;
CREATE FUNCTION honorpole_preferences_r1.validate_settings(s jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k text;
 strings text[]:=ARRAY['installation_zip','installation_city','installation_county','installation_state','installation_state_code','installation_county_fips','timezone'];
 booleans text[]:=ARRAY['sun_schedule_enabled','raise_at_sunrise','lower_at_sunset','illuminated_at_night','auto_half_staff','enable_federal_alerts','enable_state_alerts','enable_local_alerts','auto_apply_verified_directives'];
BEGIN
 IF s IS NULL OR jsonb_typeof(s)<>'object' THEN RAISE EXCEPTION 'Invalid settings' USING ERRCODE='HP400';END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(s))<>18 OR
  EXISTS(SELECT 1 FROM jsonb_object_keys(s) key WHERE NOT key=ANY(strings||booleans||ARRAY['latitude','longitude'])) THEN
  RAISE EXCEPTION 'Invalid settings fields' USING ERRCODE='HP400';END IF;
 FOREACH k IN ARRAY strings LOOP
  IF jsonb_typeof(s->k) IS DISTINCT FROM 'string' OR length(s->>k)>120 OR (s->>k)<>btrim(s->>k) THEN
   RAISE EXCEPTION 'Invalid string setting' USING ERRCODE='HP400';END IF;
 END LOOP;
 FOREACH k IN ARRAY booleans LOOP
  IF jsonb_typeof(s->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid boolean setting' USING ERRCODE='HP400';END IF;
 END LOOP;
 IF (s->>'installation_zip') !~ '^[0-9]{5}$' OR (s->>'installation_state_code') !~ '^[A-Z]{2}$' OR
  jsonb_typeof(s->'latitude') IS DISTINCT FROM 'number' OR jsonb_typeof(s->'longitude') IS DISTINCT FROM 'number' THEN
  RAISE EXCEPTION 'Invalid location' USING ERRCODE='HP400';END IF;
 IF (s->>'latitude')::numeric NOT BETWEEN -90 AND 90 OR (s->>'longitude')::numeric NOT BETWEEN -180 AND 180 OR
  NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=s->>'timezone') THEN
  RAISE EXCEPTION 'Invalid location or timezone' USING ERRCODE='HP400';END IF;
END $$;
CREATE FUNCTION public.honorpole_preferences_read_r1(p_device text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g bigint;
BEGIN
 g:=honorpole_preferences_r1.authorize(p_device);
 -- Members can read during HOLD; writes below require the gate to be open.
 RETURN honorpole_preferences_r1.view_preferences(p_device,g);
END $$;
CREATE FUNCTION public.honorpole_preferences_write_r1(p_device text,p_operation uuid,p_generation bigint,p_revision bigint,p_kind text,p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g bigint;current_revision bigint;result jsonb;prior honorpole_preferences_r1.operations%rowtype;u uuid:=auth.uid();
BEGIN
 g:=honorpole_preferences_r1.authorize(p_device);
 PERFORM honorpole_handover_r1.assert_open(p_device);
 IF p_operation IS NULL OR p_generation IS NULL OR p_revision IS NULL OR
  p_generation NOT BETWEEN 0 AND 9007199254740991 OR p_revision NOT BETWEEN 0 AND 9007199254740990 OR
  p_kind IS NULL OR p_kind NOT IN('settings','override','testmode') OR p_value IS NULL THEN
  RAISE EXCEPTION 'Invalid write request' USING ERRCODE='HP400';END IF;
 IF g<>p_generation THEN RAISE EXCEPTION 'Ownership generation changed' USING ERRCODE='HP409';END IF;
 IF p_kind='settings' THEN PERFORM honorpole_preferences_r1.validate_settings(p_value);
 ELSIF p_kind='override' THEN
  IF jsonb_typeof(p_value)<>'string' OR (p_value#>>'{}') NOT IN('AUTO','FULL','HALF','DOWN') THEN RAISE EXCEPTION 'Invalid override' USING ERRCODE='HP400';END IF;
 ELSE
  IF jsonb_typeof(p_value)<>'boolean' THEN RAISE EXCEPTION 'Invalid test mode' USING ERRCODE='HP400';END IF;
  PERFORM 1 FROM public.device_users WHERE device_id=p_device AND user_id=u AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current owner required for diagnostics' USING ERRCODE='HP403';END IF;
 END IF;
 -- Retry receipts never bypass current membership, frozen gate or generation.
 SELECT * INTO prior FROM honorpole_preferences_r1.operations WHERE device_id=p_device AND operation_id=p_operation;
 IF FOUND THEN
  IF prior.actor<>u OR prior.generation<>g OR prior.expected_revision<>p_revision OR prior.kind<>p_kind OR prior.value<>p_value THEN
   RAISE EXCEPTION 'Operation identity conflict' USING ERRCODE='HP409';END IF;
  RETURN prior.response;
 END IF;
 SELECT revision INTO current_revision FROM honorpole_preferences_r1.preferences WHERE device_id=p_device;
 IF COALESCE(current_revision,0)<>p_revision THEN RAISE EXCEPTION 'Preferences changed' USING ERRCODE='HP409';END IF;
 INSERT INTO honorpole_preferences_r1.preferences(device_id,settings,override_mode,testmode,revision)
 VALUES(p_device,CASE WHEN p_kind='settings' THEN p_value ELSE NULL END,
  CASE WHEN p_kind='override' THEN p_value#>>'{}' ELSE 'AUTO' END,
  CASE WHEN p_kind='testmode' THEN (p_value#>>'{}')::boolean ELSE false END,1)
 ON CONFLICT(device_id) DO UPDATE SET
  settings=CASE WHEN p_kind='settings' THEN EXCLUDED.settings ELSE honorpole_preferences_r1.preferences.settings END,
  override_mode=CASE WHEN p_kind='override' THEN EXCLUDED.override_mode ELSE honorpole_preferences_r1.preferences.override_mode END,
  testmode=CASE WHEN p_kind='testmode' THEN EXCLUDED.testmode ELSE honorpole_preferences_r1.preferences.testmode END,
  revision=honorpole_preferences_r1.preferences.revision+1;
 result:=honorpole_preferences_r1.view_preferences(p_device,g);
 INSERT INTO honorpole_preferences_r1.operations(device_id,operation_id,actor,generation,expected_revision,kind,value,response)
 VALUES(p_device,p_operation,u,g,p_revision,p_kind,p_value,result);
 RETURN result;
END $$;
CREATE FUNCTION public.honorpole_preferences_auto_read_r1(p_device text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g bigint;
BEGIN
 IF p_device IS NULL OR p_device !~ '^HP-[0-9]{3,6}$' THEN RAISE EXCEPTION 'Invalid device' USING ERRCODE='HP400';END IF;
 PERFORM honorpole_handover_r1.lock_device(p_device);
 PERFORM honorpole_handover_r1.assert_open(p_device);
 SELECT generation INTO g FROM honorpole_handover_r1.controls WHERE device_id=p_device;
 IF NOT EXISTS(SELECT 1 FROM honorpole_preferences_r1.preferences WHERE device_id=p_device AND settings IS NOT NULL) THEN
  RAISE EXCEPTION 'Installation settings required' USING ERRCODE='HP409';END IF;
 RETURN honorpole_preferences_r1.view_preferences(p_device,g);
END $$;
CREATE FUNCTION public.honorpole_preferences_auto_check_r1(p_device text,p_generation bigint,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb;
BEGIN
 v:=public.honorpole_preferences_auto_read_r1(p_device);
 IF p_generation IS NULL OR p_revision IS NULL OR (v->>'generation')::bigint<>p_generation OR (v->>'revision')::bigint<>p_revision
  OR v->>'override_mode'<>'AUTO' OR (v->>'testmode')::boolean THEN
  RAISE EXCEPTION 'AUTO decision no longer current' USING ERRCODE='HP409';END IF;
 RETURN jsonb_build_object('allowed',true,'deviceId',p_device,'generation',p_generation,'revision',p_revision);
END $$;
REVOKE ALL ON FUNCTION public.honorpole_preferences_auto_read_r1(text),public.honorpole_preferences_auto_check_r1(text,bigint,bigint)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.honorpole_preferences_auto_read_r1(text),public.honorpole_preferences_auto_check_r1(text,bigint,bigint) TO service_role;
CREATE FUNCTION public.honorpole_preferences_auto_devices_r1() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('deviceIds',COALESCE(jsonb_agg(p.device_id ORDER BY p.device_id),'[]'::jsonb))
 FROM honorpole_preferences_r1.preferences p JOIN public.devices d ON d.device_id=p.device_id
 WHERE d.active AND d.is_active AND p.settings IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.honorpole_preferences_auto_devices_r1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.honorpole_preferences_auto_devices_r1() TO service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA honorpole_preferences_r1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.honorpole_preferences_read_r1(text),
 public.honorpole_preferences_write_r1(text,uuid,bigint,bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.honorpole_preferences_read_r1(text),
 public.honorpole_preferences_write_r1(text,uuid,bigint,bigint,text,jsonb) TO authenticated;
COMMIT;
