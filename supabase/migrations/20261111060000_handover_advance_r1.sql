-- Candidate only. Device ACK drives a durable database state transition.
BEGIN;
CREATE FUNCTION public.honorpole_handover_advance_ack_r1(p_device text,p_secret_hash text,p_ack jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;r honorpole_handover_r1.requests%rowtype;c honorpole_handover_r1.controls%rowtype;receipt jsonb;
BEGIN
 -- Validates credential and exact issuance correlation under the shared lock
 -- order. RELEASED atomically completes the already-finalized request here.
 result:=public.honorpole_handover_record_ack_r1(p_device,p_secret_hash,p_ack);
 IF p_ack->>'action'<>'HOLD' THEN RETURN result;END IF;
 SELECT * INTO r FROM honorpole_handover_r1.requests WHERE device_id=p_device AND id=(p_ack->>'requestId')::uuid FOR UPDATE;
 SELECT * INTO c FROM honorpole_handover_r1.controls WHERE device_id=p_device;
 IF r.id IS NULL OR r.phase<>'quiescing' OR c.active_request IS DISTINCT FROM r.id OR c.generation<>r.generation
 THEN RETURN result;END IF;
 BEGIN
  -- Public finalizer is itself service-only and rechecks sole ownership,
  -- consent, latest credential-bound proof and generation before mutation.
  receipt:=public.honorpole_handover_finalize_r1(r.id,p_secret_hash,p_ack->>'boot',p_ack->>'ticket');
 EXCEPTION
  WHEN SQLSTATE 'HP409' THEN
   -- Receipt the authentic older ACK so the device can request a fresh ticket;
   -- an indefinitely retained stale ACK must not strand the poll loop.
   RETURN result;
  WHEN SQLSTATE 'HP410' THEN
   -- Expired consent never authorizes ownership mutation. Frozen cancellation
   -- recovery remains a later workflow; acknowledgement is not completion.
   RETURN result;
 END;
 -- Any other error rolls back both ACK recording and finalization so a lost
 -- response or transient database failure remains retryable from the device.
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.honorpole_handover_advance_ack_r1(text,text,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.honorpole_handover_advance_ack_r1(text,text,jsonb) TO service_role;
-- User confirmation and all production activation flags remain disabled.
COMMIT;
