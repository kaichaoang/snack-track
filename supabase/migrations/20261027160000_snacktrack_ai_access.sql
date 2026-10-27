-- Who may use AI estimates, and a per-day cap so a leaked session can't run up costs.
-- Already applied; kept here as the record of the schema.
create table public.snack_ai_access (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  daily_limit int not null default 60
);
create table public.snack_ai_usage (
  user_id uuid not null references public.app_users(id) on delete cascade,
  day date not null,
  calls int not null default 0,
  primary key (user_id, day)
);
alter table public.snack_ai_access enable row level security;
alter table public.snack_ai_usage enable row level security;
revoke all on public.snack_ai_access, public.snack_ai_usage from anon, authenticated;

-- Grant access by username, e.g.:
-- insert into public.snack_ai_access(user_id) select id from public.app_users where username = 'kaichaoang';

-- Called by the snack-estimate edge function (service role only).
create or replace function public.snack_ai_begin(p_token text)
returns uuid language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp' as $$
declare uid uuid := auth_user(p_token); lim int; used int;
begin
  select daily_limit into lim from snack_ai_access where user_id = uid;
  if lim is null then raise exception 'AI estimates are not enabled for this account'; end if;
  insert into snack_ai_usage(user_id, day, calls) values (uid, (now() at time zone 'Asia/Singapore')::date, 1)
  on conflict (user_id, day) do update set calls = snack_ai_usage.calls + 1
  returning calls into used;
  if used > lim then raise exception 'Daily AI limit reached. Try again tomorrow or log manually.'; end if;
  return uid;
end $$;
revoke execute on function public.snack_ai_begin(text) from public, anon, authenticated;
grant execute on function public.snack_ai_begin(text) to service_role;

-- snack_load now also returns whether the account may use AI.
create or replace function public.snack_load(p_token text)
returns jsonb language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp' as $$
declare uid uuid := auth_user(p_token);
begin
  return jsonb_build_object(
    'profile', (select profile from snack_profiles where user_id = uid),
    'entries', coalesce((select jsonb_agg(data order by day, (data->>'createdAt')) from snack_entries where user_id = uid), '[]'::jsonb),
    'weights', coalesce((select jsonb_agg(jsonb_build_object('date', to_char(day, 'YYYY-MM-DD'), 'kg', kg) order by day)
                           from snack_weights where user_id = uid), '[]'::jsonb),
    'ai', exists (select 1 from snack_ai_access where user_id = uid)
  );
end $$;
