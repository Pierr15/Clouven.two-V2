import { adminSupabase, verifyRequest } from "../../../api/_lib/supabaseAdmin.js";
import { resolveDriveItemAccess } from "../../../api/_lib/clouvenDriveAccess.js";
import { getDriveAccessToken } from "../../../api/_lib/drive.js";
import { findFileByOperationKey, uploadDriveFileForOperation } from "../../../api/_lib/clouvenDriveGoogle.js";
import { readRawBodyWithLimit, validateDriveUpload } from "../../../api/_lib/clouvenDriveUpload.js";
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

const ITEM_FIELDS = "id,drive_file_id,parent_id,item_type,name,mime_type,size_bytes,owner_id,status,created_at,updated_at";

function headerValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0] || "";
  return value == null ? "" : String(value);
}

function decodeHeader(value) {
  const raw = String(value || "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function createFilesHandler({
  db = adminSupabase,
  authenticate = verifyRequest,
  resolveAccess = resolveDriveItemAccess,
  getToken = getDriveAccessToken,
  uploadFile = uploadDriveFileForOperation,
  findFile = findFileByOperationKey,
  readBody = readRawBodyWithLimit,
  env = process.env,
} = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    res.setHeader?.("Cache-Control", "private, no-store");
    res.setHeader?.("X-Content-Type-Options", "nosniff");

    let operation = null;
    let item = null;
    let operationCreatedHere = false;
    let token = null;

    try {
      const actor = await authenticate(req, "student");
      const operationKey = readOperationKey(req);

      const rawName = decodeHeader(headerValue(req, "x-file-name"));
      if (!rawName.trim()) throw apiError(400, "Nama file wajib diisi.", "INVALID_FILE_NAME");

      const parentHeader = headerValue(req, "x-parent-id");
      const parentId = parentHeader.trim() === "" ? null : parentHeader.trim();
      if (parentId !== null) validateUuid(parentId, "ID folder tujuan tidak valid.");

      const mimeHeader = headerValue(req, "content-type").split(";")[0].trim();
      const bytes = await readBody(req);
      const { name, mimeType, sizeBytes } = validateDriveUpload({
        name: rawName,
        mimeType: mimeHeader || "application/octet-stream",
        sizeBytes: bytes.length,
      });

      let parentDriveId = env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
      if (!parentDriveId) throw apiError(503, "Folder root Google Drive belum dikonfigurasi.", "DRIVE_NOT_CONFIGURED");
      if (parentId !== null) {
        const parentResult = await resolveAccess(actor, parentId);
        const parent = parentResult.item;
        if (parent.item_type !== "folder") throw apiError(400, "Tujuan unggah harus berupa folder.", "PARENT_NOT_FOLDER");
        if (!parentResult.access.canEdit) {
          throw apiError(403, "Kamu tidak memiliki izin mengunggah ke folder ini.", "PARENT_NOT_EDITABLE");
        }
        if (!parent.drive_file_id) {
          throw apiError(409, "Folder tujuan belum tersinkron dengan Google Drive.", "PARENT_NOT_SYNCED");
        }
        parentDriveId = parent.drive_file_id;
      }

      const requestData = { name, mime_type: mimeType, size_bytes: sizeBytes, parent_id: parentId };
      const begun = await beginDriveOperation(db, {
        actor, operationKey, operationType: "upload", requestData,
      });
      operation = begun.operation;

      if (begun.replay) {
        if (operation.state === "succeeded" && operation.item_id) {
          const { data: existingItem, error } = await db.from("drive_items")
            .select(ITEM_FIELDS).eq("id", operation.item_id).maybeSingle();
          dbError(error);
          if (existingItem?.status === "active" && existingItem.drive_file_id) {
            const currentAccess = await resolveAccess(actor, existingItem.id);
            if (!currentAccess.access.visible) throw apiError(404, "Item tidak ditemukan.", "DRIVE_ITEM_NOT_FOUND");
            return res.status(200).json({ ok: true, item: existingItem, replayed: true });
          }
        }
        if (["pending", "running", "needs_reconciliation"].includes(operation.state)) {
          token = await getToken();
          const existingDriveFile = await findFile(token, operationKey);
          if (existingDriveFile && operation.item_id) {
            const { data: existingItem, error } = await db.from("drive_items")
              .select(ITEM_FIELDS).eq("id", operation.item_id).maybeSingle();
            dbError(error);
            if (existingItem) {
              const finalized = await finalizeUpload({ db, actor, operation, item: existingItem, driveFile: existingDriveFile });
              return res.status(200).json({ ok: true, item: finalized, replayed: true, reconciled: true });
            }
          }
          throw apiError(409, "Operasi unggah sebelumnya belum selesai dan memerlukan rekonsiliasi. Ulangi dengan key yang sama.", "DRIVE_OPERATION_INCOMPLETE");
        }
        throw apiError(409, "Operasi dengan key ini sudah gagal. Gunakan key baru.", "IDEMPOTENCY_KEY_FAILED");
      }

      operationCreatedHere = true;

      const { data: createdItem, error: itemInsertError } = await db.from("drive_items")
        .insert({
          drive_file_id: null,
          parent_id: parentId,
          item_type: "file",
          name,
          mime_type: mimeType,
          size_bytes: sizeBytes,
          owner_id: actor.uid,
          created_by: actor.uid,
          updated_by: actor.uid,
          status: "pending",
          operation_key: operationKey,
        })
        .select(ITEM_FIELDS)
        .maybeSingle();
      if (itemInsertError) {
        await failDriveOperation(db, operation.id, {
          code: "METADATA_CREATE_FAILED",
          message: "Could not reserve file metadata.",
        });
        throw apiError(503, "Metadata file tidak dapat disiapkan.", "DRIVE_METADATA_CREATE_FAILED");
      }
      item = createdItem;
      if (!item) throw apiError(503, "Metadata file tidak dapat disiapkan.", "DRIVE_METADATA_CREATE_FAILED");

      await markDriveOperationRunning(db, operation.id, item.id);
      operation = { ...operation, item_id: item.id, state: "running" };

      token = await getToken();
      const driveFile = await uploadFile({
        token, operationKey, name, mimeType, parentDriveId, bytes,
      });
      const finalized = await finalizeUpload({ db, actor, operation, item, driveFile });
      return res.status(201).json({ ok: true, item: finalized, replayed: false });
    } catch (error) {
      if (operationCreatedHere && operation?.id && operation.state !== "succeeded") {
        await failDriveOperation(db, operation.id, {
          code: error.code || "UPLOAD_FAILED",
          message: error.message,
          reconciliation: Boolean(item),
        });
        if (item) {
          await db.from("drive_items")
            .update({ status: "error", updated_at: new Date().toISOString() })
            .eq("id", item.id);
        }
      }
      const status = error.status || 500;
      if (status >= 500) console.error("[clouven-drive/files]", error.code || "INTERNAL_ERROR");
      return res.status(status).json({
        error: status >= 500 && !error.code ? "File belum dapat diunggah." : error.message,
        code: error.code || undefined,
      });
    }
  };
}

async function finalizeUpload({ db, actor, operation, item, driveFile }) {
  if (!driveFile?.id || Number(driveFile.size) !== Number(item.size_bytes)) {
    throw apiError(502, "Google Drive tidak mengembalikan metadata file yang sesuai.", "GOOGLE_DRIVE_INVALID_RESPONSE");
  }
  const { data: updatedItem, error } = await db.from("drive_items")
    .update({
      drive_file_id: driveFile.id,
      name: driveFile.name || item.name,
      mime_type: driveFile.mimeType || item.mime_type,
      size_bytes: Number(driveFile.size),
      status: "active",
      updated_by: actor.uid,
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id)
    .select(ITEM_FIELDS)
    .maybeSingle();
  dbError(error);
  if (!updatedItem) {
    throw apiError(503, "File Drive dibuat tetapi metadata belum tersinkron. Ulangi dengan Idempotency-Key yang sama.", "DRIVE_RECONCILIATION_REQUIRED");
  }
  await completeDriveOperation(db, operation.id);
  return updatedItem;
}

export default createFilesHandler();
