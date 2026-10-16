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
