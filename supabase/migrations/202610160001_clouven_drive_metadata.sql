-- Clouven Drive metadata foundation.
-- This migration is for review only. Do not apply to a live database until reviewed.
-- File bytes and physical Trash state remain in Google Drive; this schema stores Clouven ownership/ACL metadata.

begin;

create table if not exists public.drive_items (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text unique,
  parent_id uuid references public.drive_items(id) on delete restrict,
  item_type text not null check (item_type in ('file', 'folder')),
  name text not null check (length(trim(name)) between 1 and 240),
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('pending', 'active', 'trashed', 'error')),
  trashed_at timestamptz,
  operation_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drive_items_not_own_parent check (parent_id is null or parent_id <> id),
  constraint drive_items_folder_has_no_size check (item_type <> 'folder' or size_bytes = 0),
  constraint drive_items_trash_consistency check ((status = 'trashed') = (trashed_at is not null))
);

create index if not exists idx_drive_items_parent_status
  on public.drive_items(parent_id, status, item_type, name);
create index if not exists idx_drive_items_owner_status
  on public.drive_items(owner_id, status, created_at desc);
create index if not exists idx_drive_items_drive_file_id
  on public.drive_items(drive_file_id) where drive_file_id is not null;

create table if not exists public.drive_folder_managers (
  folder_id uuid not null references public.drive_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (folder_id, user_id)
);

create index if not exists idx_drive_folder_managers_user
  on public.drive_folder_managers(user_id, folder_id);

create table if not exists public.drive_item_grants (
  item_id uuid not null references public.drive_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_level text not null check (access_level in ('viewer', 'editor')),
  granted_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

create index if not exists idx_drive_item_grants_user
  on public.drive_item_grants(user_id, item_id);

-- Cross-service work cannot be atomic. Keep a durable journal so failed Drive/Supabase
-- operations can be retried or reconciled without pretending they succeeded.
create table if not exists public.drive_operations (
  id uuid primary key default gen_random_uuid(),
  operation_key uuid not null unique,
  actor_id uuid not null references auth.users(id) on delete restrict,
  item_id uuid references public.drive_items(id) on delete set null,
  operation_type text not null check (operation_type in (
    'create_folder', 'upload', 'rename', 'move', 'trash', 'restore',
    'permanent_delete', 'set_manager', 'share_external', 'reconcile'
  )),
  state text not null default 'pending' check (state in ('pending', 'running', 'succeeded', 'failed', 'needs_reconciliation')),
  request_data jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_drive_operations_state_created
  on public.drive_operations(state, created_at);

-- The browser must never write ownership or ACL metadata directly. All access flows
-- through server handlers that verify the member, role, item visibility, and parent ACL.
alter table public.drive_items enable row level security;
alter table public.drive_folder_managers enable row level security;
alter table public.drive_item_grants enable row level security;
alter table public.drive_operations enable row level security;

revoke all on public.drive_items from anon, authenticated;
revoke all on public.drive_folder_managers from anon, authenticated;
revoke all on public.drive_item_grants from anon, authenticated;
revoke all on public.drive_operations from anon, authenticated;

commit;
