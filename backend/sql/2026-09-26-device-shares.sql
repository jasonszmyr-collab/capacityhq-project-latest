-- Run once in the Supabase SQL editor before deploying share endpoints.
-- The backend stores only hashes of short-lived, one-use codes.
create table if not exists public.honorpole_shares (
    token_hash text primary key,
    device_id text not null,
    created_by uuid not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    redeemed_by uuid
);

create index if not exists honorpole_shares_device_idx
    on public.honorpole_shares (device_id, expires_at);

alter table public.honorpole_shares enable row level security;

-- Only the backend service role can create tokens. An authenticated user can
-- redeem one through this function, which atomically spends it.
create or replace function public.redeem_honorpole_share(p_token_hash text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_device_id text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;

    update public.honorpole_shares
       set redeemed_by = auth.uid()
     where token_hash = p_token_hash
       and redeemed_by is null
       and expires_at > now()
       and created_by <> auth.uid()
     returning device_id into v_device_id;

    if v_device_id is null then
        raise exception 'Share code invalid, expired, or already used' using errcode = '22023';
    end if;

    insert into public.device_users (device_id, user_id, role)
    values (v_device_id, auth.uid(), 'member')
    on conflict do nothing;

    return v_device_id;
end;
$$;

revoke all on function public.redeem_honorpole_share(text) from public;
grant execute on function public.redeem_honorpole_share(text) to authenticated;
