import { adminSupabase, verifyRequest } from "../../../api/_lib/supabaseAdmin.js";
import {
  listTrashedDriveItems,
  listVisibleDriveItems,
  resolveDriveItemAccess,
} from "../../../api/_lib/clouvenDriveAccess.js";
import { getDriveAccessToken } from "../../../api/_lib/drive.js";
import { moveDriveItem, renameDriveItem } from "../../../api/_lib/clouvenDriveMutations.js";
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
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function normalizeName(value) {
  if (typeof value !== "string") throw apiError(400, "Nama item wajib berupa teks.", "INVALID_ITEM_NAME");
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 240 || CONTROL_CHARACTERS.test(name) || /[\\/]/.test(name) || name === "." || name === "..") {
    throw apiError(400, "Nama item wajib diisi dan maksimal 240 karakter.", "INVALID_ITEM_NAME");
  }
  return name;
}

export function createItemsHandler({
  db = adminSupabase,
  authenticate = verifyRequest,
  resolveAccess = resolveDriveItemAccess,
  listItems = listVisibleDriveItems,
  listTrash = listTrashedDriveItems,
  getToken = getDriveAccessToken,
  renameItem = renameDriveItem,
  moveItem = moveDriveItem,
  env = process.env,
} = {}) {
  async function readList(req, res) {
    const actor = await authenticate(req, "student");
    const page = req.query?.page === undefined ? 1 : Number(req.query.page);
    const pageSize = req.query?.limit === undefined ? 25 : Number(req.query.limit);
    if (!Number.isInteger(page) || page < 1 || page > 10) return res.status(400).json({ error: "Parameter page harus berupa bilangan 1–10." });
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return res.status(400).json({ error: "Parameter limit harus berupa bilangan 1–50." });
    const view = req.query?.view === "trash" ? "trash" : "active";
    if (view === "trash") {
      const result = await listTrash(actor, { page, pageSize });
      res.setHeader?.("Cache-Control", "private, no-store");
      res.setHeader?.("X-Content-Type-Options", "nosniff");
      return res.status(200).json({ ok: true, view, ...result });
    }
    const query = typeof req.query?.q === "string" ? req.query.q : "";
    if (query.length > 100) return res.status(400).json({ error: "Pencarian maksimal 100 karakter." });
    const parentId = req.query?.parentId || null;
    if (req.query?.parentId && !parentId) return res.status(400).json({ error: "ID folder tidak valid." });
    const result = await listItems(actor, { parentId, query, page, pageSize });
    res.setHeader?.("Cache-Control", "private, no-store");
    res.setHeader?.("X-Content-Type-Options", "nosniff");
    return res.status(200).json({ ok: true, view, ...result });
  }

  async function updateItem(req, res) {
    let operation = null;
    let driveMutated = false;
    let createdHere = false;
    try {
      const actor = await authenticate(req, "student");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      if (Object.hasOwn(body, "owner_id") || Object.hasOwn(body, "created_by") || Object.hasOwn(body, "role") || Object.hasOwn(body, "drive_file_id")) {
        throw apiError(400, "Identitas pemilik dan ID Google Drive ditentukan server.", "CLIENT_TRUSTED_FIELD_REJECTED");
      }
      const id = validateUuid(body.id, "ID item tidak valid.");
      const hasName = Object.hasOwn(body, "name");
      const hasParent = Object.hasOwn(body, "parentId");
      if (!hasName && !hasParent) throw apiError(400, "Tidak ada perubahan yang diminta.", "NOTHING_TO_UPDATE");
      const operationKey = readOperationKey(req);

      const { item, ancestors, access } = await resolveAccess(actor, id);
      if (!access.canEdit) throw apiError(403, "Kamu tidak memiliki izin mengubah item ini.", "ITEM_NOT_EDITABLE");

      const name = hasName ? normalizeName(body.name) : null;
      const targetParentId = hasParent ? (body.parentId == null || body.parentId === "" ? null : body.parentId) : null;
      let destination = null;
      if (hasParent && targetParentId !== null) {
        validateUuid(targetParentId, "ID folder tujuan tidak valid.");
        if (targetParentId === item.id) throw apiError(400, "Item tidak dapat dipindahkan ke dalam dirinya sendiri.", "SAME_ITEM");
        const destinationResult = await resolveAccess(actor, targetParentId);
        destination = destinationResult.item;
        if (destination.item_type !== "folder") throw apiError(400, "Tujuan pemindahan harus berupa folder.", "PARENT_NOT_FOLDER");
        if (!destinationResult.access.canEdit) {
          throw apiError(403, "Kamu tidak memiliki izin memindahkan item ke folder itu.", "PARENT_NOT_EDITABLE");
        }
        if (!destination.drive_file_id) {
          throw apiError(409, "Folder tujuan belum tersinkron dengan Google Drive.", "PARENT_NOT_SYNCED");
        }
        if (destinationResult.ancestors.some(parent => parent.id === item.id)) {
          throw apiError(400, "Folder tidak dapat dipindahkan ke dalam turunannya sendiri.", "MOVE_INTO_DESCENDANT");
        }
      }
      if (hasParent && targetParentId === item.parent_id && !hasName) {
        return res.status(200).json({ ok: true, item, replayed: false, unchanged: true });
      }

      const requestData = {
        id,
        has_name: hasName,
        name,
        has_parent: hasParent,
        parent_id: targetParentId,
      };
      const begun = await beginDriveOperation(db, {
        actor,
        operationKey,
        operationType: hasParent ? "move" : "rename",
        requestData,
      });
      operation = begun.operation;

      if (begun.replay && operation.state === "succeeded" && operation.item_id) {
        const { data: existingItem, error } = await db.from("drive_items")
          .select(ITEM_FIELDS).eq("id", operation.item_id).maybeSingle();
        dbError(error);
        if (existingItem) {
          const currentAccess = await resolveAccess(actor, existingItem.id);
          if (!currentAccess.access.visible) throw apiError(404, "Item tidak ditemukan.", "DRIVE_ITEM_NOT_FOUND");
          return res.status(200).json({ ok: true, item: existingItem, replayed: true });
        }
      }
      if (begun.replay && operation.state === "failed") {
        throw apiError(409, "Operasi dengan key ini sudah gagal. Gunakan key baru.", "IDEMPOTENCY_KEY_FAILED");
      }
      createdHere = !begun.replay;
      if (createdHere) await markDriveOperationRunning(db, operation.id, item.id);
      else operation = { ...operation, item_id: operation.item_id || item.id };

      const token = await getToken();
      const patch = { updated_by: actor.uid, updated_at: new Date().toISOString() };

      if (hasName && item.drive_file_id) {
        const renamed = await renameItem({ token, driveFileId: item.drive_file_id, name });
        driveMutated = true;
        if (renamed?.name !== name) {
          throw apiError(502, "Google Drive mengembalikan nama yang tidak sesuai.", "GOOGLE_DRIVE_INVALID_RESPONSE");
        }
        patch.name = name;
      } else if (hasName) {
        patch.name = name;
      }

      if (hasParent) {
        const oldParentDriveId = item.parent_id
          ? ancestors[0]?.drive_file_id
          : env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
        const newParentDriveId = targetParentId === null
          ? env.GOOGLE_DRIVE_ROOT_FOLDER_ID
          : destination?.drive_file_id;
        if (!oldParentDriveId || !newParentDriveId) {
          throw apiError(409, "Lokasi asal atau tujuan belum tersinkron dengan Google Drive.", "FOLDER_NOT_SYNCED");
        }
        if (item.drive_file_id && oldParentDriveId !== newParentDriveId) {
          const moved = await moveItem({
            token,
            driveFileId: item.drive_file_id,
            oldParentDriveId,
            newParentDriveId,
          });
          driveMutated = true;
          if (Array.isArray(moved?.parents) && !moved.parents.includes(newParentDriveId)) {
            throw apiError(502, "Google Drive mengembalikan lokasi yang tidak sesuai.", "GOOGLE_DRIVE_INVALID_RESPONSE");
          }
        }
        patch.parent_id = targetParentId;
      }

      const { data: updatedItem, error } = await db.from("drive_items")
        .update(patch).eq("id", item.id).select(ITEM_FIELDS).maybeSingle();
      dbError(error);
      if (!updatedItem) throw apiError(503, "Metadata item belum tersinkron.", "DRIVE_RECONCILIATION_REQUIRED");
      await completeDriveOperation(db, operation.id);
      return res.status(200).json({ ok: true, item: updatedItem, replayed: false });
    } catch (error) {
      if (operation?.id && operation.state !== "succeeded") {
        await failDriveOperation(db, operation.id, {
          code: error.code || "ITEM_UPDATE_FAILED",
          message: error.message,
          reconciliation: driveMutated,
        });
      }
      const status = error.status || 500;
      if (status >= 500) console.error("[clouven-drive/items]", error.code || "INTERNAL_ERROR");
      return res.status(status).json({
        error: status >= 500 && !error.code ? "Item belum dapat diperbarui." : error.message,
        code: error.code || undefined,
      });
    }
  }

  return async function handler(req, res) {
    res.setHeader?.("Cache-Control", "private, no-store");
    res.setHeader?.("X-Content-Type-Options", "nosniff");
    try {
      if (req.method === "GET") return await readList(req, res);
      if (req.method === "PATCH") return await updateItem(req, res);
      return res.status(405).json({ error: "Method not allowed" });
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) console.error("[clouven-drive/items]", error.code || "INTERNAL_ERROR");
      return res.status(status).json({
        error: status >= 500 && !error.code ? "Daftar Clouven Drive belum dapat dibaca." : error.message,
        code: error.code || undefined,
      });
    }
  };
}

export default createItemsHandler();
