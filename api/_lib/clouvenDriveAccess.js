import { adminSupabase } from "./supabaseAdmin.js";
import { evaluateDriveItemAccess } from "./clouvenDrivePolicy.js";

const MAX_PARENT_DEPTH = 32;
const MAX_CANDIDATES = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ITEM_FIELDS = "id,drive_file_id,parent_id,item_type,name,mime_type,size_bytes,owner_id,created_by,status,trashed_at,created_at,updated_at";

function apiError(status, message) {
  return Object.assign(new Error(message), { status });
}
function failIfError(error) {
  if (error) throw apiError(503, "Metadata Clouven Drive belum dapat dibaca.");
}
function notFound() {
  return apiError(404, "Item tidak ditemukan.");
}

async function resolveDriveItemAccessWith(db, actor, itemId, { require: required = "read" } = {}) {
  if (!actor?.uid || !actor?.role) throw apiError(401, "Unauthorized");
  if (typeof itemId !== "string" || !UUID_PATTERN.test(itemId)) throw apiError(400, "ID item tidak valid.");

  const { data: item, error: itemError } = await db
    .from("drive_items").select(ITEM_FIELDS).eq("id", itemId).maybeSingle();
  failIfError(itemError);
  if (!item || (item.status !== "active" && required !== "trash")) throw notFound();

  const ancestors = [];
  const seen = new Set([item.id]);
  let parentId = item.parent_id;
  while (parentId) {
    if (seen.has(parentId) || ancestors.length >= MAX_PARENT_DEPTH) {
      throw apiError(409, "Struktur folder tidak valid atau terlalu dalam.");
    }
    seen.add(parentId);
    const { data: parent, error } = await db.from("drive_items")
      .select("id,parent_id,item_type,owner_id,status").eq("id", parentId).maybeSingle();
    failIfError(error);
    if (!parent || parent.item_type !== "folder" || parent.status !== "active") throw notFound();
    ancestors.push(parent);
    parentId = parent.parent_id;
  }

  const folderIds = [item.id, ...ancestors.map(parent => parent.id)];
  const [managerResult, grantResult] = await Promise.all([
    db.from("drive_folder_managers").select("folder_id,user_id")
      .in("folder_id", folderIds).eq("user_id", actor.uid),
    db.from("drive_item_grants").select("item_id,user_id,access_level")
      .eq("item_id", item.id).eq("user_id", actor.uid),
  ]);
  failIfError(managerResult.error);
  failIfError(grantResult.error);

  const access = evaluateDriveItemAccess({
    actor, item, ancestors,
    managers: managerResult.data || [],
    grants: grantResult.data || [],
  });
  if (!access.visible) throw notFound();
  if (required === "edit" && !access.canEdit) throw apiError(403, "Kamu tidak memiliki izin untuk mengubah item ini.");
  if (required === "delete" && !access.canDelete) throw apiError(403, "Kamu hanya dapat menghapus item milikmu sendiri atau sebagai pengelola kelas.");
  if (required === "manager" && !access.canManage) throw apiError(403, "Hanya pemilik folder, pengelola folder, atau pengelola kelas yang dapat mengatur pengelola folder.");
  return { item, ancestors, access };
}

/**
 * Service-role metadata queries are not ACL queries. Filter every candidate through
 * the per-item policy before serialization. Read up to a fixed candidate window so
 * pagination is applied to visible rows, never to unfiltered private rows.
 */
async function listVisibleDriveItemsWith(db, resolveAccess, actor, { parentId = null, query = "", page = 1, pageSize = 25 } = {}) {
  if (!actor?.uid || !actor?.role) throw apiError(401, "Unauthorized");
  if (parentId !== null && (typeof parentId !== "string" || !UUID_PATTERN.test(parentId))) {
    throw apiError(400, "ID folder tidak valid.");
  }
  const normalizedQuery = String(query || "").trim().slice(0, 100);
  if (!Number.isInteger(page) || page < 1 || page > 10 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw apiError(400, "Parameter pagination tidak valid.");
  }
  if (normalizedQuery && page > 1) throw apiError(400, "Pagination pencarian belum didukung; gunakan halaman pertama.");

  if (parentId) {
    const { item } = await resolveAccess(actor, parentId);
    if (item.item_type !== "folder") throw apiError(400, "Lokasi yang dipilih bukan folder.");
  }

  let request = db.from("drive_items")
    .select(ITEM_FIELDS)
    .eq("status", "active")
    .order("item_type", { ascending: true })
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .range(0, MAX_CANDIDATES);
  request = parentId ? request.eq("parent_id", parentId) : request.is("parent_id", null);
  if (normalizedQuery) {
    const escaped = normalizedQuery.replace(/[\\%_]/g, "\\$&");
    request = request.ilike("name", `%${escaped}%`);
  }

  const { data, error } = await request;
  failIfError(error);
  const rows = data || [];
  const truncated = rows.length > MAX_CANDIDATES;
  const candidates = rows.slice(0, MAX_CANDIDATES);
  const visible = [];
  for (const item of candidates) {
    try {
      const { access } = await resolveAccess(actor, item.id);
      if (access.visible) visible.push({
        ...item,
        permissions: { canEdit: access.canEdit, canDelete: access.canDelete, canManage: access.canManage },
      });
    } catch (error) {
      if (error.status === 404 || error.status === 403) continue;
      throw error;
    }
  }

  const offset = (page - 1) * pageSize;
  return {
    items: visible.slice(offset, offset + pageSize),
    page,
    pageSize,
    hasMore: offset + pageSize < visible.length || (truncated && (normalizedQuery ? candidates.length === MAX_CANDIDATES : true)),
    truncated,
  };
}



/** Factory enables deterministic integration-style tests with a fake PostgREST client. */
export function createDriveAccessService(db) {
  const resolveAccess = (actor, itemId, options) => resolveDriveItemAccessWith(db, actor, itemId, options);
  return {
    resolveDriveItemAccess: resolveAccess,
    listVisibleDriveItems: (actor, options) => listVisibleDriveItemsWith(db, resolveAccess, actor, options),
    getVisibleDriveOverview: async (actor) => {
      const { items, hasMore, truncated } = await listVisibleDriveItemsWith(db, resolveAccess, actor, { page: 1, pageSize: 50 });
      const counts = { files: 0, folders: 0 };
      for (const item of items) counts[item.item_type === "folder" ? "folders" : "files"] += 1;
      return { counts, partial: hasMore || truncated, quota: null };
    },
  };
}

const defaultService = createDriveAccessService(adminSupabase);
export const resolveDriveItemAccess = defaultService.resolveDriveItemAccess;
export const listVisibleDriveItems = defaultService.listVisibleDriveItems;
export const getVisibleDriveOverview = defaultService.getVisibleDriveOverview;
