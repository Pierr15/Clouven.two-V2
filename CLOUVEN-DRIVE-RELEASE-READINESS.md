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
