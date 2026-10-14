-- ClouvenTwo: single protected Owner role and explicit owner-to-owner transfer.
-- Initial ownership is bootstrapped separately through a trusted Supabase SQL session.

begin;

-- Keep the migration generic: the first Owner identity is assigned separately
-- through a trusted Supabase SQL session after the app build supports this role.



alter table public.members
  drop constraint if exists members_role_check;

alter table public.members
  add constraint members_role_check
  check (role in ('student','class_officer','teacher','developer','owner'));

create or replace function public.role_rank(role_name text)
returns integer
language sql
immutable
set search_path to ''
as $function$
  select case role_name
    when 'owner' then 5
    when 'developer' then 4
    when 'teacher' then 3
    when 'class_officer' then 2
    when 'student' then 1
    else 0
  end;
$function$;

-- A partial unique index makes the one-owner rule concurrency-safe at the database layer.
create unique index if not exists members_single_owner_idx
  on public.members (role)
  where role = 'owner';

create table if not exists public.owner_transfer_audit (
  id bigint generated always as identity primary key,
  previous_owner_id uuid references auth.users(id) on delete set null,
  new_owner_id uuid references auth.users(id) on delete set null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

alter table public.owner_transfer_audit enable row level security;
revoke all on public.owner_transfer_audit from anon, authenticated;
grant select on public.owner_transfer_audit to authenticated;
drop policy if exists "Owner can read owner transfer audit" on public.owner_transfer_audit;
create policy "Owner can read owner transfer audit"
  on public.owner_transfer_audit
  for select
  to authenticated
  using (public.current_app_role() = 'owner');



create or replace function public.guard_owner_role_changes()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      raise exception 'The active Owner account cannot be deleted. Transfer ownership first.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'owner'
       and current_setting('app.owner_transfer_authorized', true) is distinct from 'on' then
      raise exception 'Only the active Owner can grant the Owner role through the transfer flow.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.role is distinct from new.role
     and (old.role = 'owner' or new.role = 'owner')
     and current_setting('app.owner_transfer_authorized', true) is distinct from 'on' then
    raise exception 'Owner role changes require an authorized transfer initiated by the active Owner.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists members_guard_owner_role_changes on public.members;
create trigger members_guard_owner_role_changes
before insert or update or delete on public.members
for each row execute function public.guard_owner_role_changes();

create or replace function public.transfer_owner(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  acting_owner uuid := auth.uid();
begin
  if acting_owner is null
     or not exists (select 1 from public.members where id = acting_owner and role = 'owner') then
    raise exception 'Only the currently signed-in Owner can transfer ownership.'
      using errcode = '42501';
  end if;

  if target_user_id is null or target_user_id = acting_owner then
    raise exception 'Choose a different account as the next Owner.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.members where id = target_user_id) then
    raise exception 'The target account is not a registered member.'
      using errcode = 'P0002';
  end if;

  -- The trigger accepts Owner-role transitions only for this validated transaction.
  perform set_config('app.owner_transfer_authorized', 'on', true);

  update public.members
     set role = 'developer',
         updated_at = now(),
         updated_by = acting_owner
   where id = acting_owner and role = 'owner';

  if not found then
    raise exception 'The current Owner changed during the transfer. Please retry.'
      using errcode = '40001';
  end if;

  update public.members
     set role = 'owner',
         updated_at = now(),
         updated_by = acting_owner
   where id = target_user_id;

  if not found then
    raise exception 'The target account could not be promoted. The transfer was cancelled.'
      using errcode = 'P0002';
  end if;

  insert into public.owner_transfer_audit(previous_owner_id, new_owner_id, changed_by)
  values (acting_owner, target_user_id, acting_owner);
end;
$function$;

revoke all on function public.transfer_owner(uuid) from public, anon;
grant execute on function public.transfer_owner(uuid) to authenticated;
revoke all on function public.guard_owner_role_changes() from public, anon, authenticated;

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
       old.role not in ('developer','owner') or new.role not in ('developer','owner') then
      raise exception 'Fitur ini hanya tersedia untuk Developer dan Owner.' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_name_customization() from public, anon, authenticated;

create or replace function public.set_my_name_customization(settings jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.members; saved public.members;
begin
  if auth.uid() is null then raise exception 'Silakan login.' using errcode='42501'; end if;
  -- Row lock makes saving atomic with concurrent role updates/demotion.
  select * into actor from public.members where id=auth.uid() for update;
  if actor.id is null or actor.role not in ('developer','owner') then
    raise exception 'Fitur ini hanya tersedia untuk Developer dan Owner.' using errcode='42501';
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
     (settings->>'name_color_1') !~ '^#[0-9A-Fa-f]{6}
create or replace view public.public_developer_name_profiles as
select id, name, role, name_style, name_color_1, name_color_2, name_color_3
  from public.members
 where role in ('developer', 'owner');
grant select on public.public_developer_name_profiles to anon, authenticated;

-- Let both privileged roles manage their own avatar while keeping this policy narrow.
drop policy if exists "Developers can update own member photo" on public.members;
create policy "Privileged users can update own member photo"
  on public.members
  for update
  to authenticated
  using (id = auth.uid() and public.current_app_role() in ('developer','owner'))
  with check (id = auth.uid() and public.current_app_role() in ('developer','owner'));

notify pgrst, 'reload schema';
commit;
 or length(settings->>'name_color_1')<>7 or
     (settings->>'name_color_2') !~ '^#[0-9A-Fa-f]{6}
create or replace view public.public_developer_name_profiles as
select id, name, role, name_style, name_color_1, name_color_2, name_color_3
  from public.members
 where role in ('developer', 'owner');
grant select on public.public_developer_name_profiles to anon, authenticated;

-- Let both privileged roles manage their own avatar while keeping this policy narrow.
drop policy if exists "Developers can update own member photo" on public.members;
create policy "Privileged users can update own member photo"
  on public.members
  for update
  to authenticated
  using (id = auth.uid() and public.current_app_role() in ('developer','owner'))
  with check (id = auth.uid() and public.current_app_role() in ('developer','owner'));

commit;
 or length(settings->>'name_color_2')<>7 or
     (jsonb_typeof(settings->'name_color_3') <> 'null' and (
       jsonb_typeof(settings->'name_color_3') is distinct from 'string' or
       (settings->>'name_color_3') !~ '^#[0-9A-Fa-f]{6}
create or replace view public.public_developer_name_profiles as
select id, name, role, name_style, name_color_1, name_color_2, name_color_3
  from public.members
 where role in ('developer', 'owner');
grant select on public.public_developer_name_profiles to anon, authenticated;

-- Let both privileged roles manage their own avatar while keeping this policy narrow.
drop policy if exists "Developers can update own member photo" on public.members;
create policy "Privileged users can update own member photo"
  on public.members
  for update
  to authenticated
  using (id = auth.uid() and public.current_app_role() in ('developer','owner'))
  with check (id = auth.uid() and public.current_app_role() in ('developer','owner'));

commit;
 or length(settings->>'name_color_3')<>7)) then
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
revoke all on function public.set_my_name_customization(jsonb) from public, anon, service_role;
grant execute on function public.set_my_name_customization(jsonb) to authenticated;

create or replace function public.generate_productivity_reminders() returns integer language plpgsql security definer set search_path = '' as $$
declare added integer := 0; n integer; now_jakarta timestamp := now() at time zone 'Asia/Jakarta';
begin
 -- The unique (user_id,dedupe_key) constraint makes retries harmless. Date-only tasks end at 23:59 Jakarta time.
 with due_tasks as (
  select t.*, coalesce(t.due_at,((t.due + time '23:59:59') at time zone 'Asia/Jakarta')) as deadline
  from public.tasks t where t.status='open' and t.due is not null and t.due between now_jakarta::date and now_jakarta::date + 2
 ), thresholds as (select * from (values (1440,'1 hari'),(180,'3 jam'),(30,'30 menit')) v(minutes,label))
 insert into public.notifications(user_id,type,title,message,related_id,target_url,dedupe_key)
 select m.id,'assignment_due','Deadline tugas: '||left(t.title,140),'Tenggat '||h.label||' lagi.',t.id,'/tugas/?task='||t.id,
        'task:due:'||t.id||':'||t.deadline||':'||h.minutes
 from due_tasks t cross join thresholds h join public.members m on m.role in ('student','class_officer','teacher','developer','owner')
 left join public.task_progress p on p.task_id=t.id and p.user_id=m.id
 left join public.notification_preferences pref on pref.user_id=m.id
 where coalesce(pref.assignment_reminders,true) and not coalesce(p.done,false)
   and t.deadline > now() and t.deadline - make_interval(mins=>h.minutes) <= now()
   and t.deadline - make_interval(mins=>h.minutes) > now() - interval '20 minutes'
 on conflict do nothing;
 get diagnostics n = row_count; added := added+n;
 insert into public.notifications(user_id,type,title,message,related_id,target_url,dedupe_key)
 select m.id,'calendar_reminder','Pengingat: '||left(e.title,140),'Kegiatan segera dimulai.',e.id::text,'/kalender/?event='||e.id,
        'event:reminder:'||e.id||':'||e.start_at||':'||e.notification_offset
 from public.calendar_events e join public.members m on m.role in ('student','class_officer','teacher','developer','owner')
 left join public.notification_preferences pref on pref.user_id=m.id
 where e.notification_enabled and coalesce(pref.calendar_reminders,true)
   and e.start_at < now() + interval '1 day'
   and e.start_at > now() - interval '20 minutes' and e.start_at - make_interval(mins=>e.notification_offset) <= now()
   and e.start_at - make_interval(mins=>e.notification_offset) > now() - interval '20 minutes'
 on conflict do nothing;
 get diagnostics n = row_count; return added+n;
end; $;

create or replace function public.productivity_broadcast() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if tg_table_name = 'tasks' then
  if tg_op = 'INSERT' then
   insert into public.notifications(user_id,type,title,message,related_id,target_url,dedupe_key)
   select m.id,'assignment_new','Tugas baru: '||left(new.title,140),left(new.subject,600),new.id,'/tugas/?task='||new.id,'task:new:'||new.id
   from public.members m where m.role in ('student','class_officer','teacher','developer','owner') on conflict do nothing;
  end if;
 elsif tg_table_name = 'calendar_events' then
  if tg_op = 'INSERT' then
   insert into public.notifications(user_id,type,title,message,related_id,target_url,dedupe_key)
   select m.id,'calendar_new','Kegiatan baru: '||left(new.title,140),left(new.location,600),new.id::text,'/kalender/?event='||new.id,'event:new:'||new.id
   from public.members m where m.role in ('student','class_officer','teacher','developer','owner') on conflict do nothing;
  end if;
 elsif tg_table_name = 'schedules' and new.lessons is distinct from old.lessons then
  insert into public.notifications(user_id,type,title,message,related_id,target_url,dedupe_key)
   select m.id,'schedule_change','Jadwal pelajaran berubah','Jadwal '||case new.day when 'monday' then 'Senin' when 'tuesday' then 'Selasa' when 'wednesday' then 'Rabu' when 'thursday' then 'Kamis' else 'Jumat' end||' telah diperbarui.',new.day,'/jadwal/','schedule:'||new.day||':'||to_char(now() at time zone 'Asia/Jakarta','YYYY-MM-DD')
  from public.members m where m.role in ('student','class_officer','teacher','developer','owner') on conflict do nothing;
 end if;
 return new;
end; $;


-- Extend the Rev9 member/task/progress read-write matrix to the higher Owner role.
drop policy if exists "Members can read task summaries" on public.task_summaries;
create policy "Members can read task summaries" on public.task_summaries
  for select to authenticated
  using (public.current_app_role() in ('student','class_officer','teacher','developer','owner'));

drop policy if exists "Authenticated can read tasks" on public.tasks;
create policy "Authenticated can read tasks" on public.tasks
  for select to authenticated
  using (public.current_app_role() in ('student','class_officer','teacher','developer','owner'));

drop policy if exists "Authenticated can read members" on public.members;
create policy "Authenticated can read members" on public.members
  for select to authenticated
  using (public.current_app_role() in ('student','class_officer','teacher','developer','owner'));

drop policy if exists "Authenticated can read resources" on public.resources;
create policy "Authenticated can read resources" on public.resources
  for select to authenticated
  using (public.current_app_role() in ('student','class_officer','teacher','developer','owner'));

drop policy if exists "Users can read allowed progress" on public.task_progress;
create policy "Users can read allowed progress" on public.task_progress
  for select to authenticated
  using (
    public.current_app_role() in ('student','class_officer','teacher','developer','owner')
    and ((select auth.uid()) = user_id or public.current_app_role() in ('class_officer','teacher','developer','owner'))
  );

drop policy if exists "Users can insert allowed progress" on public.task_progress;
create policy "Users can insert allowed progress" on public.task_progress
  for insert to authenticated
  with check (
    public.current_app_role() in ('student','class_officer','teacher','developer','owner')
    and ((select auth.uid()) = user_id or public.current_app_role() in ('teacher','developer','owner'))
  );

drop policy if exists "Users can update allowed progress" on public.task_progress;
create policy "Users can update allowed progress" on public.task_progress
  for update to authenticated
  using (
    public.current_app_role() in ('student','class_officer','teacher','developer','owner')
    and ((select auth.uid()) = user_id or public.current_app_role() in ('teacher','developer','owner'))
  )
  with check (
    public.current_app_role() in ('student','class_officer','teacher','developer','owner')
    and ((select auth.uid()) = user_id or public.current_app_role() in ('teacher','developer','owner'))
  );

drop policy if exists "Users can delete allowed progress" on public.task_progress;
create policy "Users can delete allowed progress" on public.task_progress
  for delete to authenticated
  using (
    public.current_app_role() in ('student','class_officer','teacher','developer','owner')
    and ((select auth.uid()) = user_id or public.current_app_role() in ('teacher','developer','owner'))
  );

-- Compatibility fallback for public pages that synchronize privileged display names without login.
create or replace view public.public_developer_name_profiles as
select id, name, role, name_style, name_color_1, name_color_2, name_color_3
  from public.members
 where role in ('developer', 'owner');
grant select on public.public_developer_name_profiles to anon, authenticated;

-- Let both privileged roles manage their own avatar while keeping this policy narrow.
drop policy if exists "Developers can update own member photo" on public.members;
create policy "Privileged users can update own member photo"
  on public.members
  for update
  to authenticated
  using (id = auth.uid() and public.current_app_role() in ('developer','owner'))
  with check (id = auth.uid() and public.current_app_role() in ('developer','owner'));

commit;
