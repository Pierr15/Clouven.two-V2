-- ClouvenTwo: single protected Owner role and explicit owner-to-owner transfer.
-- This migration promotes the requested account by its login username/NIS (not its attendance number).

begin;

do $preflight$
declare
  target_count integer;
  target_role text;
  existing_owner_count integer;
begin
  select count(*), min(role)
    into target_count, target_role
    from public.members
   where username = '25.22976';

  if target_count <> 1 then
    raise exception 'Owner bootstrap aborted: username 25.22976 must match exactly one member, found %', target_count;
  end if;

  if target_role not in ('developer', 'owner') then
    raise exception 'Owner bootstrap aborted: target must currently be Developer or Owner, got %', target_role;
  end if;

  select count(*) into existing_owner_count
    from public.members
   where role = 'owner'
     and username <> '25.22976';

  if existing_owner_count > 0 then
    raise exception 'Owner bootstrap aborted: a different Owner already exists';
  end if;
end
$preflight$;

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

-- Bootstrap assignment happens before the protective trigger is installed.
update public.members
   set role = 'owner',
       updated_at = now(),
       updated_by = id
 where username = '25.22976'
   and role = 'developer';

-- Re-running after a successful bootstrap is safe, but must never displace another owner.
do $verify_owner$
declare
  owner_count integer;
  target_is_owner boolean;
begin
  select count(*) into owner_count from public.members where role = 'owner';
  select exists(select 1 from public.members where username = '25.22976' and role = 'owner')
    into target_is_owner;
  if owner_count <> 1 or not target_is_owner then
    raise exception 'Owner bootstrap verification failed: expected exactly one Owner assigned to username 25.22976';
  end if;
end
$verify_owner$;

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
before insert or update of role or delete on public.members
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
