import { adminSupabase, verifyRequest } from "../../../api/_lib/supabaseAdmin.js";
import { resolveDriveItemAccess } from "../../../api/_lib/clouvenDriveAccess.js";
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

const ACCESS_LEVELS = new Set(["viewer", "editor", "manager"]);

function parseAccess(value) {
  if (!ACCESS_LEVELS.has(value)) throw apiError(400, "Level akses tidak valid.", "INVALID_ACCESS_LEVEL");
  return value;
}

export function createPermissionsHandler({
  db = adminSupabase,
  authenticate = verifyRequest,
  resolveAccess = resolveDriveItemAccess,
} = {}) {
  async function requireManager(actor, itemId) {
    const { item, access } = await resolveAccess(actor, itemId, { require: "manager" });
    if (!access.canManage) throw apiError(403, "Kamu tidak memiliki izin mengatur berbagi item ini.", "ITEM_NOT_MANAGEABLE");
    return item;
  }

  async function readPermissions(req, res) {
    const actor = await authenticate(req, "student");
    const itemId = validateUuid(req.query?.itemId, "ID item tidak valid.");
    const item = await requireManager(actor, itemId);
    const [grantResult, managerResult] = await Promise.all([
      db.from("drive_item_grants").select("item_id,user_id,access_level,created_at,updated_at").eq("item_id", itemId),
      item.item_type === "folder"
        ? db.from("drive_folder_managers").select("folder_id,user_id,created_at").eq("folder_id", itemId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    dbError(grantResult.error);
    dbError(managerResult.error);
    return res.status(200).json({
      ok: true,
      item_id: itemId,
      grants: grantResult.data || [],
      managers: managerResult.data || [],
    });
  }

  async function addPermission(req, res) {
    let operation = null;
    let createdHere = false;
    try {
      const actor = await authenticate(req, "student");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const itemId = validateUuid(body.itemId, "ID item tidak valid.");
      const userId = validateUuid(body.userId, "ID anggota tidak valid.");
      const accessLevel = parseAccess(body.access);
      if (userId === actor.uid) throw apiError(400, "Tidak dapat memberikan akses kepada diri sendiri.", "SELF_GRANT_REJECTED");
      const operationKey = readOperationKey(req);

      const item = await requireManager(actor, itemId);
      if (accessLevel === "manager" && item.item_type !== "folder") {
        throw apiError(400, "Pengelola hanya dapat ditambahkan pada folder.", "MANAGER_REQUIRES_FOLDER");
      }
      const { data: target, error: memberError } = await db.from("members")
        .select("id").eq("id", userId).maybeSingle();
      dbError(memberError);
      if (!target) throw apiError(404, "Anggota tidak ditemukan.", "MEMBER_NOT_FOUND");

      const requestData = { item_id: itemId, user_id: userId, access: accessLevel, action: "add" };
      const begun = await beginDriveOperation(db, {
        actor, operationKey, operationType: "set_manager", requestData,
      });
      operation = begun.operation;
      if (begun.replay && operation.state === "succeeded") {
        return res.status(200).json({ ok: true, item_id: itemId, user_id: userId, access: accessLevel, replayed: true });
      }
      if (begun.replay && operation.state === "failed") {
        throw apiError(409, "Operasi dengan key ini sudah gagal. Gunakan key baru.", "IDEMPOTENCY_KEY_FAILED");
      }
      createdHere = !begun.replay;
      if (createdHere) await markDriveOperationRunning(db, operation.id, itemId);

      if (accessLevel === "manager") {
        const { data: existing, error: lookupError } = await db.from("drive_folder_managers")
          .select("folder_id,user_id").eq("folder_id", itemId).eq("user_id", userId).maybeSingle();
        dbError(lookupError);
        if (!existing) {
          const { error } = await db.from("drive_folder_managers")
            .insert({ folder_id: itemId, user_id: userId, granted_by: actor.uid });
          dbError(error);
        }
      } else {
        const { data: existing, error: lookupError } = await db.from("drive_item_grants")
          .select("item_id,user_id").eq("item_id", itemId).eq("user_id", userId).maybeSingle();
        dbError(lookupError);
        if (existing) {
          const { error } = await db.from("drive_item_grants")
            .update({ access_level: accessLevel, granted_by: actor.uid, updated_at: new Date().toISOString() })
            .eq("item_id", itemId).eq("user_id", userId);
          dbError(error);
        } else {
          const { error } = await db.from("drive_item_grants")
            .insert({ item_id: itemId, user_id: userId, access_level: accessLevel, granted_by: actor.uid });
          dbError(error);
        }
      }
      await completeDriveOperation(db, operation.id);
      return res.status(200).json({ ok: true, item_id: itemId, user_id: userId, access: accessLevel, replayed: false });
    } catch (error) {
      if (operation?.id && operation.state !== "succeeded") {
        await failDriveOperation(db, operation.id, { code: error.code || "PERMISSION_UPDATE_FAILED", message: error.message });
      }
      const status = error.status || 500;
      if (status >= 500) console.error("[clouven-drive/permissions]", error.code || "INTERNAL_ERROR");
      return res.status(status).json({
        error: status >= 500 && !error.code ? "Akses berbagi belum dapat diperbarui." : error.message,
        code: error.code || undefined,
      });
    }
  }

  async function removePermission(req, res) {
    let operation = null;
    try {
      const actor = await authenticate(req, "student");
      const itemId = validateUuid(req.query?.itemId, "ID item tidak valid.");
      const userId = validateUuid(req.query?.userId, "ID anggota tidak valid.");
      const accessLevel = parseAccess(req.query?.access);
      const operationKey = readOperationKey(req);

      await requireManager(actor, itemId);
      const requestData = { item_id: itemId, user_id: userId, access: accessLevel, action: "remove" };
      const begun = await beginDriveOperation(db, {
        actor, operationKey, operationType: "set_manager", requestData,
      });
      operation = begun.operation;
      if (begun.replay && operation.state === "succeeded") {
        return res.status(200).json({ ok: true, item_id: itemId, user_id: userId, access: accessLevel, replayed: true });
      }
      if (begun.replay && operation.state === "failed") {
        throw apiError(409, "Operasi dengan key ini sudah gagal. Gunakan key baru.", "IDEMPOTENCY_KEY_FAILED");
      }
      if (!begun.replay) await markDriveOperationRunning(db, operation.id, itemId);

      const { error } = accessLevel === "manager"
        ? await db.from("drive_folder_managers").delete().eq("folder_id", itemId).eq("user_id", userId)
        : await db.from("drive_item_grants").delete().eq("item_id", itemId).eq("user_id", userId);
      dbError(error);
      await completeDriveOperation(db, operation.id);
      return res.status(200).json({ ok: true, item_id: itemId, user_id: userId, access: accessLevel, replayed: false });
    } catch (error) {
      if (operation?.id && operation.state !== "succeeded") {
        await failDriveOperation(db, operation.id, { code: error.code || "PERMISSION_REMOVE_FAILED", message: error.message });
      }
      const status = error.status || 500;
      if (status >= 500) console.error("[clouven-drive/permissions]", error.code || "INTERNAL_ERROR");
      return res.status(status).json({
        error: status >= 500 && !error.code ? "Akses berbagi belum dapat dihapus." : error.message,
        code: error.code || undefined,
      });
    }
  }

  return async function handler(req, res) {
    res.setHeader?.("Cache-Control", "private, no-store");
    res.setHeader?.("X-Content-Type-Options", "nosniff");
    try {
      if (req.method === "GET") return await readPermissions(req, res);
      if (req.method === "POST") return await addPermission(req, res);
      if (req.method === "DELETE") return await removePermission(req, res);
      return res.status(405).json({ error: "Method not allowed" });
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) console.error("[clouven-drive/permissions]", error.code || "INTERNAL_ERROR");
      return res.status(status).json({
        error: status >= 500 && !error.code ? "Akses berbagi belum dapat dibaca." : error.message,
        code: error.code || undefined,
      });
    }
  };
}

export default createPermissionsHandler();
