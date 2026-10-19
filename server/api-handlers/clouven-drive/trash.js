import { adminSupabase, verifyRequest } from "../../../api/_lib/supabaseAdmin.js";
import { resolveDriveItemAccess } from "../../../api/_lib/clouvenDriveAccess.js";
import { getDriveAccessToken } from "../../../api/_lib/drive.js";
import { deleteDriveFile } from "../../../api/_lib/clouvenDriveGoogle.js";
import { setDriveItemTrashed } from "../../../api/_lib/clouvenDriveMutations.js";
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

const ITEM_FIELDS = "id,drive_file_id,parent_id,item_type,name,mime_type,size_bytes,owner_id,status,trashed_at,created_at,updated_at";

export function createTrashHandler({
  db = adminSupabase,
  authenticate = verifyRequest,
  resolveAccess = resolveDriveItemAccess,
  getToken = getDriveAccessToken,
  setTrashed = setDriveItemTrashed,
  removeDriveFile = deleteDriveFile,
  env = process.env,
} = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    res.setHeader?.("Cache-Control", "private, no-store");
    res.setHeader?.("X-Content-Type-Options", "nosniff");

    let operation = null;
    let driveMutated = false;
    let createdHere = false;
    try {
      const actor = await authenticate(req, "student");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const action = body.action;
      if (!["trash", "restore", "delete"].includes(action)) {
        throw apiError(400, "Aksi Sampah tidak valid.", "INVALID_TRASH_ACTION");
      }
      const id = validateUuid(body.id, "ID item tidak valid.");
      const operationKey = readOperationKey(req);
      const isDeleted = action === "delete";

      const { item, access } = await resolveAccess(actor, id, isDeleted || action === "restore" ? { required: "trash" } : {});
      if (action === "trash" && item.status !== "active") throw apiError(404, "Item tidak ditemukan.", "DRIVE_ITEM_NOT_FOUND");
      if (action !== "trash" && item.status !== "trashed") {
        throw apiError(409, "Item tidak berada di Sampah.", "ITEM_NOT_TRASHED");
      }
      if (isDeleted) {
        if (item.owner_id !== actor.uid && actor.role !== "owner") {
          throw apiError(403, "Hanya pemilik item atau Owner yang dapat menghapus permanen.", "PERMANENT_DELETE_FORBIDDEN");
        }
        if (body.confirm !== true) {
          throw apiError(400, "Hapus permanen memerlukan konfirmasi eksplisit.", "PERMANENT_DELETE_CONFIRMATION_REQUIRED");
        }
        if (!item.drive_file_id) throw apiError(409, "Item belum tersinkron dengan Google Drive.", "ITEM_NOT_SYNCED");
        if (item.item_type === "folder") {
          const { data: children, error } = await db.from("drive_items").select("id").eq("parent_id", id);
          dbError(error);
          if ((children || []).length) {
            throw apiError(409, "Folder harus dikosongkan sebelum dihapus permanen.", "FOLDER_NOT_EMPTY");
          }
        }
      } else {
        if (!access.canDelete) throw apiError(403, "Kamu tidak memiliki izin memindahkan item ini ke Sampah.", "ITEM_NOT_DELETABLE");
        if (!item.drive_file_id) throw apiError(409, "Item belum tersinkron dengan Google Drive.", "ITEM_NOT_SYNCED");
        if (action === "trash" && item.item_type === "folder") {
          const { data: children, error } = await db.from("drive_items").select("id").eq("parent_id", id);
          dbError(error);
          if ((children || []).length) {
            throw apiError(409, "Kosongkan folder terlebih dahulu sebelum memindahkannya ke Sampah.", "FOLDER_NOT_EMPTY");
          }
        }
      }

      const requestData = { id, action };
      const begun = await beginDriveOperation(db, {
        actor,
        operationKey,
        operationType: isDeleted ? "permanent_delete" : action === "restore" ? "restore" : "trash",
        requestData,
      });
      operation = begun.operation;

      if (begun.replay && operation.state === "succeeded") {
        if (isDeleted) return res.status(200).json({ ok: true, id, replayed: true });
        const { data: existingItem, error } = await db.from("drive_items")
          .select(ITEM_FIELDS).eq("id", id).maybeSingle();
        dbError(error);
        if (existingItem) return res.status(200).json({ ok: true, item: existingItem, replayed: true });
      }
      if (begun.replay && operation.state === "failed") {
        throw apiError(409, "Operasi dengan key ini sudah gagal. Gunakan key baru.", "IDEMPOTENCY_KEY_FAILED");
      }
      createdHere = !begun.replay;
      if (createdHere) await markDriveOperationRunning(db, operation.id, item.id);

      const token = await getToken();
      if (isDeleted) {
        await removeDriveFile({ token, driveFileId: item.drive_file_id });
        driveMutated = true;
        const { error } = await db.from("drive_items").delete().eq("id", id);
        dbError(error);
        await completeDriveOperation(db, operation.id);
        return res.status(200).json({ ok: true, id, replayed: false });
      }

      const toTrash = action === "trash";
      if (item.drive_file_id) {
        await setTrashed({ token, driveFileId: item.drive_file_id, trashed: toTrash });
        driveMutated = true;
      }
      const { data: updatedItem, error } = await db.from("drive_items")
        .update({
          status: toTrash ? "trashed" : "active",
          trashed_at: toTrash ? new Date().toISOString() : null,
          updated_by: actor.uid,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(ITEM_FIELDS)
        .maybeSingle();
      dbError(error);
      if (!updatedItem) throw apiError(503, "Status Sampah belum tersinkron.", "DRIVE_RECONCILIATION_REQUIRED");
      await completeDriveOperation(db, operation.id);
      return res.status(200).json({ ok: true, item: updatedItem, replayed: false });
    } catch (error) {
      if (operation?.id && operation.state !== "succeeded") {
        await failDriveOperation(db, operation.id, {
          code: error.code || "TRASH_OPERATION_FAILED",
          message: error.message,
          reconciliation: driveMutated,
        });
      }
      const status = error.status || 500;
      if (status >= 500) console.error("[clouven-drive/trash]", error.code || "INTERNAL_ERROR");
      return res.status(status).json({
        error: status >= 500 && !error.code ? "Operasi Sampah belum dapat diselesaikan." : error.message,
        code: error.code || undefined,
      });
    }
  };
}

export default createTrashHandler();
