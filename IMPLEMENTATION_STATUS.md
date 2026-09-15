# Implementation status — Access Rev9

Implemented according to the edited workbook's Usulan Akses A7:H32:

- Permission matrix: 26 features × 5 roles.
- Developer-only Admin route; separate Kelola Kelas route for class operations.
- Authenticated-only task summaries, including database SELECT privilege removal from anon.
- Class Officer reads others' progress; Teacher/Developer reads and writes it.
- Teacher/Developer self-profile API bound to authenticated UID.
- Developer account biodata, role, reset-password, and account-delete UI/API.
- Last Developer SQL trigger and self-delete/self-demotion API guard.
- Class Officer/Teacher/Developer Drive rename/category move/Trash UI/API.
- Registered resource and class-root ancestry checks for Drive read/write.
- Loading/error/retry states, form confirmation, focus management, mobile layouts.
- Fixed existing task form identification bug caused by its named id input.

Locally verified: see verification/ACCESS-REV9.md and the associated JSON reports.

Not activated here: Supabase production migration, live authentication/account mutations, Google OAuth/Drive changes, Vercel Functions deployment. PGlite validation uses isolated auth fixtures and does not test concurrent sessions or hosted Realtime delivery.

Legacy verification files describe earlier revisions; current access behavior is documented in AKSES-ROLE-REV9.md.

Runtime Firebase is absent; firebase-admin is retained only for the optional historical migration script.
