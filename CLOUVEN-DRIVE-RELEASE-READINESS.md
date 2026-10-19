# Clouven Drive release-readiness review

**Review date:** 2026-10-17  
**Branch:** `feat/clouven-drive-foundation`  
**PR:** [#38](https://github.com/Pierr15/Clouven.two-V2/pull/38)  
**Disposition: NOT READY for production**

This is a source-level review of the current branch. It is not a claim that local tests, live Supabase checks, or Google Drive integration tests were executed in this environment.

## Changes in this review

- Folder operation replay now compares the stored `request_data.name` and `request_data.parent_id` with the incoming request. Reusing an idempotency key for a different payload returns `409 IDEMPOTENCY_PAYLOAD_CONFLICT`.
- A successful folder replay now rechecks current item access before returning item metadata.
- Member-profile lookup failures in `verifyRequest` return a generic 503 error rather than exposing the raw Supabase error object.
- Google Drive request failures return the operation-specific generic message rather than forwarding the upstream Google error text to the client.
- The Google Drive helper test now includes a simulated upstream 503 failure and checks the normalized status, code, and public-safe message.

## Roadmap status

| Stage | Status | Notes |
|---|---|---|
| 3. Security and authorization audit | **Partial** | Source-level fixes above; full endpoint and adversarial test review remains necessary. |
| 4. Schema validation | **Partial** | Reviewed the migration source. No migration was applied. Live schema comparison and SQL execution are unavailable here. |
| 5. Folder creation integration | **Foundation present** | Idempotent create/reconciliation handler exists; depends on migration and Google credentials. |
| 6. Listing and navigation | **Foundation present** | Read-only list/search API and overview exist; UI/API live integration remains unverified. |
| 7. Upload and synchronization | **Not implemented** | No resumable upload-session/complete workflow in the current feature slice. |
| 8. File/folder operations | **Not implemented** | Rename/move/trash/restore/permanent-delete flows are not present. |
| 9. Sharing and ACL management | **Policy foundation only** | Read-time grants/managers are evaluated, but mutation/reconciliation APIs for sharing and manager assignments are not implemented. |
| 10. UI/UX integration | **Partial** | Drive page and navigation foundation exist; real file actions must remain disabled until backed by tested APIs. |
| 11. Integration/regression tests | **Partial** | Deterministic unit/service tests exist; live Supabase/Google Drive, cross-service failure, and browser regression tests remain outstanding. |
| 12. Readiness review | **Completed as a review only** | This report documents blockers; release readiness is not achieved. |

## Schema review notes

- The migration creates separate `drive_items`, `drive_folder_managers`, `drive_item_grants`, and `drive_operations` tables, enables RLS, and revokes browser roles.
- The service-role backend bypasses RLS by design, so every server handler must verify the actor and enforce item/folder ACL checks itself.
- The migration's `drive_items.name` limit is 240 characters while the folder endpoint accepts up to 120 characters. This is consistent but should be kept deliberate across future upload/rename paths.
- `drive_items.operation_key` is not declared unique in this migration. The journal's `operation_key` is unique, but a separate uniqueness constraint/index on item metadata may be useful to guard duplicate pending reservations. Add only after checking actual migration history and recovery semantics.
- RLS/revokes do not replace server-side authorization tests, and a successful SQL parse would not prove compatibility with the target Supabase schema.

## Required before production

1. Run all Drive tests from a clean checkout and record the exact command output.
2. Add handler tests for payload-mismatched idempotency replay, unauthorized replay, and interrupted-operation reconciliation.
3. Validate the migration against a disposable Supabase branch/database and inspect the resulting schema/policies. Do not apply it to production as part of this PR.
4. Implement and test resumable upload, content download, rename/move, Trash/restore/permanent delete, and explicit sharing/manager mutations.
5. Test every mutation against owner, editor grant, viewer grant, folder manager, staff override, inaccessible ancestor, and cross-user IDOR cases.
6. Verify Google Drive permission reconciliation and failure recovery using a dedicated test folder/account.
7. Add browser regression coverage for listing, nested navigation, empty/error/loading states, and disabled controls.
8. Confirm the CI result for application tests. The observed GitHub checks for this review commit are Vercel Preview Comments (success) and Supabase Preview (skipped because the branch is not associated with a Supabase Branch); neither is a test run.


## Follow-up work after the initial review

- Added `.github/workflows/clouven-drive-tests.yml` to run the existing ACL, metadata isolation, Google Drive folder helper, and folder-handler guard suites on matching pull-request/push changes. The workflow uses Node.js 22, `npm ci`, read-only repository permissions, and a 10-minute job timeout.
- This workflow has been committed but its result has **not yet been observed**. A workflow definition is not evidence that the tests pass.
- Steps 7–10 remain intentionally blocked from being marked complete: there is still no safe, end-to-end Clouven metadata-backed upload/session-completion flow, file mutation API, explicit sharing/manager mutation API, or connected UI actions. Existing legacy upload/download handlers use a separate storage/authorization model and must not be wired into the new metadata UI as a shortcut.
- The new workflow is regression-test automation only. It does not validate the migration against a disposable Supabase database, exercise real Google Drive credentials, or run browser tests.

## Guardrails honored

- No database migration was applied.
- No production secrets/configuration were changed.
- No merge was performed.
- Legacy `/penyimpanan/` and `/api/drive/*` routes were not edited.
- No claim is made that the Drive feature is production-ready.

## Follow-up: confirmed implementation decisions and CI observation (2026-10-17)

Product decisions supplied for the next implementation slice:

- **Storage identity:** Google Drive is owned/controlled by the service and accessed only by the server. Browser code must not receive Google OAuth credentials. The existing server helper currently uses a server-side OAuth refresh token; deployment must confirm that this credential belongs to the intended service-owned Drive identity and that the configured root folder is owned/shared appropriately.
- **Test database:** use a separate Supabase development project. No project credentials were supplied through this conversation, and no live schema validation or mutation was attempted. Do not request or commit secrets in repository files.
- **Initial upload cap:** 3 MiB maximum per file. Enforce the limit server-side on the raw byte count, not only in the browser. Any future upload flow must reserve an operation journal entry, verify the destination ACL, verify the uploaded Drive object, and reconcile partial Drive/Supabase failures before returning success.

### Verified automation result

GitHub Actions run [#39021143974](https://github.com/Pierr15/Clouven.two-V2/actions/runs/39021143974) for commit `78c7d141ac0839e06c93099ee885a42ba4a35f5f` completed with conclusion **success**. The job's recorded completed steps include dependency installation and all four configured suites: ACL/policy, API isolation, Google Drive folder helper, and folder-handler guards. This verifies those suites at that commit only; it does not verify changes made after that commit, live Supabase schema compatibility, Google Drive credentials, upload, mutations, sharing, or browser behavior.

### Stage 7–12 status after decision review

- **Stage 7 (upload/sync):** still not implemented. The 3 MiB cap is now a requirement, not an implemented/verified feature. A safe implementation needs a raw-byte upload route with a strict server-side size guard and journal-backed reconciliation; base64 JSON uploads are intentionally not used because they inflate payload size and complicate request-size enforcement.
- **Stage 8 (file operations):** rename/move/trash/restore/permanent delete remain unimplemented.
- **Stage 9 (sharing/ACL mutation):** read-time policy exists, but explicit grant/manager mutation and Google Drive permission reconciliation remain unimplemented.
- **Stage 10 (UI):** read-only endpoints exist, but the Drive UI remains intentionally non-operational for file mutations until those APIs and integration tests exist.
- **Stage 11 (tests):** the four existing suites passed in the recorded CI run above. Additional handler tests, upload/mutation failure tests, disposable Supabase validation, and browser tests remain required.
- **Stage 12 (readiness):** review remains **NOT READY**. No production migration, deployment, or PR merge was performed.

No Supabase development credentials or Google Drive test identity were available to validate cross-service behavior during this continuation. Continue with isolated code/tests and keep the controls disabled until those paths have evidence.

## Implementation continuation: metadata browser UI (2026-10-17)

- Connected the Clouven Drive page to the existing authenticated `GET /api/clouven-drive/items` and `GET /api/clouven-drive/overview` endpoints. The UI uses URL parameters for folder navigation and search, aborts superseded list requests, displays loading/error/empty states, and writes item names using DOM text nodes rather than interpolating metadata into HTML.
- Enabled folder creation through the existing `POST /api/clouven-drive/folders` endpoint with a server-validated name, the selected metadata parent ID, an authentication header, and a fresh UUID idempotency key. The server remains authoritative for role and parent-folder ACL checks. Folder creation is not described as successful until the endpoint returns success.
- Upload, download, rename/move/trash/restore, and sharing controls remain unavailable. The 3 MiB upload decision has not been represented as an implemented upload feature.
- Added responsive styles for the metadata list and expanded the Drive CI path filters to include the page JS, CSS, and HTML. CI now runs `node --check assets/js/pages/clouven-drive.js` before the four existing suites.
- This UI change does **not** validate real browser behavior, live Supabase schema compatibility, Google Drive credentials, or cross-service recovery. Do not infer those from a Vercel preview status.
- The latest observed successful Drive unit/isolation workflow was run #7 at commit `dbad3d4e26b3da2ca358cb5983bf6c41bc5c901f`, before the workflow was expanded with the JavaScript syntax check. The new workflow definition and its later commit have not yet been confirmed by a completed run, so the syntax-check step and latest branch state remain unverified by CI at this point.



## Follow-up: bounded upload primitives (2026-10-17)

- Added `api/_lib/clouvenDriveUpload.js` with a shared 3 MiB byte cap, filename/MIME/size validation, and a raw request-body reader that rejects oversized streams with HTTP 413 before retaining the excess chunk.
- Added `tests/clouven-drive-upload.mjs` for valid metadata, invalid names/types/sizes, the exact 3 MiB cap, and raw-body overflow handling; wired it into the Drive CI workflow.
- **This is only a tested-intent test addition until CI confirms it.** The helper is not yet wired to an HTTP upload endpoint or the operation journal, and the test has not been executed in this environment. Therefore stage 7 remains **not implemented end-to-end**; do not enable the UI upload control.
- This change does not use base64, alter legacy `/api/drive/*` routes, call Google Drive, or touch any database.


### Upload guard CI feedback (2026-10-17)

- The first PR CI run for the new upload validation suite, [run #39025602701](https://github.com/Pierr15/Clouven.two-V2/actions/runs/39025602701), **failed** in the new test: a path-like filename (`../secret`) was not rejected by the initial validator. The five pre-existing checks and page JavaScript syntax check passed in that run.
- Updated the validator to reject both slash and backslash path separators. This is a targeted fix based on the observed failure, not a claim that the rerun passes.
- The follow-up PR CI run [#39025661069](https://github.com/Pierr15/Clouven.two-V2/actions/runs/39025661069) completed with **success** for commit `12243091e7958f408cffc170b8bc3399c747ec33`. The upload validation/body-limit suite and all four pre-existing suites passed, as did the Drive page JavaScript syntax check. This verifies deterministic tests only, not live upload integration. Stage 7 remains incomplete because no HTTP handler, Drive upload, metadata journal/reconciliation, or download flow has been connected to these primitives.


## Follow-up: Google Drive mutation helper primitives (2026-10-17)

- Added isolated Google Drive helper functions for rename, move (explicit old/new parent), and reversible Trash/restore state. Inputs are validated and upstream errors are normalized; permanent deletion is deliberately not exposed.
- Added deterministic mocked tests for PATCH payloads, parent replacement, and invalid inputs, wired into the Drive CI workflow.
- These primitives do **not** enforce Clouven metadata ACLs or operation journaling. They must only be called by a handler that checks actor/source/destination access and reconciles metadata after the Drive mutation.
- Stage 8 remains **not implemented end-to-end** until metadata-backed handlers, operation journal/recovery, ACL/IDOR tests, and cross-service failure handling exist. No endpoint was added and no legacy route was modified.


## Stage 7 continuation: Google multipart upload primitive (2026-10-17)

- Added `uploadDriveFileForOperation` to `api/_lib/clouvenDriveGoogle.js`. It performs a small-file multipart upload (up to 3 MiB), stores the idempotency key in Drive `appProperties`, checks the returned ID/name/MIME/size/operation key, and includes a lookup helper for retry reconciliation.
- Added `tests/clouven-drive-google-upload.mjs` and wired it into the Drive CI workflow. The test mocks the Google API, checks the multipart body contains the original bytes and operation key, and checks the 3 MiB boundary guard.
- **This helper is not an HTTP upload endpoint and is not wired to the Supabase journal or ACL checks.** It must not be called by the browser or exposed without a handler that authenticates the actor, verifies destination-folder edit permission, reserves/validates a `drive_operations` row, validates raw request bytes, reconciles partial failures, and commits metadata only after Drive returns verified metadata.
- Current environment prerequisites confirmed by the project owner: a Supabase account exists but a separate development project has not been created; Google Drive exists but server authentication is not configured; migration status is unknown. No credentials were requested or committed.
- Next safe sequence: create a separate Supabase development project; inspect and apply the migration only there after reviewing its SQL; create a dedicated server-owned Google Drive identity and test root folder; store credentials only in the development/preview environment secret store; then implement and test the HTTP handler against those isolated services. Production migration/deployment and PR merge remain prohibited for this continuation.
- The new CI run is pending verification until GitHub Actions reports a completed result. This addition alone does not complete Stage 7.

## Implementation completion candidate (2026-10-19)

The feature set from Stages 7-10 is now implemented in code on `feat/clouven-drive-foundation`. This section supersedes the earlier "not implemented" status lines; the production disposition remains **NOT READY** until the live checks below are completed.

| Stage | Current status | Evidence / limitation |
|---|---|---|
| 7. Upload and download | **Implemented; deterministic tests pass locally** | Raw `POST /files` with a 3 MiB server cap, journal reservation, Drive `appProperties` reconciliation, and metadata activation. Authenticated `GET /download` streams bytes server-side. |
| 8. File/folder operations | **Implemented; deterministic tests pass locally** | Rename, move with cycle rejection, Trash, restore, and confirmed permanent delete. Non-empty folders must be emptied before permanent deletion. |
| 9. Sharing and ACL management | **Implemented; deterministic tests pass locally** | Internal viewer/editor grants, folder managers, folder-grant inheritance to descendants, and confirmed external reader/writer permissions with idempotent grant/revoke. |
| 10. UI integration | **Implemented; browser regression passed locally** | Upload, download, rename, move picker, Trash view/restore/purge, and share dialogs are wired. Six Playwright checks passed against mocked APIs on Edge; the test is committed as `tests/ui-drive.cjs`. It is not part of CI because the runner does not provision Playwright/Edge. |
| 11. Integration/regression tests | **CI verified; browser run passed locally** | All 14 Drive suites plus the migration-layout suite passed locally and in GitHub Actions run [39245813605](https://github.com/Pierr15/Clouven.two-V2/actions/runs/39245813605) for commit `f063f34`. Live Supabase/Google Drive tests remain outstanding. |
| 12. Readiness review | **Review complete; release blocked** | Production migration, deployment, and PR merge still require explicit approval and live validation. |

### Locally observed test results (2026-10-19)

The following commands were executed in this workspace and exited successfully:

- `npm run test:clouven-drive-access` — 10 assertions
- `npm run test:clouven-drive-api` — 18 assertions, including folder-grant inheritance
- `npm run test:clouven-drive-folder` — 7 assertions
- `npm run test:clouven-drive-folder-handler` — 5 scenarios
- `npm run test:clouven-drive-upload` — 9 assertions
- `npm run test:clouven-drive-mutations` — 7 assertions
- `npm run test:clouven-drive-google-upload` — 6 assertions
- `npm run test:clouven-drive-google-sharing` — 12 assertions
- `npm run test:clouven-drive-files-handler` — 11 scenarios
- `npm run test:clouven-drive-download-handler` — 6 scenarios
- `npm run test:clouven-drive-items-handler` — 7 scenarios
- `npm run test:clouven-drive-trash-handler` — 8 scenarios
- `npm run test:clouven-drive-permissions-handler` — 7 scenarios
- `npm run test:clouven-drive-share-handler` — 6 scenarios
- `npm run test:supabase-migration-layout` — 12 canonical migrations

`node --check` passed for the router, all new handlers, the page module, and the preview server. These results are deterministic mocked/isolated tests, not live-service proof.

Local preview smoke test on 2026-10-19: `/clouven-drive/` returned HTTP 200, and the `items`, `overview`, `download`, `files`, `trash`, `permissions`, and `share` routes each returned HTTP 401 without a session. This verifies local route registration and fail-closed authentication, not authenticated or live-service behavior.

GitHub Actions run [39245813605](https://github.com/Pierr15/Clouven.two-V2/actions/runs/39245813605) completed with `success` for commit `f063f34` on 2026-10-19. All workflow steps passed: dependency install, migration layout, page syntax, ACL/policy, API isolation, Google folder/mutation/upload helpers, and the upload, download, item, Trash, permissions, and external-share handlers.

Browser regression was executed locally on the same date with Playwright driving Edge against mocked APIs. Six checks passed: listing/quota/folder navigation, empty/error/retry/loading/search and XSS-safe names, rename/create/move/upload/download plus the 3 MiB client cap, internal and confirmed external sharing, Trash restore/purge with teacher restrictions, and mobile overflow. The test lives at `tests/ui-drive.cjs`; Playwright and Edge are not provisioned in CI, so it is not a CI step.

### Remaining production blockers

1. Apply `202610160001_clouven_drive_metadata.sql` to the dedicated Supabase development project, inspect constraints/policies, then exercise the endpoints against it.
2. Confirm the server-side Google credential belongs to the intended service-owned Drive identity and run upload/download/move/Trash/share flows against a disposable test folder.
3. Obtain explicit approval before applying the migration to production or deploying.

### Guardrails still honored

- No migration was applied to any database.
- No production secrets or environment configuration were changed.
- No deployment or merge was performed.
- Legacy `/penyimpanan/` and `/api/drive/*` were not edited.
- Google tokens remain server-side; browser code only receives file bytes through the authenticated download endpoint.
