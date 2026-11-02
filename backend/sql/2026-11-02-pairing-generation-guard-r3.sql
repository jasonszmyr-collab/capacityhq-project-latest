-- UNDEPLOYED CANDIDATE. Complete disposable PostgreSQL acceptance before live use.
-- Single-install transaction: reapplying deliberately fails at CREATE TABLE,
-- rolling back the entire repeat without weakening guards or resetting journals.
-- Requires the accepted factory registry and pairing reissue R1 migrations.
begin;

-- Serialize with factory allocation/reissue while seeding the current-code history.
select pg_catalog.pg_advisory_xact_lock(179123, 1005);
lock table public.devices in share row exclusive mode;
-- Refuse an unexpected foundation rather than replacing an unrelated RPC.
do $$
begin
    if pg_catalog.to_regprocedure('public.honorpole_reissue_pairing_code(text,text)') is null
       or pg_catalog.to_regprocedure('public.honorpole_claim_device(text,text)') is null then
        raise exception 'Accepted factory and reissue foundation required';
    end if;
    if not exists (
        select 1 from pg_catalog.pg_index i
        join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attname='pairing_code_hash'
        where i.indexrelid=pg_catalog.to_regclass('public.honorpole_pairing_code_hash_reissue_unique')
          and i.indrelid='public.devices'::regclass and i.indisunique and i.indisvalid
          and i.indpred is null and i.indexprs is null and i.indnkeyatts=1 and i.indkey[0]=a.attnum
    ) then
        raise exception 'Reviewed unique pairing hash index required';
    end if;
end;
$$;

-- No caller including service_role may directly read/write/reset these journals.
create table public.honorpole_pairing_history_r3 (
    device_id text not null references public.devices(device_id),
    code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
    recorded_at timestamptz not null default clock_timestamp(),
    primary key(device_id,code_hash)
);
create table public.honorpole_pairing_requests_r3 (
    request_id uuid primary key,
    device_id text not null references public.devices(device_id),
    expected_hash text not null check (expected_hash ~ '^[0-9a-f]{64}$'),
    issued_hash text not null check (issued_hash ~ '^[0-9a-f]{64}$'),
    expires_at timestamptz not null,
    created_at timestamptz not null default clock_timestamp(),
    check (expected_hash <> issued_hash)
);
alter table public.honorpole_pairing_history_r3 owner to postgres;
alter table public.honorpole_pairing_requests_r3 owner to postgres;
alter table public.honorpole_pairing_history_r3 enable row level security;
alter table public.honorpole_pairing_requests_r3 enable row level security;
revoke all on public.honorpole_pairing_history_r3, public.honorpole_pairing_requests_r3
    from public,anon,authenticated,service_role;
insert into public.honorpole_pairing_history_r3(device_id,code_hash)
    select device_id,pairing_code_hash from public.devices where pairing_code_hash is not null;

