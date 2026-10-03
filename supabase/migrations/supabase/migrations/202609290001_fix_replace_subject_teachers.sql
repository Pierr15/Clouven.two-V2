create or replace function public.replace_subject_teachers(entries jsonb)
returns void
language plpgsql
security invoker
set search_path=''
as $$
declare
  item jsonb;
  names text[];
begin
  if not public.has_app_role('class_officer') then
    raise exception 'Akses tidak diizinkan.' using errcode='42501';
  end if;

  if entries is null or jsonb_typeof(entries)<>'array' then
    raise exception 'Daftar mapel harus berupa array.';
  end if;

  if jsonb_array_length(entries)>100 then
    raise exception 'Maksimal 100 mapel.';
  end if;

  perform pg_advisory_xact_lock(609070001);

  for item in select value from jsonb_array_elements(entries) loop

    if jsonb_typeof(item->'subject') is distinct from 'string'
       or length(btrim(item->>'subject')) not between 1 and 100 then
      raise exception 'Nama mapel tidak valid.';
    end if;

    if jsonb_typeof(item->'teachers') is distinct from 'array' then
      raise exception 'Daftar guru tidak valid.';
    end if;

    if jsonb_array_length(item->'teachers') not between 1 and 20 then
      raise exception 'Isi 1-20 guru per mapel.';
    end if;

    if exists(
      select 1
      from jsonb_array_elements(item->'teachers') t
      where jsonb_typeof(t) <> 'string'
        or length(btrim(t#>>'{}')) not between 1 and 100
    ) then
      raise exception 'Nama guru tidak valid.';
    end if;

    select array_agg(btrim(value))
    into names
    from jsonb_array_elements_text(item->'teachers');

    if cardinality(names) <>
       (select count(distinct lower(n)) from unnest(names) n) then
      raise exception 'Guru duplikat.';
    end if;

  end loop;

  -- FIX: safeupdate membutuhkan WHERE
  delete from public.subject_teachers
  where subject is not null;

  insert into public.subject_teachers(subject,teachers)
  select
    btrim(entry->>'subject'),
    array(
      select btrim(value)
      from jsonb_array_elements_text(entry->'teachers')
    )
  from jsonb_array_elements(entries) entry;

end;
$$;

revoke all on function public.replace_subject_teachers(jsonb)
from public, anon;

grant execute on function public.replace_subject_teachers(jsonb)
to authenticated;