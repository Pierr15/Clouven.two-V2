-- Rev9: matriks akses dari Usulan Akses A7:H32. Jalankan setelah schema awal.
begin;
revoke select on public.task_summaries from anon;
drop policy if exists "Public can read task summaries" on public.task_summaries;
drop policy if exists "Members can read task summaries" on public.task_summaries;
create policy "Members can read task summaries" on public.task_summaries for select to authenticated using (public.current_app_role() in ('student','class_officer','teacher','developer'));
drop policy if exists "Authenticated can read tasks" on public.tasks;
create policy "Authenticated can read tasks" on public.tasks for select to authenticated using (public.current_app_role() in ('student','class_officer','teacher','developer'));
drop policy if exists "Authenticated can read members" on public.members;
create policy "Authenticated can read members" on public.members for select to authenticated using (public.current_app_role() in ('student','class_officer','teacher','developer'));
drop policy if exists "Authenticated can read resources" on public.resources;
create policy "Authenticated can read resources" on public.resources for select to authenticated using (public.current_app_role() in ('student','class_officer','teacher','developer'));
drop policy if exists "Users can read allowed progress" on public.task_progress;
create policy "Users can read allowed progress" on public.task_progress for select to authenticated
using ((public.current_app_role() in ('student','class_officer','teacher','developer')) and ((select auth.uid()) = user_id or public.current_app_role() in ('class_officer','teacher','developer')))
;
drop policy if exists "Users can insert allowed progress" on public.task_progress;
create policy "Users can insert allowed progress" on public.task_progress for insert to authenticated
with check ((public.current_app_role() in ('student','class_officer','teacher','developer')) and ((select auth.uid()) = user_id or public.current_app_role() in ('teacher','developer')))
;
drop policy if exists "Users can update allowed progress" on public.task_progress;
create policy "Users can update allowed progress" on public.task_progress for update to authenticated
using ((public.current_app_role() in ('student','class_officer','teacher','developer')) and ((select auth.uid()) = user_id or public.current_app_role() in ('teacher','developer')))
with check ((public.current_app_role() in ('student','class_officer','teacher','developer')) and ((select auth.uid()) = user_id or public.current_app_role() in ('teacher','developer')))
;
drop policy if exists "Users can delete allowed progress" on public.task_progress;
create policy "Users can delete allowed progress" on public.task_progress for delete to authenticated
using ((public.current_app_role() in ('student','class_officer','teacher','developer')) and ((select auth.uid()) = user_id or public.current_app_role() in ('teacher','developer')))
;
-- Biodata dan pengelolaan file hanya melalui API yang memeriksa role/target.
revoke insert, update, delete on public.members from anon, authenticated;
revoke update, delete on public.resources from anon, authenticated;

create or replace function public.keep_last_developer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'developer' and (tg_op = 'DELETE' or new.role <> 'developer') then
    perform pg_advisory_xact_lock(609060001);
    if not exists (select 1 from public.members where role = 'developer' and id <> old.id) then
      raise exception 'Developer terakhir harus dipertahankan.' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.keep_last_developer() from public, anon, authenticated;
drop trigger if exists trg_keep_last_developer on public.members;
create trigger trg_keep_last_developer before update or delete on public.members
for each row execute function public.keep_last_developer();
commit;
