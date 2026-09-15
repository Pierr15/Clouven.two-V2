-- Custom Display Name only. Apply after initial schema, Rev9 and Rev12.
begin;
alter table public.members
  add column if not exists name_style text not null default 'default',
  add column if not exists name_color_1 text not null default '#7DD3FC',
  add column if not exists name_color_2 text not null default '#A78BFA',
  add column if not exists name_color_3 text default null;

alter table public.members drop constraint if exists members_name_customization_valid;
alter table public.members add constraint members_name_customization_valid check (
  name_style in ('default','solid','gradient','flow','neon','prism','shimmer') and
  name_color_1 ~ '^#[0-9A-Fa-f]{6}$' and length(name_color_1)=7 and
  name_color_2 ~ '^#[0-9A-Fa-f]{6}$' and length(name_color_2)=7 and
  (name_color_3 is null or (name_color_3 ~ '^#[0-9A-Fa-f]{6}$' and length(name_color_3)=7))
);

-- Preserve server-only member writes. The function below is the sole browser write path.
revoke insert, update, delete on public.members from anon, authenticated;
revoke update(name_style,name_color_1,name_color_2,name_color_3) on public.members from public,anon,authenticated;

-- Defense in depth: other server APIs cannot edit these fields for another person.
-- A role change alone may retain saved preferences, but never activates them for a non-Developer.
create or replace function public.guard_name_customization()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.name_style <> 'default' or new.name_color_1 <> '#7DD3FC' or
       new.name_color_2 <> '#A78BFA' or new.name_color_3 is not null then
      raise exception 'Buat profil default sebelum memilih display name.' using errcode='42501';
    end if;
  elsif row(new.name_style,new.name_color_1,new.name_color_2,new.name_color_3)
    is distinct from row(old.name_style,old.name_color_1,old.name_color_2,old.name_color_3) then
    if auth.uid() is null or auth.uid() <> old.id or new.id <> old.id or
       old.role <> 'developer' or new.role <> 'developer' then
      raise exception 'Hanya Developer dapat mengubah display name miliknya sendiri.' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_name_customization() from public,anon,authenticated;
drop trigger if exists trg_guard_name_customization on public.members;
create trigger trg_guard_name_customization before insert or update on public.members
for each row execute function public.guard_name_customization();

create or replace function public.set_my_name_customization(settings jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.members; saved public.members;
begin
  if auth.uid() is null then raise exception 'Silakan login.' using errcode='42501'; end if;
  -- Row lock makes saving atomic with concurrent role updates/demotion.
  select * into actor from public.members where id=auth.uid() for update;
  if actor.id is null or actor.role <> 'developer' then
    raise exception 'Fitur ini hanya tersedia untuk Developer.' using errcode='42501';
  end if;
  if settings is null or jsonb_typeof(settings) <> 'object' then
    raise exception 'Pengaturan tidak valid.' using errcode='22023';
  end if;
  if not (settings ?& array['name_style','name_color_1','name_color_2','name_color_3']) or
     exists(select 1 from jsonb_object_keys(settings) k where k not in ('name_style','name_color_1','name_color_2','name_color_3')) or
     jsonb_typeof(settings->'name_style') is distinct from 'string' or
     (settings->>'name_style') not in ('default','solid','gradient','flow','neon','prism','shimmer') or
     jsonb_typeof(settings->'name_color_1') is distinct from 'string' or
     jsonb_typeof(settings->'name_color_2') is distinct from 'string' or
     (settings->>'name_color_1') !~ '^#[0-9A-Fa-f]{6}$' or length(settings->>'name_color_1')<>7 or
     (settings->>'name_color_2') !~ '^#[0-9A-Fa-f]{6}$' or length(settings->>'name_color_2')<>7 or
     (jsonb_typeof(settings->'name_color_3') <> 'null' and (
       jsonb_typeof(settings->'name_color_3') is distinct from 'string' or
       (settings->>'name_color_3') !~ '^#[0-9A-Fa-f]{6}$' or length(settings->>'name_color_3')<>7)) then
    raise exception 'Style atau warna tidak valid.' using errcode='22023';
  end if;
  update public.members set
    name_style=settings->>'name_style', name_color_1=upper(settings->>'name_color_1'),
    name_color_2=upper(settings->>'name_color_2'), name_color_3=upper(settings->>'name_color_3'),
    updated_at=now(), updated_by=actor.id
  where id=actor.id returning * into saved;
  return jsonb_build_object('id',saved.id,'name',saved.name,'role',saved.role,
    'name_style',saved.name_style,'name_color_1',saved.name_color_1,
    'name_color_2',saved.name_color_2,'name_color_3',saved.name_color_3);
end;
$$;
revoke all on function public.set_my_name_customization(jsonb) from public,anon,service_role;
grant execute on function public.set_my_name_customization(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
