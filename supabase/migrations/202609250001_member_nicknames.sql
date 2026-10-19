alter table public.members
add column if not exists nickname text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'members_nickname_length'
  ) then
    alter table public.members
    add constraint members_nickname_length
    check (char_length(nickname) <= 40);
  end if;
end
$$;