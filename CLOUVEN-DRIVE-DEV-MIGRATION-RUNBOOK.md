# ClouvenDriveDev migration runbook

This sequence is for the empty **ClouvenDriveDev** Supabase development project only. It does not authorize a production migration, deployment, or PR merge.

## What was repaired

All SQL migrations now live directly in `supabase/migrations/`. In particular, the previously nested `202609250001_member_nicknames.sql` and `202609290001_fix_replace_subject_teachers.sql` were relocated without changing their SQL. The migration-layout test rejects a nested migration directory and duplicate version prefixes.

## Safe sequence

1. Work from the exact PR branch and confirm the target is the separate empty ClouvenDriveDev project in the Supabase dashboard.
2. Review the ordered local files in `supabase/migrations/`; do not copy only the Drive migration. The application schema must be established first.
3. Start the local Supabase stack and run `supabase db reset`. This is the reproducibility check and targets the local stack by default.
4. Run `npm run test:supabase-migration-layout` and the Clouven Drive test suite.
5. Only after the local reset succeeds, link the CLI to ClouvenDriveDev. Verify the selected project ref before every remote command.
6. Use `supabase db push --dry-run` to inspect the pending sequence. Review the output and the metadata migration's RLS/revoke statements.
7. A human with explicit approval may then apply the reviewed sequence to ClouvenDriveDev. Never use `supabase db reset --linked`: it is destructive, even for development.
8. Verify migration history and run the API integration checks against the development environment before enabling uploads or mutating UI controls.

## Guardrails

- No credentials, OAuth material, or service-role key belong in the repository or this runbook.
- The metadata migration keeps browser access revoked; server handlers remain responsible for authorization.
- Google Drive setup is a separate development prerequisite. Without a server-owned test identity and test root folder, the upload/folder/mutation paths must remain disabled.
- A green unit workflow does not prove a remote Supabase migration, a Google Drive operation, or a browser flow.
