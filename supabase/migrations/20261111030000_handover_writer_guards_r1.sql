-- Candidate only. Guard older/direct writers as well as coordinated RPCs.
-- No ownership finalizer, bypass switch or user-controlled permit is exposed.
BEGIN;
CREATE FUNCTION honorpole_handover_r1.writer_open(d text,revocation_only boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Parent row first. Inactive devices still participate in freeze protection.
 PERFORM 1 FROM public.devices WHERE device_id=d FOR UPDATE;
 IF NOT FOUND THEN RETURN;END IF; -- Parent DELETE already passed its own guard.
 PERFORM 1 FROM honorpole_handover_r1.controls WHERE device_id=d FOR UPDATE;
 -- Tightening factory revocation remains possible during a frozen handover.
 IF NOT revocation_only THEN PERFORM honorpole_handover_r1.assert_open(d);END IF;
END $$;
CREATE FUNCTION honorpole_handover_r1.guard_related_writer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE before_device text;after_device text;d text;tightening boolean:=false;
BEGIN
 IF TG_OP<>'INSERT' THEN before_device:=OLD.device_id;END IF;
 IF TG_OP<>'DELETE' THEN after_device:=NEW.device_id;END IF;
 IF TG_TABLE_NAME='honorpole_factory_credentials' AND TG_OP='UPDATE' THEN
  tightening:=NEW.revoked_at IS NOT NULL AND
   (to_jsonb(NEW)-'revoked_at')=(to_jsonb(OLD)-'revoked_at');
 END IF;
 FOR d IN SELECT DISTINCT x FROM unnest(ARRAY[before_device,after_device]) x WHERE x IS NOT NULL ORDER BY x LOOP
  PERFORM honorpole_handover_r1.writer_open(d,tightening);
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION honorpole_handover_r1.guard_device_writer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d text;
BEGIN
 IF TG_OP='DELETE' THEN
  PERFORM honorpole_handover_r1.writer_open(OLD.device_id);RETURN OLD;
 END IF;
 -- Telemetry/name/location updates stay usable while control is frozen.
 IF ROW(NEW.device_id,NEW.api_key,NEW.pairing_code_hash,NEW.pairing_code_expires_at,NEW.pairing_claimed_at,NEW.active,NEW.is_active)
 IS DISTINCT FROM ROW(OLD.device_id,OLD.api_key,OLD.pairing_code_hash,OLD.pairing_code_expires_at,OLD.pairing_claimed_at,OLD.active,OLD.is_active) THEN
  FOR d IN SELECT DISTINCT x FROM unnest(ARRAY[OLD.device_id,NEW.device_id]) x ORDER BY x LOOP
   PERFORM honorpole_handover_r1.writer_open(d);
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION honorpole_handover_r1.guard_account_writer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.id=OLD.id THEN RETURN NEW;END IF;
 -- Include accepted/offered participants, even recipients with no membership.
 -- This makes account deletion wait behind a concurrent confirmation, then
 -- recheck its committed gate instead of overlooking an uncommitted freeze.
 FOR d IN
  SELECT device_id FROM public.device_users WHERE user_id=OLD.id
  UNION
  SELECT device_id FROM honorpole_handover_r1.requests
   WHERE (initiator=OLD.id OR recipient=OLD.id) AND phase NOT IN('cancelled','expired','completed')
  ORDER BY device_id
 LOOP
  PERFORM honorpole_handover_r1.writer_open(d);
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION honorpole_handover_r1.guard_truncate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d text;
BEGIN
 -- Table-wide TRUNCATE cannot express one device's durable ownership scope.
 FOR d IN SELECT device_id FROM public.devices ORDER BY device_id LOOP
  PERFORM honorpole_handover_r1.writer_open(d);
 END LOOP;
 RETURN NULL;
END $$;
CREATE TRIGGER hp_handover_membership_r1 BEFORE INSERT OR UPDATE OR DELETE ON public.device_users
 FOR EACH ROW EXECUTE FUNCTION honorpole_handover_r1.guard_related_writer();
CREATE TRIGGER hp_handover_share_r1 BEFORE INSERT OR UPDATE OR DELETE ON public.honorpole_shares
 FOR EACH ROW EXECUTE FUNCTION honorpole_handover_r1.guard_related_writer();
CREATE TRIGGER hp_handover_factory_r1 BEFORE INSERT OR UPDATE OR DELETE ON public.honorpole_factory_credentials
 FOR EACH ROW EXECUTE FUNCTION honorpole_handover_r1.guard_related_writer();
CREATE TRIGGER hp_handover_device_r1 BEFORE UPDATE OR DELETE ON public.devices
 FOR EACH ROW EXECUTE FUNCTION honorpole_handover_r1.guard_device_writer();
CREATE TRIGGER hp_handover_account_r1 BEFORE DELETE OR UPDATE OF id ON auth.users
 FOR EACH ROW EXECUTE FUNCTION honorpole_handover_r1.guard_account_writer();
CREATE TRIGGER hp_handover_truncate_r1 BEFORE TRUNCATE ON public.device_users
 FOR EACH STATEMENT EXECUTE FUNCTION honorpole_handover_r1.guard_truncate();
CREATE TRIGGER hp_handover_truncate_r1 BEFORE TRUNCATE ON public.devices
 FOR EACH STATEMENT EXECUTE FUNCTION honorpole_handover_r1.guard_truncate();
CREATE TRIGGER hp_handover_truncate_r1 BEFORE TRUNCATE ON public.honorpole_shares
 FOR EACH STATEMENT EXECUTE FUNCTION honorpole_handover_r1.guard_truncate();
CREATE TRIGGER hp_handover_truncate_r1 BEFORE TRUNCATE ON public.honorpole_factory_credentials
 FOR EACH STATEMENT EXECUTE FUNCTION honorpole_handover_r1.guard_truncate();
CREATE TRIGGER hp_handover_truncate_r1 BEFORE TRUNCATE ON auth.users
 FOR EACH STATEMENT EXECUTE FUNCTION honorpole_handover_r1.guard_truncate();
REVOKE ALL ON FUNCTION honorpole_handover_r1.writer_open(text,boolean),
 honorpole_handover_r1.guard_related_writer(),honorpole_handover_r1.guard_device_writer(),
 honorpole_handover_r1.guard_account_writer(),honorpole_handover_r1.guard_truncate()
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
