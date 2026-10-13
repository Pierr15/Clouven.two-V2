-- Profile photos: public read, owner writes, Developer-wide photo management.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  2097152,
  array['image/gif','image/webp','image/png','image/jpeg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view profile photos" on storage.objects;
create policy "Public can view profile photos"
on storage.objects for select to public
using (bucket_id = 'profile-photos');

drop policy if exists "Members upload own profile photos" on storage.objects;
create policy "Members upload own profile photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.current_app_role() = 'developer'
  )
);

drop policy if exists "Members update own profile photos" on storage.objects;
create policy "Members update own profile photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-photos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.current_app_role() = 'developer'
  )
)
with check (
  bucket_id = 'profile-photos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.current_app_role() = 'developer'
  )
);

drop policy if exists "Members delete own profile photos" on storage.objects;
create policy "Members delete own profile photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.current_app_role() = 'developer'
  )
);

-- Keep member metadata writes behind the API. No anon/authenticated table-write grant is added.
notify pgrst, 'reload schema';
commit;