create function public.honorpole_replace_pairing_code_r3(
    p_device_id text, p_request_id uuid,
    p_expected_pairing_hash text, p_pairing_code_hash text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_device public.devices%rowtype;
    v_request public.honorpole_pairing_requests_r3%rowtype;
    v_now timestamptz;
    v_expires timestamptz;
begin
    if p_device_id is null or p_device_id !~ '^HP-[0-9]{3,6}$'
       or p_request_id is null
       or p_expected_pairing_hash is null or p_expected_pairing_hash !~ '^[0-9a-f]{64}$'
       or p_pairing_code_hash is null or p_pairing_code_hash !~ '^[0-9a-f]{64}$'
       or p_expected_pairing_hash = p_pairing_code_hash then
        raise exception 'Invalid guarded pairing request' using errcode = 'HP400';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(179123, 1005);
    select * into v_device from public.devices where device_id=p_device_id for update;
    if not found then
        raise exception 'Factory device not found' using errcode = 'HP404';
    end if;
    if not coalesce(v_device.is_active,false) or not coalesce(v_device.active,false) then
        raise exception 'Device is inactive' using errcode = 'HP409';
    end if;
    perform 1 from public.honorpole_factory_credentials
        where device_id=p_device_id and revoked_at is null for share;
    if not found then
        raise exception 'Factory credential unavailable' using errcode = 'HP409';
    end if;
    -- These checks deliberately precede journal replay, including exact retries.
    if v_device.pairing_claimed_at is not null
       or exists(select 1 from public.device_users where device_id=p_device_id) then
        raise exception 'Device already assigned' using errcode = 'HP409';
    end if;
    v_now := clock_timestamp();
    select * into v_request from public.honorpole_pairing_requests_r3 where request_id=p_request_id;
    if found then
        if v_request.device_id <> p_device_id
           or v_request.expected_hash <> p_expected_pairing_hash
           or v_request.issued_hash <> p_pairing_code_hash then
            raise exception 'Request payload conflict' using errcode = 'HP409';
        end if;
        if v_device.pairing_code_hash is distinct from v_request.issued_hash
           or v_device.pairing_code_expires_at is distinct from v_request.expires_at then
            raise exception 'Request superseded or state changed' using errcode = 'HP409';
        end if;
        if v_request.expires_at <= v_now then
            raise exception 'A new pairing request is required' using errcode = 'HP410';
        end if;
        return jsonb_build_object('deviceId',p_device_id,'expiresAt',v_request.expires_at);
    end if;
    if v_device.pairing_code_hash is distinct from p_expected_pairing_hash then
        raise exception 'Expected pairing code is stale' using errcode = 'HP409';
    end if;
    if exists(select 1 from public.honorpole_pairing_history_r3
              where device_id=p_device_id and code_hash=p_pairing_code_hash) then
        raise exception 'Previously recorded code cannot be reactivated' using errcode = 'HP409';
    end if;
    -- New registrations after migration are enrolled lazily under the same locks.
    insert into public.honorpole_pairing_history_r3(device_id,code_hash)
        values(p_device_id,p_expected_pairing_hash) on conflict do nothing;
    v_expires := clock_timestamp() + interval '1 hour';
    begin
        update public.devices set pairing_code_hash=p_pairing_code_hash,
            pairing_code_expires_at=v_expires,updated_at=clock_timestamp()
            where id=v_device.id;
        insert into public.honorpole_pairing_history_r3(device_id,code_hash)
            values(p_device_id,p_pairing_code_hash);
        insert into public.honorpole_pairing_requests_r3(
            request_id,device_id,expected_hash,issued_hash,expires_at)
            values(p_request_id,p_device_id,p_expected_pairing_hash,p_pairing_code_hash,v_expires);
    exception when unique_violation then
        raise exception 'Pairing code or request already reserved' using errcode = 'HP409';
    end;
    return jsonb_build_object('deviceId',p_device_id,'expiresAt',v_expires);
end;
$$;
alter function public.honorpole_replace_pairing_code_r3(text,uuid,text,text) owner to postgres;
revoke all on function public.honorpole_replace_pairing_code_r3(text,uuid,text,text)
    from public,anon,authenticated,service_role;
grant execute on function public.honorpole_replace_pairing_code_r3(text,uuid,text,text) to service_role;
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
    raise exception 'Generation-aware replacement required' using errcode = 'HP409';
end;
$$;
alter function public.honorpole_reissue_pairing_code(text,text) owner to postgres;
revoke all on function public.honorpole_reissue_pairing_code(text,text)
    from public,anon,authenticated,service_role;
grant execute on function public.honorpole_reissue_pairing_code(text,text) to service_role;
-- Read-only capability probe, installed atomically with both issuance guards.
create function public.honorpole_pairing_protocol_r3(p_device_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if p_device_id is null or p_device_id !~ '^HP-[0-9]{3,6}$' then
        raise exception 'Invalid device ID' using errcode = 'HP400';
    end if;
    if not exists(select 1 from public.devices where device_id=p_device_id) then
        raise exception 'Factory device not found' using errcode = 'HP404';
    end if;
    if not exists(select 1 from public.devices d
        join public.honorpole_factory_credentials c on c.device_id=d.device_id
        where d.device_id=p_device_id and coalesce(d.is_active,false)
          and coalesce(d.active,false) and c.revoked_at is null) then
        raise exception 'Device credentials unavailable' using errcode = 'HP409';
    end if;
    -- Discovery may succeed for a claimed device; issuance still refuses it.
    return jsonb_build_object('deviceId',p_device_id,'protocol',3);
end;
$$;
alter function public.honorpole_pairing_protocol_r3(text) owner to postgres;
revoke all on function public.honorpole_pairing_protocol_r3(text)
    from public,anon,authenticated,service_role;
grant execute on function public.honorpole_pairing_protocol_r3(text) to service_role;
notify pgrst,'reload schema';
commit;
