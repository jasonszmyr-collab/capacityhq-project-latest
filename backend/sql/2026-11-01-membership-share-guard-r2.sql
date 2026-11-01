-- Candidate membership/share write guard R2. Validate in the disposable PG17 fixture.
-- This file has NOT been applied to the live database.
-- Preserves existing rows, SELECT access and service-role/definer-owned flows.
BEGIN;
DROP POLICY IF EXISTS device_users_insert_own ON public.device_users;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
    ON public.device_users FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE ON public.devices FROM PUBLIC, anon, authenticated;
-- Live shares have no customer RLS policies or column-specific grants.
-- Only trusted backend and the existing postgres-owned redemption RPC write them.
REVOKE ALL PRIVILEGES ON public.honorpole_shares
    FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
