# Clouven Drive implementation notes

## Current slice: UI foundation only

This branch adds a separate authenticated Clouven Drive page and navigation entry. It does not replace or modify the existing `/penyimpanan/` experience.

### Included
- New `/clouven-drive/` page with responsive layout.
- Dedicated CSS and page module using the existing Supabase session gate and sidebar shell.
- Explicit foundation notice, unavailable quota/count states, and disabled file-operation controls.
- Local preview route registration.
- No sample files, mock quota, or fake-success actions.

### Not implemented yet
- Drive item metadata and ownership model.
- Folder manager assignments and explicit item permissions.
- Server-side list/search/create/upload/download/rename/move/trash/restore APIs.
- Google Drive external sharing confirmation and permission reconciliation.
- Trash synchronization and partial-operation recovery.
- Automated tests for authorization and cross-service failure handling.

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
1. Audit all existing migrations, member role policies, and the deployed Vercel/local handler paths.
2. Design and review the metadata migration and RLS boundaries before applying it anywhere.
3. Add a shared server-side authorization service for per-item and inherited folder permissions.
4. Implement listing, folders, resumable upload, download/preview, rename/move, Trash/restore, quota, and explicit external sharing.
5. Add tests for IDOR, inheritance, folder cycles, partial failures, and Drive/Supabase reconciliation.


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
