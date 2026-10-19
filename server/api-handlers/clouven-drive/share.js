import { adminSupabase, verifyRequest } from "../../../api/_lib/supabaseAdmin.js";
import { resolveDriveItemAccess } from "../../../api/_lib/clouvenDriveAccess.js";
import { getDriveAccessToken } from "../../../api/_lib/drive.js";
import {
  createDrivePermission,
  deleteDrivePermission,
  listDrivePermissions,
} from "../../../api/_lib/clouvenDriveGoogle.js";
import {
  apiError,
  beginDriveOperation,
  completeDriveOperation,
  dbError,
  failDriveOperation,
  markDriveOperationRunning,
  readOperationKey,
  validateUuid,
} from "../../../api/_lib/clouvenDriveJournal.js";

export function createShareHandler({
  db = adminSupabase,
  authenticate = verifyRequest,
  resolveAccess = resolveDriveItemAccess,
  getToken = getDriveAccessToken,
  createPermission = createDrivePermission,
  listPermissions = listDrivePermissions,
  removePermission = deleteDrivePermission,
} = {}) {
  async function requireShareable(actor, itemId) {
    const { item, access } = await resolveAccess(actor, itemId, { require: "manager" });
    if (!access.canManage) throw apiError(403, "Kamu tidak memiliki izin membagikan item ini.", "ITEM_NOT_MANAGEABLE");
    if (!item.drive_file_id) throw apiError(409, "Item belum tersinkron dengan Google Drive.", "ITEM_NOT_SYNCED");
    return item;
  }

  async function readShares(req, res) {
    const actor = await authenticate(req, "student");
    const itemId = validateUuid(req.query?.itemId, "ID item tidak valid.");
    const item = await requireShareable(actor, itemId);
    const token = await getToken();
    const permissions = await listPermissions({ token, driveFileId: item.drive_file_id });
    return res.status(200).json({ ok: true, item_id: itemId, permissions });
  }

  async function grantShare(req, res) {
    let operation = null;
    let createdHere = false;
    try {
      const actor = await authenticate(req, "student");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const itemId = validateUuid(body.itemId, "ID item tidak valid.");
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const role = body.role;
      if (!["reader", "writer"].includes(role)) throw apiError(400, "Peran berbagi tidak valid.", "INVALID_SHARE_ROLE");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        throw apiError(400, "Alamat email tujuan tidak valid.", "INVALID_EMAIL");
      }
      if (body.confirm !== true) {
        throw apiError(400, "Berbagi eksternal memerlukan konfirmasi eksplisit.", "SHARE_CONFIRMATION_REQUIRED");
      }
      const operationKey = readOperationKey(req);
      const item = await requireShareable(actor, itemId);

      const requestData = { action: "grant", item_id: itemId, email, role };
      const begun = await beginDriveOperation(db, {
        actor, operationKey, operationType: "share_external", requestData,
      });
      operation = begun.operation;
      if (begun.replay && operation.state === "succeeded") {
        return res.status(200).json({ ok: true, item_id: itemId, email, role, replayed: true });
      }
      if (begun.replay && operation.state === "failed") {
        throw apiError(409, "Operasi dengan key ini sudah gagal. Gunakan key baru.", "IDEMPOTENCY_KEY_FAILED");
      }
      createdHere = !begun.replay;
      if (createdHere) await markDriveOperationRunning(db, operation.id, itemId);

      const token = await getToken();
      let permission = null;
      if (!createdHere) {
        // A retried grant may already exist in Google Drive; detect it first so
        // reconciliation does not create a duplicate share.
        const permissions = await listPermissions({ token, driveFileId: item.drive_file_id });
        permission = permissions.find(row => String(row.emailAddress || "").toLowerCase() === email && row.role === role) || null;
      }
      if (!permission) {
        permission = await createPermission({ token, driveFileId: item.drive_file_id, email, role });
      }
      await completeDriveOperation(db, operation.id);
      return res.status(201).json({ ok: true, item_id: itemId, permission, replayed: false });
    } catch (error) {
      if (operation?.id && operation.state !== "succeeded") {
        await failDriveOperation(db, operation.id, { code: error.code || "SHARE_FAILED", message: error.message });
      }
      const status = error.status || 500;
      if (status >= 500) console.error("[clouven-drive/share]", error.code || "INTERNAL_ERROR");
      return res.status(status).json({
        error: status >= 500 && !error.code ? "Item belum dapat dibagikan." : error.message,
        code: error.code || undefined,
      });
    }
  }

  async function revokeShare(req, res) {
    let operation = null;
    try {
      const actor = await authenticate(req, "student");
      const itemId = validateUuid(req.query?.itemId, "ID item tidak valid.");
      const permissionId = String(req.query?.permissionId || "");
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(permissionId)) throw apiError(400, "ID permission tidak valid.", "INVALID_PERMISSION_ID");
      const operationKey = readOperationKey(req);
      const item = await requireShareable(actor, itemId);
      const requestData = { action: "revoke", item_id: itemId, permission_id: permissionId };
      const begun = await beginDriveOperation(db, {
        actor, operationKey, operationType: "share_external", requestData,
      });
      operation = begun.operation;
      if (begun.replay && operation.state === "succeeded") {
        return res.status(200).json({ ok: true, item_id: itemId, permission_id: permissionId, replayed: true });
      }
      if (begun.replay && operation.state === "failed") {
        throw apiError(409, "Operasi dengan key ini sudah gagal. Gunakan key baru.", "IDEMPOTENCY_KEY_FAILED");
      }
      if (!begun.replay) await markDriveOperationRunning(db, operation.id, itemId);
      const token = await getToken();
      const result = await removePermission({ token, driveFileId: item.drive_file_id, permissionId });
      await completeDriveOperation(db, operation.id);
      return res.status(200).json({ ok: true, item_id: itemId, permission_id: permissionId, already_deleted: Boolean(result?.alreadyDeleted), replayed: false });
    } catch (error) {
      if (operation?.id && operation.state !== "succeeded") {
        await failDriveOperation(db, operation.id, { code: error.code || "UNSHARE_FAILED", message: error.message });
      }
      const status = error.status || 500;
      if (status >= 500) console.error("[clouven-drive/share]", error.code || "INTERNAL_ERROR");
      return res.status(status).json({
        error: status >= 500 && !error.code ? "Permission berbagi belum dapat dicabut." : error.message,
        code: error.code || undefined,
      });
    }
  }

  return async function handler(req, res) {
    res.setHeader?.("Cache-Control", "private, no-store");
    res.setHeader?.("X-Content-Type-Options", "nosniff");
    try {
      if (req.method === "GET") return await readShares(req, res);
      if (req.method === "POST") return await grantShare(req, res);
      if (req.method === "DELETE") return await revokeShare(req, res);
      return res.status(405).json({ error: "Method not allowed" });
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) console.error("[clouven-drive/share]", error.code || "INTERNAL_ERROR");
      return res.status(status).json({
        error: status >= 500 && !error.code ? "Permission berbagi belum dapat dibaca." : error.message,
        code: error.code || undefined,
      });
    }
  };
}

export default createShareHandler();
