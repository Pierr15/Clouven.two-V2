-- Rev12. Run after the initial schema and Rev9 migration.
begin;
alter table public.members add column if not exists instagram text not null default '';
alter table public.members drop constraint if exists members_instagram_valid;
alter table public.members add constraint members_instagram_valid check (
 instagram='' or (instagram ~ '^[a-z0-9_]([a-z0-9_.]{0,28}[a-z0-9_])?$' and position('..' in instagram)=0)
);
-- Member writes remain server-only; the dedicated API restricts edits to self.
create table if not exists public.subject_teachers (
 subject text primary key check (length(btrim(subject)) between 1 and 100),
 teachers text[] not null check (cardinality(teachers) between 1 and 20),
 updated_at timestamptz not null default now()
);
create unique index if not exists subject_teachers_casefold on public.subject_teachers(lower(subject));
alter table public.subject_teachers enable row level security;
grant select,insert,update,delete on public.subject_teachers to authenticated;
grant all on public.subject_teachers to service_role;
revoke all on public.subject_teachers from anon;
drop policy if exists "Managers manage subject teachers" on public.subject_teachers;
create policy "Managers manage subject teachers" on public.subject_teachers for all to authenticated
 using(public.has_app_role('class_officer')) with check(public.has_app_role('class_officer'));
create or replace function public.replace_subject_teachers(entries jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb; names text[];
begin
 if not public.has_app_role('class_officer') then raise exception 'Akses tidak diizinkan.' using errcode='42501'; end if;
 if entries is null or jsonb_typeof(entries)<>'array' then raise exception 'Daftar mapel harus berupa array.'; end if;
 if jsonb_array_length(entries)>100 then raise exception 'Maksimal 100 mapel.'; end if;
 perform pg_advisory_xact_lock(609070001);
 for item in select value from jsonb_array_elements(entries) loop
  if jsonb_typeof(item->'subject') is distinct from 'string' or length(btrim(item->>'subject')) not between 1 and 100 then raise exception 'Nama mapel tidak valid.'; end if;
  if jsonb_typeof(item->'teachers') is distinct from 'array' then raise exception 'Daftar guru tidak valid.'; end if;
  if jsonb_array_length(item->'teachers') not between 1 and 20 then raise exception 'Isi 1-20 guru per mapel.'; end if;
  if exists(select 1 from jsonb_array_elements(item->'teachers') t where jsonb_typeof(t) <> 'string' or length(btrim(t#>>'{}')) not between 1 and 100) then raise exception 'Nama guru tidak valid.'; end if;
  select array_agg(btrim(value)) into names from jsonb_array_elements_text(item->'teachers');
  if cardinality(names)<>(select count(distinct lower(n)) from unnest(names) n) then raise exception 'Guru duplikat.'; end if;
 end loop;
 delete from public.subject_teachers;
 insert into public.subject_teachers(subject,teachers)
 select btrim(entry->>'subject'),array(select btrim(value) from jsonb_array_elements_text(entry->'teachers'))
 from jsonb_array_elements(entries) entry;
end;
$$;
revoke all on function public.replace_subject_teachers(jsonb) from public,anon;
grant execute on function public.replace_subject_teachers(jsonb) to authenticated;
commit;
