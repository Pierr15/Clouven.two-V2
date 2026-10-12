-- Clouven.two V2: developer-only animated profile avatars
-- Run this once in Supabase Dashboard > SQL Editor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('developer-avatars','developer-avatars',true,2097152,array['image/gif','image/webp','image/png','image/jpeg'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Public can view developer avatars" on storage.objects;
create policy "Public can view developer avatars" on storage.objects for select to public using (bucket_id='developer-avatars');

drop policy if exists "Developers can upload own avatar" on storage.objects;
create policy "Developers can upload own avatar" on storage.objects for insert to authenticated with check (
 bucket_id='developer-avatars' and (storage.foldername(name))[1]=auth.uid()::text
 and exists (select 1 from public.members m where m.id=auth.uid() and m.role='developer')
);

drop policy if exists "Developers can update own avatar" on storage.objects;
create policy "Developers can update own avatar" on storage.objects for update to authenticated using (
 bucket_id='developer-avatars' and (storage.foldername(name))[1]=auth.uid()::text
 and exists (select 1 from public.members m where m.id=auth.uid() and m.role='developer')
) with check (
 bucket_id='developer-avatars' and (storage.foldername(name))[1]=auth.uid()::text
 and exists (select 1 from public.members m where m.id=auth.uid() and m.role='developer')
);

drop policy if exists "Developers can delete own avatar" on storage.objects;
create policy "Developers can delete own avatar" on storage.objects for delete to authenticated using (
 bucket_id='developer-avatars' and (storage.foldername(name))[1]=auth.uid()::text
 and exists (select 1 from public.members m where m.id=auth.uid() and m.role='developer')
);
