import { adminSupabase, verifyRequest } from "../../../api/_lib/supabaseAdmin.js";
import { resolveDriveItemAccess } from "../../../api/_lib/clouvenDriveAccess.js";
import { getDriveAccessToken } from "../../../api/_lib/drive.js";
import { createDriveFolderForOperation, findFolderByOperationKey } from "../../../api/_lib/clouvenDriveGoogle.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ITEM_FIELDS = "id,drive_file_id,parent_id,item_type,name,mime_type,size_bytes,owner_id,status,created_at,updated_at";

function apiError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}
function dbError(error) {
  if (!error) return;
  return apiError(503, "Metadata Clouven Drive belum dapat diperbarui.", "DRIVE_METADATA_UNAVAILABLE");
}
async function getOperation(operationKey) {
  const { data, error } = await adminSupabase.from("drive_operations")
    .select("id,operation_key,actor_id,item_id,operation_type,state")
    .eq("operation_key", operationKey).maybeSingle();
  dbError(error);
  return data;
}
async function finishOperation(operation, item, driveFolder) {
  const { data: updatedItem, error: itemError } = await adminSupabase.from("drive_items")
    .update({
      drive_file_id: driveFolder.id,
      name: driveFolder.name,
      mime_type: driveFolder.mimeType,
      status: "active",
      updated_by: operation.actor_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id)
    .select(ITEM_FIELDS)
    .maybeSingle();
  dbError(itemError);
  if (!updatedItem) throw apiError(503, "Folder Drive dibuat tetapi metadata belum tersinkron. Coba lagi menggunakan Idempotency-Key yang sama.", "DRIVE_RECONCILIATION_REQUIRED");

  const { error: operationError } = await adminSupabase.from("drive_operations")
    .update({ state: "succeeded", error_code: null, error_message: null, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", operation.id);
  dbError(operationError);
  return updatedItem;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let operation = null;
  let item = null;
  let operationCreatedHere = false;
  let token = null;
  try {
    const actor = await verifyRequest(req, "student");
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name) || name === "." || name === "..") {
      throw apiError(400, "Nama folder wajib diisi dan maksimal 120 karakter.", "INVALID_FOLDER_NAME");
    }
    if (Object.hasOwn(body, "owner_id") || Object.hasOwn(body, "created_by") || Object.hasOwn(body, "role") || Object.hasOwn(body, "drive_file_id")) {
      throw apiError(400, "Identitas pemilik dan ID Google Drive ditentukan server.", "CLIENT_TRUSTED_FIELD_REJECTED");
    }
    const operationKey = String(req.headers?.["idempotency-key"] || "").trim();
    if (!UUID_PATTERN.test(operationKey)) throw apiError(400, "Header Idempotency-Key wajib berupa UUID.", "IDEMPOTENCY_KEY_REQUIRED");

    const parentId = body.parentId == null || body.parentId === "" ? null : body.parentId;
    let parent = null;
    let parentDriveId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    if (!parentDriveId) throw apiError(503, "Folder root Google Drive belum dikonfigurasi.", "DRIVE_NOT_CONFIGURED");
    if (parentId !== null) {
      if (typeof parentId !== "string" || !UUID_PATTERN.test(parentId)) throw apiError(400, "ID folder tujuan tidak valid.", "INVALID_PARENT");
      const result = await resolveDriveItemAccess(actor, parentId);
      parent = result.item;
      if (parent.item_type !== "folder") throw apiError(400, "Tujuan harus berupa folder.", "PARENT_NOT_FOLDER");
      if (!result.access.canEdit) throw apiError(403, "Kamu tidak memiliki izin membuat folder di lokasi ini.", "PARENT_NOT_EDITABLE");
      if (!parent.drive_file_id) throw apiError(409, "Folder tujuan belum tersinkron dengan Google Drive.", "PARENT_NOT_SYNCED");
      parentDriveId = parent.drive_file_id;
    }

    operation = await getOperation(operationKey);
    if (operation) {
      if (operation.actor_id !== actor.uid || operation.operation_type !== "create_folder") {
        throw apiError(409, "Idempotency-Key sudah digunakan untuk operasi lain.", "IDEMPOTENCY_KEY_CONFLICT");
      }
      if (operation.state === "succeeded" && operation.item_id) {
        const { data: existingItem, error } = await adminSupabase.from("drive_items")
          .select(ITEM_FIELDS).eq("id", operation.item_id).maybeSingle();
        dbError(error);
        if (existingItem?.status === "active" && existingItem.drive_file_id) {
          return res.status(200).json({ ok: true, item: existingItem, replayed: true });
        }
      }
      if (["pending", "running", "needs_reconciliation"].includes(operation.state)) {
        token = await getDriveAccessToken();
        const existingDriveFolder = await findFolderByOperationKey(token, operationKey);
        if (existingDriveFolder && operation.item_id) {
          const { data: existingItem, error } = await adminSupabase.from("drive_items")
            .select(ITEM_FIELDS).eq("id", operation.item_id).maybeSingle();
          dbError(error);
          if (existingItem) {
            const finalized = await finishOperation(operation, existingItem, existingDriveFolder);
            return res.status(200).json({ ok: true, item: finalized, replayed: true, reconciled: true });
          }
        }
        throw apiError(409, "Operasi sebelumnya belum selesai dan memerlukan rekonsiliasi. Jangan membuat key baru; hubungi pengelola.", "DRIVE_OPERATION_INCOMPLETE");
      }
      throw apiError(409, "Operasi dengan key ini sudah gagal. Gunakan key baru setelah memeriksa status operasi.", "IDEMPOTENCY_KEY_FAILED");
    }

    const { data: createdOperation, error: operationInsertError } = await adminSupabase.from("drive_operations")
      .insert({
        operation_key: operationKey,
        actor_id: actor.uid,
        operation_type: "create_folder",
        state: "pending",
        request_data: { name, parent_id: parentId },
      })
      .select("id,operation_key,actor_id,item_id,operation_type,state")
      .maybeSingle();
    if (operationInsertError) {
      if (operationInsertError.code === "23505") throw apiError(409, "Operasi dengan key ini sudah dibuat. Ulangi permintaan dengan key yang sama.", "IDEMPOTENCY_KEY_CONFLICT");
      dbError(operationInsertError);
    }
    operation = createdOperation;
    operationCreatedHere = true;
    if (!operation) throw apiError(503, "Jurnal operasi tidak dapat dibuat.", "DRIVE_JOURNAL_FAILED");

    const { data: createdItem, error: itemInsertError } = await adminSupabase.from("drive_items")
      .insert({
        drive_file_id: null,
        parent_id: parentId,
        item_type: "folder",
        name,
        mime_type: "application/vnd.google-apps.folder",
        size_bytes: 0,
        owner_id: actor.uid,
        created_by: actor.uid,
        updated_by: actor.uid,
        status: "pending",
        operation_key: operationKey,
      })
      .select(ITEM_FIELDS)
      .maybeSingle();
    if (itemInsertError) {
      await adminSupabase.from("drive_operations").update({
        state: "failed", error_code: "METADATA_CREATE_FAILED",
        error_message: "Could not reserve folder metadata.", finished_at: new Date().toISOString(),
      }).eq("id", operation.id);
      dbError(itemInsertError);
    }
    item = createdItem;
    if (!item) throw apiError(503, "Metadata folder tidak dapat disiapkan.", "DRIVE_METADATA_CREATE_FAILED");

    const { error: linkError } = await adminSupabase.from("drive_operations")
      .update({ item_id: item.id, state: "running", updated_at: new Date().toISOString() })
      .eq("id", operation.id);
    dbError(linkError);
    operation = { ...operation, item_id: item.id, state: "running" };

    token = await getDriveAccessToken();
    const driveFolder = await createDriveFolderForOperation({ token, operationKey, name, parentDriveId });
    const finalized = await finishOperation(operation, item, driveFolder);
    return res.status(201).json({ ok: true, item: finalized, replayed: false });
  } catch (error) {
    if (operationCreatedHere && operation?.id && operation.state !== "succeeded") {
      const state = item ? "needs_reconciliation" : "failed";
      await adminSupabase.from("drive_operations").update({
        state,
        error_code: error.code || "FOLDER_CREATE_FAILED",
        error_message: String(error.message || "Folder creation failed").slice(0, 500),
        updated_at: new Date().toISOString(),
        ...(state === "failed" ? { finished_at: new Date().toISOString() } : {}),
      }).eq("id", operation.id);
      if (item && state === "needs_reconciliation") {
        await adminSupabase.from("drive_items").update({ status: "error", updated_at: new Date().toISOString() }).eq("id", item.id);
      }
    }
    const status = error.status || 500;
    if (status >= 500) console.error("[clouven-drive/folders]", error.code || "INTERNAL_ERROR");
    res.setHeader?.("Cache-Control", "private, no-store");
    res.setHeader?.("X-Content-Type-Options", "nosniff");
    return res.status(status).json({
      error: status >= 500 && !error.code ? "Folder belum dapat dibuat." : error.message,
      code: error.code || undefined,
    });
  }
}
