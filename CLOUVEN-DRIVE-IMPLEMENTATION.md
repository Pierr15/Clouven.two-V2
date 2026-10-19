# Clouven Drive implementation notes

## Current slice: complete Drive feature set (release candidate)

This branch adds a separate authenticated Clouven Drive page and a shortcut from the existing `/penyimpanan/` page. It does not replace or modify the legacy Storage experience.

### Included
- New `/clouven-drive/` page with responsive layout.
- Dedicated CSS and page module using the existing Supabase session gate and sidebar shell.
- Compact shortcut from Storage; upload-capable roles see it beside `Unggah file`, while other signed-in roles retain it in the page header.
- Real upload, download, rename, move, Trash/restore, permanent delete, internal sharing, folder-manager assignment, and confirmed external sharing.
- No sample files, mock quota, or fake-success actions.

### Implemented end-to-end in code
- Raw-byte file upload (3 MiB server cap) and authenticated download; Google credentials stay server-side.
- Rename/move with folder-cycle checks plus Trash, restore, and owner/Owner-role permanent delete.
- Internal viewer/editor grants and folder managers; grants on a folder inherit to descendants.
- Explicit external Google Drive sharing (reader/writer) with confirmation, listing, and revocation.
- Operation journal (`drive_operations`) with UUID idempotency keys, Drive `appProperties` lookup, and reconciliation for interrupted uploads.
- Owner, Teacher, Class Officer, and Developer have staff-level access to every member's items.

### Still pending before production
- Live validation of the metadata migration against a disposable Supabase project.
- Live Google Drive credential/identity validation and cross-service recovery exercises.
- A completed CI run for the current commit.
- Browser regression automation; Playwright is not installed in this environment, so the new UI has not been browser-executed here.

## Agreed product rules
- Keep `/penyimpanan/` intact.
- Each item has an individual owner; shared folders may have additional managers.
- Signed-in members can create/upload items subject to access to the destination folder.
- Owners may rename, move, and delete their own items. Owner, Class Officer, Teacher, and Developer may access and manage other members' items (view, create, edit, delete).
- File visibility is limited to owners, folder managers, staff, and explicitly authorized users.
- External sharing is an explicit action by the item owner or staff and must have confirmation.
- Google Drive is authoritative for physical file and Trash state. Supabase metadata records Clouven ownership and permissions.
- When deleting a shared folder, preserve descendants the requester is not allowed to delete, moving them to a safe authorized location.
- Do not apply a database migration or deploy as part of this UI slice.

## Remaining validation before release
1. Apply the migration only to the dedicated Supabase development project and inspect the resulting schema/constraints.
2. Point preview credentials at the service-owned Google Drive identity and test folder; exercise upload, download, move, Trash, restore, permanent delete, and permission grant/revoke.
3. Observe the full Drive CI workflow succeed for this commit.
4. Run browser regression coverage for the new upload, move, Trash, and share dialogs once Playwright is available.
5. Only then apply the migration to production and deploy.


## API routing on the Vercel Hobby function budget

All Clouven Drive actions are served by one nested catch-all function, `api/clouven-drive/[...action].js`; the former per-action stubs were folded into it to stay well below the 12-function Hobby limit. Vercel supplies one action segment, and the router parses JSON bodies itself except for the raw `/files` upload.

| Route | Methods | Responsibility |
|---|---|---|
| `/api/clouven-drive/items` | `GET`, `PATCH` | List/search visible items (`view=trash` for Trash) and rename/move with destination ACL and cycle checks |
| `/api/clouven-drive/folders` | `POST` | Create a folder in an authorized destination |
| `/api/clouven-drive/files` | `POST` | Raw-byte upload, 3 MiB cap, journaled and reconciled |
| `/api/clouven-drive/download` | `GET` | Authorized file-byte download; token never reaches the browser |
| `/api/clouven-drive/trash` | `POST` | `trash`, `restore`, or confirmed `delete` |
| `/api/clouven-drive/permissions` | `GET`, `POST`, `DELETE` | List/add/remove internal grants and folder managers |
| `/api/clouven-drive/share` | `GET`, `POST`, `DELETE` | List/grant/revoke confirmed external Google Drive permissions |
| `/api/clouven-drive/overview` | `GET` | Authorized item counts and Google Drive quota |

Every mutation requires a UUID `Idempotency-Key`. The journal state machine is `pending → running → succeeded`, with `failed` or `needs_reconciliation` for partial cross-service operations. Replays validate actor, operation type, and a deterministic payload comparison before returning stored metadata or re-running an idempotent Drive mutation.

### Mandatory implementation guardrails

