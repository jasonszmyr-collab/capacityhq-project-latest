-- Additive candidate migration. Existing device identities/keys/owners are not changed.
begin;

-- Require the existing identity keys to be unique; do not silently change them.
do $$
declare v_column text;
begin
    foreach v_column in array array['id','device_id'] loop
        if not exists (
            select 1 from pg_catalog.pg_index i
            join pg_catalog.pg_attribute a on a.attrelid = i.indrelid
              and a.attname = v_column
            where i.indrelid = 'public.devices'::regclass
              and i.indisunique and i.indisvalid and i.indpred is null
              and i.indexprs is null and i.indnkeyatts = 1 and i.indkey[0] = a.attnum
        ) then
            raise exception 'Existing devices identity key is not unique; stop for schema review';
        end if;
    end loop;
end;
$$;

create table if not exists public.honorpole_factory_credentials (
    device_id text primary key check (device_id ~ '^HP-[0-9]{3,6}$'),
    secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
    factory_request_id uuid not null unique,
    registration_hash text not null check (registration_hash ~ '^[0-9a-f]{64}$'),
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);
alter table public.honorpole_factory_credentials enable row level security;
revoke all on public.honorpole_factory_credentials from public, anon, authenticated;
-- All factory access goes through explicitly privileged functions below.
revoke all on public.honorpole_factory_credentials from service_role;

create or replace function public.honorpole_factory_register(
    p_request_id uuid, p_secret_hash text, p_registration_hash text,
    p_pairing_code_hash text, p_name text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_existing public.honorpole_factory_credentials%rowtype;
    v_device public.devices%rowtype;
    v_number integer;
    v_device_id text;
    v_expires timestamptz := now() + interval '1 hour';
begin
    if p_request_id is null or p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$'
       or p_registration_hash is null or p_registration_hash !~ '^[0-9a-f]{64}$'
       or p_pairing_code_hash is null or p_pairing_code_hash !~ '^[0-9a-f]{64}$'
       or p_name is null or length(btrim(p_name)) < 1 or length(p_name) > 100 then
        raise exception 'Invalid factory request' using errcode = 'HP400';
    end if;
    -- Factory writes are rare. Serialize allocation and idempotent retries across instances.
    perform pg_catalog.pg_advisory_xact_lock(179123, 1005);
    select * into v_existing from public.honorpole_factory_credentials
      where factory_request_id = p_request_id;
    if found then
        if v_existing.secret_hash <> p_secret_hash
           or v_existing.registration_hash <> p_registration_hash
           or v_existing.revoked_at is not null then
            raise exception 'Factory request conflict' using errcode = 'HP409';
        end if;
        select * into strict v_device from public.devices where device_id = v_existing.device_id;
        if not v_device.is_active or not v_device.active then
            raise exception 'Device is inactive' using errcode = 'HP409';
        end if;
        return jsonb_build_object('deviceId',v_existing.device_id,'created',false,
            'expiresAt',v_device.pairing_code_expires_at,
            'claimed',v_device.pairing_claimed_at is not null);
    end if;
    select coalesce(max(substring(device_id from 4)::integer),0) + 1 into v_number
      from (
        select device_id from public.devices where device_id ~ '^HP-[0-9]{3,6}$'
        union all
        select device_id from public.honorpole_factory_credentials
      ) ids;
    if v_number > 999999 then
        raise exception 'Device ID range exhausted' using errcode = 'HP409';
    end if;
    v_device_id := 'HP-' || lpad(v_number::text, greatest(3,length(v_number::text)), '0');
    if exists (select 1 from public.devices where pairing_code_hash = p_pairing_code_hash
               and pairing_claimed_at is null and pairing_code_expires_at > now()) then
        raise exception 'Pairing code already reserved' using errcode = 'HP409';
    end if;
    -- api_key is a separate required legacy database field, not the board secret.
    insert into public.devices(device_id,api_key,name,is_active,active,
        firmware_version,online,pairing_code_hash,pairing_code_expires_at)
      values(v_device_id,pg_catalog.gen_random_uuid()::text,btrim(p_name),true,true,
        'unverified',false,p_pairing_code_hash,v_expires);
    insert into public.honorpole_factory_credentials(device_id,secret_hash,
        factory_request_id,registration_hash)
      values(v_device_id,p_secret_hash,p_request_id,p_registration_hash);
    return jsonb_build_object('deviceId',v_device_id,'created',true,
        'expiresAt',v_expires,'claimed',false);
end;
$$;

create or replace function public.honorpole_factory_lookup(p_device_id text)
returns table(device_id text,secret_hash text,enabled boolean)
language sql security definer set search_path = '' as $$
    select c.device_id,c.secret_hash,
        coalesce(c.revoked_at is null and d.is_active and d.active,false)
      from public.honorpole_factory_credentials c
      left join public.devices d on d.device_id = c.device_id
      where c.device_id = p_device_id;
$$;

-- Atomic claim prevents simultaneous users from both becoming device owners.
create or replace function public.honorpole_claim_device(
    p_pairing_code_hash text, p_device_id text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_user uuid := auth.uid();
    v_device public.devices%rowtype;
begin
    if v_user is null then
        raise exception 'Authentication required' using errcode = 'HP401';
    end if;
    if p_pairing_code_hash is null or p_pairing_code_hash !~ '^[0-9a-f]{64}$'
       or (p_device_id is not null and p_device_id !~ '^HP-[0-9]{3,6}$') then
        raise exception 'Invalid pairing request' using errcode = 'HP400';
    end if;
    select * into v_device from public.devices
      where pairing_code_hash = p_pairing_code_hash
        and (p_device_id is null or device_id = p_device_id)
        and is_active and active
      order by device_id limit 1 for update;
    if not found then
        raise exception 'Invalid pairing code' using errcode = 'HP404';
    end if;
    if v_device.pairing_claimed_at is not null
       or exists(select 1 from public.device_users where device_id = v_device.device_id) then
        raise exception 'Pairing code already used' using errcode = 'HP409';
    end if;
    if v_device.pairing_code_expires_at is null or v_device.pairing_code_expires_at <= now() then
        raise exception 'Pairing code expired' using errcode = 'HP410';
    end if;
    insert into public.device_users(device_id,user_id,role)
      values(v_device.device_id,v_user,'admin');
    update public.devices set pairing_claimed_at = now(),updated_at = now()
      where id = v_device.id;
    return jsonb_build_object('deviceId',v_device.device_id,'deviceName',v_device.name);
end;
$$;

-- Postgres/Supabase may grant new functions broadly by default; revoke explicitly.
revoke all on function public.honorpole_factory_register(uuid,text,text,text,text)
    from public,anon,authenticated,service_role;
revoke all on function public.honorpole_factory_lookup(text)
    from public,anon,authenticated,service_role;
revoke all on function public.honorpole_claim_device(text,text)
    from public,anon,authenticated,service_role;
grant execute on function public.honorpole_factory_register(uuid,text,text,text,text) to service_role;
grant execute on function public.honorpole_factory_lookup(text) to service_role;
grant execute on function public.honorpole_claim_device(text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
