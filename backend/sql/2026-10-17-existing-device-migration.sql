-- Candidate only: install the function before enabling the backend route.
-- Inserts one credential for an existing claimed device; never rewrites devices,
-- api_key, device_users, names, locations or pairing state. No credentials here.
begin;
create or replace function public.honorpole_factory_migrate(
    p_device_id text, p_request_id uuid, p_secret_hash text, p_registration_hash text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_device public.devices%rowtype;
    v_existing public.honorpole_factory_credentials%rowtype;
begin
    if p_device_id is null or p_device_id !~ '^HP-[0-9]{3,6}$'
       or substring(p_device_id from 4)::integer < 1
       or p_request_id is null or p_secret_hash is null
       or p_secret_hash !~ '^[0-9a-f]{64}$'
       or p_registration_hash is null or p_registration_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'Invalid migration request' using errcode = 'HP400';
    end if;
    -- Same lock as normal registration: request IDs cannot race allocation.
    perform pg_catalog.pg_advisory_xact_lock(179123, 1005);
    select * into v_device from public.devices
      where device_id = p_device_id for update;
    if not found then
        raise exception 'Existing device not found' using errcode = 'HP404';
    end if;
    if v_device.is_active is distinct from true or v_device.active is distinct from true
       or not exists(select 1 from public.device_users where device_id = p_device_id) then
        raise exception 'Existing active claimed device required' using errcode = 'HP409';
    end if;
    select * into v_existing from public.honorpole_factory_credentials
      where device_id = p_device_id or factory_request_id = p_request_id;
    if found then
        -- Also rejects the case where ID and request match two different rows.
        if (select count(*) from public.honorpole_factory_credentials
            where device_id = p_device_id or factory_request_id = p_request_id) <> 1
           or v_existing.device_id <> p_device_id
           or v_existing.factory_request_id <> p_request_id
           or v_existing.secret_hash <> p_secret_hash
           or v_existing.registration_hash <> p_registration_hash
           or v_existing.revoked_at is not null then
            raise exception 'Migration conflict' using errcode = 'HP409';
        end if;
        return jsonb_build_object('deviceId',p_device_id,'created',false,
            'claimed',true,'migrated',false);
    end if;
    insert into public.honorpole_factory_credentials(
        device_id,secret_hash,factory_request_id,registration_hash)
      values(p_device_id,p_secret_hash,p_request_id,p_registration_hash);
    return jsonb_build_object('deviceId',p_device_id,'created',false,
        'claimed',true,'migrated',true);
end;
$$;
revoke all on function public.honorpole_factory_migrate(text,uuid,text,text)
    from public,anon,authenticated,service_role;
grant execute on function public.honorpole_factory_migrate(text,uuid,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
