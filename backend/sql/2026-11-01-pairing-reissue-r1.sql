-- Candidate only. Apply to an isolated database and review before production.
-- Existing duplicate stored hashes cause this transaction to fail; no repair,
-- identity change, ownership change or code issuance is performed by migration.
begin;

-- Uniqueness applies to every writer, including an older backend instance.
-- PostgreSQL unique indexes permit multiple NULL values by default.
create unique index if not exists honorpole_pairing_code_hash_reissue_unique
    on public.devices (pairing_code_hash);

-- IF NOT EXISTS must not silently accept an unrelated/pre-existing index.
do $$
begin
    if not exists (
        select 1 from pg_catalog.pg_index i
        join pg_catalog.pg_attribute a on a.attrelid = i.indrelid
            and a.attname = 'pairing_code_hash'
        where i.indexrelid = 'public.honorpole_pairing_code_hash_reissue_unique'::regclass
            and i.indrelid = 'public.devices'::regclass
            and i.indisunique and i.indisvalid
            and i.indpred is null and i.indexprs is null
            and i.indnkeyatts = 1 and i.indkey[0] = a.attnum
    ) then
        raise exception 'Pairing hash index requires schema review';
    end if;
end;
$$;

create or replace function public.honorpole_reissue_pairing_code(
    p_device_id text, p_pairing_code_hash text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_device public.devices%rowtype;
    v_now timestamptz;
    v_expires timestamptz;
begin
    if p_device_id is null or p_device_id !~ '^HP-[0-9]{3,6}$'
        or p_pairing_code_hash is null or p_pairing_code_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'Invalid pairing request' using errcode = 'HP400';
    end if;

    -- Same lock as factory allocation. Row lock also serializes with first claim.
    perform pg_catalog.pg_advisory_xact_lock(179123, 1005);
    select * into v_device from public.devices
        where device_id = p_device_id for update;
    if not found then
        raise exception 'Factory device not found' using errcode = 'HP404';
    end if;
    if not coalesce(v_device.is_active,false) or not coalesce(v_device.active,false) then
        raise exception 'Device is inactive' using errcode = 'HP409';
    end if;
    -- Recheck provisioning/revocation at the write, beyond the auth cache.
    perform 1 from public.honorpole_factory_credentials
        where device_id = p_device_id and revoked_at is null for share;
    if not found then
        raise exception 'Factory credential unavailable' using errcode = 'HP409';
    end if;
    if v_device.pairing_claimed_at is not null
        or exists(select 1 from public.device_users where device_id = p_device_id) then
        raise exception 'Device already assigned' using errcode = 'HP409';
    end if;

    v_now := clock_timestamp();
    if v_device.pairing_code_hash = p_pairing_code_hash then
        -- Network retries do not silently extend a bearer code's lifetime.
        if v_device.pairing_code_expires_at is not null
            and v_device.pairing_code_expires_at > v_now then
            return jsonb_build_object('deviceId',p_device_id,
                'expiresAt',v_device.pairing_code_expires_at);
        end if;
        raise exception 'A new pairing code is required' using errcode = 'HP410';
    end if;
    if exists(select 1 from public.devices
        where pairing_code_hash = p_pairing_code_hash and device_id <> p_device_id) then
        raise exception 'Pairing code already reserved' using errcode = 'HP409';
    end if;
    v_expires := v_now + interval '1 hour';
    begin
        update public.devices set pairing_code_hash = p_pairing_code_hash,
            pairing_code_expires_at = v_expires, updated_at = v_now
            where id = v_device.id;
    exception when unique_violation then
        raise exception 'Pairing code already reserved' using errcode = 'HP409';
    end;
    return jsonb_build_object('deviceId',p_device_id,'expiresAt',v_expires);
end;
$$;

revoke all on function public.honorpole_reissue_pairing_code(text,text)
    from public, anon, authenticated, service_role;
grant execute on function public.honorpole_reissue_pairing_code(text,text) to service_role;
notify pgrst, 'reload schema';
commit;
