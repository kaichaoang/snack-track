-- Deleting an entry hides it (deleted_at) instead of erasing it, so accidental deletes can be recovered.
-- Applied 2026-10-28; kept here as the record of the schema.
alter table public.snack_entries add column if not exists deleted_at timestamptz;

create or replace function public.snack_delete_entry(p_token text, p_id text)
returns boolean language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp' as $$
declare uid uuid := auth_user(p_token);
begin
  update snack_entries set deleted_at = now() where user_id = uid and id = p_id and deleted_at is null;
  return true;
end $$;

-- Re-saving an entry (e.g. Undo) brings it back.
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
    on conflict (user_id, id) do update set day = excluded.day, data = excluded.data, updated_at = now(), deleted_at = null;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.snack_load(p_token text)
returns jsonb language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp' as $$
declare uid uuid := auth_user(p_token);
begin
  return jsonb_build_object(
    'profile', (select profile from snack_profiles where user_id = uid),
    'entries', coalesce((select jsonb_agg(data order by day, (data->>'createdAt')) from snack_entries
                           where user_id = uid and deleted_at is null), '[]'::jsonb),
    'weights', coalesce((select jsonb_agg(jsonb_build_object('date', to_char(day, 'YYYY-MM-DD'), 'kg', kg) order by day)
                           from snack_weights where user_id = uid), '[]'::jsonb),
    'ai', exists (select 1 from snack_ai_access where user_id = uid)
  );
end $$;
