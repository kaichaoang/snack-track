-- SnackTrack tables and functions in the shared SplitDumb Supabase project
-- (esnphmnqxbdeygwrusjv). Already applied; kept here as the record of the schema.
--
-- Accounts come from SplitDumb: public.app_users / public.sessions, with
-- register_user, login_user, logout and auth_user(token).
-- Same model as SplitDumb: tables are locked (RLS on, no policies, no grants);
-- the app calls SECURITY DEFINER functions that check the session token.

create table public.snack_profiles (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  profile jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.snack_entries (
  user_id uuid not null references public.app_users(id) on delete cascade,
  id text not null,
  day date not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index snack_entries_user_day on public.snack_entries (user_id, day);

create table public.snack_weights (
  user_id uuid not null references public.app_users(id) on delete cascade,
  day date not null,
  kg numeric(5,1) not null check (kg > 20 and kg < 400),
  primary key (user_id, day)
);

alter table public.snack_profiles enable row level security;
alter table public.snack_entries enable row level security;
alter table public.snack_weights enable row level security;
revoke all on public.snack_profiles, public.snack_entries, public.snack_weights from anon, authenticated;

-- Everything for this user, for the initial pull.
create or replace function public.snack_load(p_token text)
returns jsonb language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp' as $$
declare uid uuid := auth_user(p_token);
begin
  return jsonb_build_object(
    'profile', (select profile from snack_profiles where user_id = uid),
    'entries', coalesce((select jsonb_agg(data order by day, (data->>'createdAt')) from snack_entries where user_id = uid), '[]'::jsonb),
    'weights', coalesce((select jsonb_agg(jsonb_build_object('date', to_char(day, 'YYYY-MM-DD'), 'kg', kg) order by day)
                           from snack_weights where user_id = uid), '[]'::jsonb)
  );
end $$;

create or replace function public.snack_save_profile(p_token text, p_profile jsonb)
returns boolean language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp' as $$
declare uid uuid := auth_user(p_token);
begin
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' or length(p_profile::text) > 4000 then
    raise exception 'Invalid profile';
  end if;
  insert into snack_profiles(user_id, profile) values (uid, p_profile)
  on conflict (user_id) do update set profile = excluded.profile, updated_at = now();
  return true;
end $$;

-- Insert or replace a batch of food entries (each the app's FoodEntry JSON).
create or replace function public.snack_upsert_entries(p_token text, p_entries jsonb)
returns int language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp' as $$
declare uid uuid := auth_user(p_token); e jsonb; n int := 0;
begin
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 1000 then
    raise exception 'Invalid entries';
  end if;
  for e in select * from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(e) <> 'object' or coalesce(e->>'id', '') !~ '^[A-Za-z0-9-]{1,64}$'
       or coalesce(e->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' or length(e::text) > 20000 then
      raise exception 'Invalid food entry';
    end if;
    insert into snack_entries(user_id, id, day, data) values (uid, e->>'id', (e->>'date')::date, e)
    on conflict (user_id, id) do update set day = excluded.day, data = excluded.data, updated_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.snack_delete_entry(p_token text, p_id text)
returns boolean language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp' as $$
declare uid uuid := auth_user(p_token);
begin
  delete from snack_entries where user_id = uid and id = p_id;
  return true;
end $$;

create or replace function public.snack_set_weight(p_token text, p_day date, p_kg numeric)
returns boolean language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp' as $$
declare uid uuid := auth_user(p_token);
begin
  if p_day is null or p_kg is null or p_kg <= 20 or p_kg >= 400 then raise exception 'Invalid weight'; end if;
  insert into snack_weights(user_id, day, kg) values (uid, p_day, p_kg)
  on conflict (user_id, day) do update set kg = excluded.kg;
  return true;
end $$;

create or replace function public.snack_delete_weight(p_token text, p_day date)
returns boolean language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp' as $$
declare uid uuid := auth_user(p_token);
begin
  delete from snack_weights where user_id = uid and day = p_day;
  return true;
end $$;

-- Cheap query for the scheduled keep-alive ping (.github/workflows/keepalive.yml).
create or replace function public.keepalive()
returns int language sql stable set search_path to 'pg_temp' as $$ select 1 $$;

revoke execute on function public.snack_load(text), public.snack_save_profile(text, jsonb),
  public.snack_upsert_entries(text, jsonb), public.snack_delete_entry(text, text),
  public.snack_set_weight(text, date, numeric), public.snack_delete_weight(text, date), public.keepalive() from public;
grant execute on function public.snack_load(text), public.snack_save_profile(text, jsonb),
  public.snack_upsert_entries(text, jsonb), public.snack_delete_entry(text, text),
  public.snack_set_weight(text, date, numeric), public.snack_delete_weight(text, date), public.keepalive() to anon, authenticated;