- **No client-trusted role/owner fields.** Resolve identity and role from the existing verified server session; derive ownership from server-side metadata.
- **Per-item authorization on every request.** Check owner, inherited folder visibility, folder-manager assignment, explicit grants, and staff override before any Drive API call. Protect against IDOR.
- **Schema/RLS audit before migration.** Inspect current migrations, `resources` usage, role policies, and the deployed handler routing first. Do not assume a new table or RLS policy is safe without reviewing existing policies.
- **Drive is the file-byte and Trash authority; Supabase is the Clouven metadata/ACL authority.** Operations across them are not atomic. Record operation state and make retries/reconciliation idempotent.
- **Resumable uploads** must validate the destination before starting, enforce limits, and verify the resulting Drive object before inserting metadata. Never trust client-provided Drive IDs.
- **Safe folder operations.** Detect cycles; on deletion, preserve descendants the requester cannot delete by relocating them to a verified authorized location rather than recursively deleting them.
- **Quota and counts must be real.** Do not display fabricated numbers or count items the requester cannot access.
- **External sharing is opt-in.** Show the exact target/access scope and require confirmation before modifying Google Drive permissions.
- Do not apply database migrations, change environment secrets, or deploy without explicit authorization.
- Add automated tests for unauthorized access, inheritance, staff overrides, folder cycles, resumable upload failures, and partial Drive/Supabase failures before enabling the controls in the UI.


## Initial repository audit and schema foundation

- The existing `public.resources` table is the legacy class-material registry, keyed by Google Drive file ID and category/subject. Its current authenticated read policy is broad for the existing class-resource feature, so it must **not** be repurposed as Clouven Drive's per-user ACL model.
- Existing Drive handlers currently gate upload at `class_officer` and use `resources` for the old materials/tasks flow. Keep these handlers and `/penyimpanan/` behavior unchanged during the new feature rollout.
- The existing server auth helper resolves the authenticated Supabase user and reads their role from `public.members`. New handlers should reuse this server-side identity verification, but must add item/folder ACL checks rather than rely on role rank alone.
- Added `supabase/migrations/202610160001_clouven_drive_metadata.sql` to this PR as a **review-only migration**. It defines separate item metadata, folder managers, explicit item grants, and an operation journal; enables RLS and revokes direct browser access. It has **not** been applied to Supabase.
- This schema is a foundation, not a claim that Drive APIs are ready. Before wiring endpoints, review the migration against deployment conventions and test constraints/inheritance, then implement a shared authorization service and idempotent Drive operations. Never run this migration automatically from application startup.


## Authorization foundation status

- Added `api/_lib/clouvenDriveAccess.js` as a server-side per-item authorization helper. It resolves the signed-in actor's metadata from the existing verified request flow, loads ownership and ACL data from the separate `drive_*` tables, walks the parent chain with a depth/cycle guard, and returns 404 for inaccessible items to reduce item-existence leaks.
- Added `evaluateDriveItemAccess` as a pure policy evaluator and `tests/clouven-drive-access.mjs` for owner, private-item, viewer grant, editor grant, class-officer, and inherited folder-owner cases. Run it locally with `npm run test:clouven-drive-access`.
- The read-only endpoints depend on the new metadata schema, which is still review-only and not applied. No live Drive operation is enabled by this slice.
- The test file was added to the branch but has not been executed in this connector-only environment.

## Read-only endpoint status

- Added `GET /api/clouven-drive/items` for bounded listing, optional folder scope, and name search. Every candidate is checked against server-side ownership and ACL metadata before serialization. Raw table counts are never returned. Search scans are capped and marked `truncated`.
- Added `GET /api/clouven-drive/overview`. Counts are marked `partial` when the bounded visible-item sample may be incomplete; quota is read from Google Drive `about.get` (`storageQuota`) with the existing service refresh-token, cached for 5 minutes, and falls back to `null` (rendered as "Belum tersedia") when Google is unreachable.
- Both routes are registered in the local preview server. Existing `/api/drive/*` paths are untouched.
- Endpoints depend on the review-only metadata schema. No live Drive operation is enabled by this slice.

## Read-only API isolation test status

- Extracted the metadata access service into `api/_lib/clouvenDriveService.js`, which accepts an injected PostgREST-compatible client. The production wrapper still binds it to the existing server-only Supabase admin client.
- Added `tests/clouven-drive-api-integration.mjs` with a fake metadata client to exercise list ACL filtering, private-name search, nested private folder denial, pagination validation, and rejection of search pagination.
- Added `npm run test:clouven-drive-api` as the local test command.
- The service reports `hasMore` only when additional authorized rows are present in the scanned candidate window. When the candidate scan reaches its cap, `truncated: true` signals that more rows may exist outside that bounded scan; this is intentionally not presented as a guaranteed next page.
- These are isolated service-level tests, not tests against a live Supabase project. They have been added to the branch but have not been executed in this connector-only environment.

