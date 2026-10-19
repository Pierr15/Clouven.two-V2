# Clouven Drive implementation notes

## Current slice: UI foundation, authorization, and read-only API

This branch adds a separate authenticated Clouven Drive page and a shortcut from the existing `/penyimpanan/` page. It does not replace or modify the legacy Storage experience.

### Included
- New `/clouven-drive/` page with responsive layout.
- Dedicated CSS and page module using the existing Supabase session gate and sidebar shell.
- Compact shortcut from Storage; upload-capable roles see it beside `Unggah file`, while other signed-in roles retain it in the page header.
- Explicit foundation notice, unavailable quota/count states, and disabled file-operation controls.
- Local preview route registration.
- No sample files, mock quota, or fake-success actions.

### Implemented in this branch
- Review-only metadata migration defining Drive item ownership, folder managers, explicit grants, and an operation journal.
- Pure authorization policy with tests for ownership, grants, staff access, and inherited folder ownership.
- Read-only server-side list/search and overview endpoints with bounded scans and server-side ACL filtering.

### Not implemented yet
- Database-backed integration tests against the actual Supabase schema.
- Upload/download, rename/move, Trash/restore, quota lookup, and explicit external sharing.
- Google Drive external sharing confirmation and permission reconciliation.
- Trash synchronization and partial-operation recovery.
- Automated tests for cross-service failure handling and database-backed integration paths.

## Agreed product rules
- Keep `/penyimpanan/` intact.
- Each item has an individual owner; shared folders may have additional managers.
- Signed-in members can create/upload items subject to access to the destination folder.
- Owners may rename, move, and delete their own items. Class Officer, Teacher, and Developer may manage other members' items.
- File visibility is limited to owners, folder managers, staff, and explicitly authorized users.
- External sharing is an explicit action by the item owner or staff and must have confirmation.
- Google Drive is authoritative for physical file and Trash state. Supabase metadata records Clouven ownership and permissions.
- When deleting a shared folder, preserve descendants the requester is not allowed to delete, moving them to a safe authorized location.
- Do not apply a database migration or deploy as part of this UI slice.

## Next implementation phase
1. Review the read-only API contract and correct any issues found during local integration testing.
2. Review the metadata migration against the current Supabase schema and deployment conventions. Do not apply it automatically.
3. Add integration tests for IDOR, inherited folder access, inaccessible parent folders, folder cycles, and partial database failures.
4. Integration-test the new folder endpoint against a disposable Supabase project and Google Drive test folder before applying the migration or enabling the UI.
5. Implement upload/download, rename/move, Trash/restore, quota, and explicit external sharing only after the shared authorization layer is integration-tested.


## API budget: maximum 12 endpoints

The initial Drive feature is designed around **11 endpoint routes**. Each route may support multiple validated HTTP methods/actions where that keeps authorization and resource handling coherent. This count is for Clouven Drive-specific routes; it does not create duplicate aliases or change the existing `/api/drive/*` routes until compatibility is audited.

| # | Proposed route | Responsibility |
|---:|---|---|
| 1 | `GET /api/clouven-drive/items` | List/search visible items; folder contents, filters, pagination |
| 2 | `POST /api/clouven-drive/folders` | Create a folder in an authorized destination |
| 3 | `POST /api/clouven-drive/upload-sessions` | Start a resumable upload and bind it to an authorized parent |
| 4 | `POST /api/clouven-drive/upload-sessions/:id/complete` | Verify uploaded Drive object and commit metadata |
| 5 | `GET /api/clouven-drive/items/:id/content` | Authorized preview/download stream |
| 6 | `PATCH /api/clouven-drive/items/:id` | Rename or move an item; validate destination and prevent folder cycles |
| 7 | `DELETE /api/clouven-drive/items/:id` | Move an item to Google Drive Trash after authorization |
| 8 | `GET /api/clouven-drive/trash` | List only Trash items the requester is allowed to see/manage |
| 9 | `POST /api/clouven-drive/trash/:id/restore` | Restore an item and reconcile its metadata/permissions |
| 10 | `DELETE /api/clouven-drive/trash/:id` | Permanently delete an item after an explicit confirmation |
| 11 | `GET /api/clouven-drive/overview` | Return verified Drive quota and authorized class item counts |

### Sharing and folder managers without extra routes

Explicit sharing and folder-manager assignment can be represented as validated sub-actions of `PATCH /api/clouven-drive/items/:id` (for example, `action: "set-manager"` or `action: "share-external"`). These actions must be separately authorized, require explicit confirmation for external sharing, validate target identities and scopes, and reconcile Google Drive permissions with Clouven metadata. They must never be inferred from a client-supplied role or a file ID alone.

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
- Added `GET /api/clouven-drive/overview`. Counts are marked `partial` when the bounded visible-item sample may be incomplete; quota stays `null` until verified through a trusted Google Drive integration.
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
