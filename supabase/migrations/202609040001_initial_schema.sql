-- Clouven.two · Supabase schema
-- Jalankan melalui Supabase SQL Editor atau Supabase CLI.

create extension if not exists pgcrypto;

create table if not exists public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  username text not null unique,
  number text not null default '',
  role text not null default 'student' check (role in ('student','class_officer','teacher','developer')),
  class_role text not null default 'Anggota',
  role_label text not null default '',
  phone text not null default '',
  email text not null default '',
  quote text not null default '',
  photo text not null default '',
  legacy_firebase_uid text unique,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_profile (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.schedules (
  day text primary key check (day in ('monday','tuesday','wednesday','thursday','friday')),
  lessons jsonb not null default '[]'::jsonb,
  piket jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.apel_queue (
  id text primary key,
  name text not null,
  member_id uuid references auth.users(id) on delete set null,
  position integer not null default 0 check (position >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id text primary key default (gen_random_uuid()::text),
  title text not null,
  subject text not null default 'Umum',
  due date,
  teacher text not null default '',
  description text not null default '',
  status text not null default 'open' check (status in ('open','archived')),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_summaries (
  id text primary key references public.tasks(id) on delete cascade,
  title text not null,
  subject text not null default 'Umum',
  due date,
  status text not null default 'open' check (status in ('open','archived')),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null references public.tasks(id) on delete cascade,
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null unique,
  name text not null,
  mime_type text not null default 'application/octet-stream',
  size bigint not null default 0 check (size >= 0),
  subject text not null default 'Umum',
  kind text not null default 'materi' check (kind in ('materi','tugas')),
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_name text not null default 'Pengguna',
  created_at timestamptz not null default now()
);

create index if not exists idx_members_number on public.members(number);
create index if not exists idx_apel_queue_position on public.apel_queue(position);
create index if not exists idx_tasks_due on public.tasks(due);
create index if not exists idx_task_summaries_due on public.task_summaries(due);
create index if not exists idx_task_progress_user on public.task_progress(user_id);
create index if not exists idx_resources_created_at on public.resources(created_at desc);

create or replace function public.sync_task_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.task_summaries where id = old.id;
    return old;
  end if;
  insert into public.task_summaries (id, title, subject, due, status, updated_at)
  values (new.id, new.title, new.subject, new.due, new.status, new.updated_at)
  on conflict (id) do update set
    title = excluded.title, subject = excluded.subject, due = excluded.due,
    status = excluded.status, updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger if exists trg_sync_task_summary on public.tasks;
create trigger trg_sync_task_summary
after insert or update or delete on public.tasks
for each row execute function public.sync_task_summary();

insert into public.task_summaries (id, title, subject, due, status, updated_at)
select id, title, subject, due, status, updated_at from public.tasks
on conflict (id) do update set
  title = excluded.title, subject = excluded.subject, due = excluded.due,
  status = excluded.status, updated_at = excluded.updated_at;

create or replace function public.role_rank(role_name text)
returns integer
language sql
immutable
as $$
  select case role_name
    when 'developer' then 4
    when 'teacher' then 3
    when 'class_officer' then 2
    when 'student' then 1
    else 0
  end;
$$;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select m.role from public.members m where m.id = auth.uid()), 'guest');
$$;

create or replace function public.has_app_role(minimum_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.role_rank(public.current_app_role()) >= public.role_rank(minimum_role);
$$;

revoke all on function public.role_rank(text) from public;
revoke all on function public.current_app_role() from public;
revoke all on function public.has_app_role(text) from public;
grant execute on function public.role_rank(text) to anon, authenticated;
grant execute on function public.current_app_role() to anon, authenticated;
grant execute on function public.has_app_role(text) to anon, authenticated;

alter table public.members enable row level security;
alter table public.class_profile enable row level security;
alter table public.schedules enable row level security;
alter table public.apel_queue enable row level security;
alter table public.tasks enable row level security;
alter table public.task_summaries enable row level security;
alter table public.task_progress enable row level security;
alter table public.resources enable row level security;

revoke all on table public.members, public.class_profile, public.schedules, public.apel_queue, public.tasks, public.task_summaries, public.task_progress, public.resources from anon, authenticated;

grant select on public.class_profile, public.schedules, public.apel_queue, public.task_summaries to anon;
grant select on public.class_profile, public.schedules, public.apel_queue, public.tasks, public.task_summaries to authenticated;
grant insert, update, delete on public.class_profile, public.schedules, public.apel_queue, public.tasks to authenticated;
grant select on public.members, public.task_progress, public.resources to authenticated;
grant insert, update, delete on public.task_progress to authenticated;
grant insert on public.resources to authenticated;
grant all on public.members, public.class_profile, public.schedules, public.apel_queue, public.tasks, public.task_summaries, public.task_progress, public.resources to service_role;

-- Public read-only data.
create policy "Public can read class profile" on public.class_profile for select to anon, authenticated using (true);
create policy "Public can read schedules" on public.schedules for select to anon, authenticated using (true);
create policy "Public can read apel queue" on public.apel_queue for select to anon, authenticated using (true);
create policy "Authenticated can read tasks" on public.tasks for select to authenticated using (true);
create policy "Public can read task summaries" on public.task_summaries for select to anon, authenticated using (true);

-- Class Officer and above can edit class operational data.
create policy "Officers can insert class profile" on public.class_profile for insert to authenticated with check (public.has_app_role('class_officer'));
create policy "Officers can update class profile" on public.class_profile for update to authenticated using (public.has_app_role('class_officer')) with check (public.has_app_role('class_officer'));
create policy "Officers can delete class profile" on public.class_profile for delete to authenticated using (public.has_app_role('class_officer'));

create policy "Officers can insert schedules" on public.schedules for insert to authenticated with check (public.has_app_role('class_officer'));
create policy "Officers can update schedules" on public.schedules for update to authenticated using (public.has_app_role('class_officer')) with check (public.has_app_role('class_officer'));
create policy "Officers can delete schedules" on public.schedules for delete to authenticated using (public.has_app_role('class_officer'));

create policy "Officers can insert apel queue" on public.apel_queue for insert to authenticated with check (public.has_app_role('class_officer'));
create policy "Officers can update apel queue" on public.apel_queue for update to authenticated using (public.has_app_role('class_officer')) with check (public.has_app_role('class_officer'));
create policy "Officers can delete apel queue" on public.apel_queue for delete to authenticated using (public.has_app_role('class_officer'));

create policy "Officers can insert tasks" on public.tasks for insert to authenticated with check (public.has_app_role('class_officer'));
create policy "Officers can update tasks" on public.tasks for update to authenticated using (public.has_app_role('class_officer')) with check (public.has_app_role('class_officer'));
create policy "Officers can delete tasks" on public.tasks for delete to authenticated using (public.has_app_role('class_officer'));

-- Member data is private to logged-in class users. Writes happen through the developer-only server API.
create policy "Authenticated can read members" on public.members for select to authenticated using (true);

-- Students manage only their own task progress. Teacher/Developer can inspect or manage all rows.
create policy "Users can read allowed progress" on public.task_progress for select to authenticated
using ((select auth.uid()) = user_id or public.has_app_role('teacher'));
create policy "Users can insert allowed progress" on public.task_progress for insert to authenticated
with check ((select auth.uid()) = user_id or public.has_app_role('teacher'));
create policy "Users can update allowed progress" on public.task_progress for update to authenticated
using ((select auth.uid()) = user_id or public.has_app_role('teacher'))
with check ((select auth.uid()) = user_id or public.has_app_role('teacher'));
create policy "Users can delete allowed progress" on public.task_progress for delete to authenticated
using ((select auth.uid()) = user_id or public.has_app_role('teacher'));

-- Storage metadata is private. Upload metadata can be created by Class Officer and above.
create policy "Authenticated can read resources" on public.resources for select to authenticated using (true);
create policy "Officers can insert resources" on public.resources for insert to authenticated
with check (public.has_app_role('class_officer') and uploaded_by = (select auth.uid()));

-- Realtime Postgres Changes publication.
do $$
declare t text;
begin
  foreach t in array array['class_profile','schedules','apel_queue','tasks','task_summaries','task_progress','members','resources']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

insert into public.class_profile (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;