## Unit test environment isolation

- Extracted pure policy functions to `api/_lib/clouvenDrivePolicy.js`. This module has no Supabase import, so `tests/clouven-drive-access.mjs` should run without loading `.env.local` or supplying database credentials.
- The database-backed helper `api/_lib/clouvenDriveAccess.js` now imports that pure policy module and retains the Supabase lookup logic for future endpoints.

## Folder creation API foundation

- Added `POST /api/clouven-drive/folders` and registered it in the local preview server. The endpoint requires a verified member session, a UUID `Idempotency-Key`, a valid folder name, and server-side parent-folder authorization when a parent is specified.
- The endpoint reserves a `drive_operations` journal row and a pending `drive_items` metadata row before creating the Google Drive folder. It stores the operation UUID in Google Drive `appProperties` so retries can locate a folder created before a prior request failed.
- Successful operations only return after Drive metadata is verified and the Supabase item and journal are updated. Partial failures are marked for reconciliation; retries with the same key attempt to recover the Drive folder rather than intentionally creating another one.
- Added `api/_lib/clouvenDriveGoogle.js` and `tests/clouven-drive-folder-google.mjs` to isolate and test the Google Drive idempotency helper.
- Run `npm run test:clouven-drive-folder` locally for the helper test. It does not call Google services because it stubs `fetch`.
- This endpoint depends on the review-only metadata migration and Google Drive environment variables. It has not been tested against a live Supabase database or Google Drive account. Do not enable the UI or apply the migration until that validation is complete.

## Full feature implementation (2026-10-19)

- Added `api/_lib/clouvenDriveJournal.js` with UUID idempotency parsing, deterministic payload comparison, and `pending/running/succeeded/failed/needs_reconciliation` transitions.
- Added `POST /api/clouven-drive/files`: authenticates the member, verifies destination edit access, validates name/MIME/1 byte–3 MiB, reserves the journal and metadata row, uploads raw bytes through multipart Drive, verifies the returned ID/name/MIME/size, then activates the row. Interrupted uploads stay `needs_reconciliation` and retries look up the Drive `appProperties` operation key.
- Added `GET /api/clouven-drive/download`: resolves item visibility server-side, downloads with the server token, and streams the bytes with `private, no-store` and an attachment filename. The Google token is never serialized into a response.
- Extended `PATCH /api/clouven-drive/items` for rename and move. Moves validate destination edit access, reject self/descendant moves, and use explicit old/new Google parent IDs.
- Added `POST /api/clouven-drive/trash` for Trash, restore, and permanent delete. Permanent delete requires explicit `confirm: true`, owner or Owner role, and an empty folder. Non-empty folders must be emptied first so no unauthorized descendant is recursively destroyed.
- Added `GET/POST/DELETE /api/clouven-drive/permissions` for viewer/editor grants and folder managers. Grants on a folder now inherit to descendants through the resolved folder chain.
- Added `GET/POST/DELETE /api/clouven-drive/share` for external reader/writer Google permissions. Every grant requires `confirm: true`; retries detect an existing email/role permission before creating another one; revocation is idempotent when Google already reports the permission missing.
- Wired the Drive page with upload, download, rename, move (folder browser), Trash/restore/permanent delete, internal sharing, external sharing, and Trash view controls. Item names and responses are written with DOM text nodes.
- Hosted all Drive routes in `api/clouven-drive/[...action].js`; the local preview server maps each action directly. Legacy `/penyimpanan/` and `/api/drive/*` remain untouched.

### Locally observed verification

All commands below were run in this workspace and exited successfully on 2026-10-19:

- `test:clouven-drive-access` — 10 assertions
- `test:clouven-drive-api` — 18 assertions
- `test:clouven-drive-folder` — 7 assertions
- `test:clouven-drive-folder-handler` — 5 scenarios
- `test:clouven-drive-upload` — 9 assertions
- `test:clouven-drive-mutations` — 7 assertions
- `test:clouven-drive-google-upload` — 6 assertions
- `test:clouven-drive-google-sharing` — 12 assertions
- `test:clouven-drive-files-handler` - 11 scenarios
- `test:clouven-drive-download-handler` — 6 scenarios
- `test:clouven-drive-items-handler` — 7 scenarios
- `test:clouven-drive-trash-handler` — 8 scenarios
- `test:clouven-drive-permissions-handler` — 7 scenarios
- `test:clouven-drive-share-handler` — 6 scenarios
- `test:supabase-migration-layout` — 12 canonical migrations

`node --check` also passed for the new handlers, router, page module, and preview server. These are deterministic mocked/isolated tests: they do not prove live Supabase or Google Drive compatibility, and the browser UI was not executed because Playwright is unavailable in this environment.
