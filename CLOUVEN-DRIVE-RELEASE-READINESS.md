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
