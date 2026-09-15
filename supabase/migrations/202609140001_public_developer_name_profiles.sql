begin;

-- Public pages only need the Developer's display identity. Do not expose the members table.
create or replace view public.public_developer_name_profiles
with (security_barrier = true) as
  select id, name, role, name_style, name_color_1, name_color_2, name_color_3
  from public.members
  where role = 'developer';

revoke all on table public.public_developer_name_profiles from public;
grant select on table public.public_developer_name_profiles to anon, authenticated;

notify pgrst, 'reload schema';
commit;
