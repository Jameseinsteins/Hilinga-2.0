-- Add nationality to profiles for Explore badge

-- Nationality / country on profiles for Explore badge (idempotent)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='nationality') then
    alter table public.profiles add column nationality text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='country') then
    alter table public.profiles add column country text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='country_iso2') then
    alter table public.profiles add column country_iso2 text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='avatar_path') then
    -- no-op guard
    null;
  end if;
end $$;
