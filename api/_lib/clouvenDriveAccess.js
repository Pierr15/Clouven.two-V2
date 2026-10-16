import { adminSupabase } from "./supabaseAdmin.js";

const STAFF_ROLES = new Set(["class_officer", "teacher", "developer", "owner"]);
const MAX_PARENT_DEPTH = 32;

function forbidden(message = "Kamu tidak memiliki akses ke item Clouven Drive.") {
  return Object.assign(new Error(message), { status: 403 });
}
function notFound() {
  // Do not reveal whether an inaccessible item exists.
  return Object.assign(new Error("Item tidak ditemukan."), { status: 404 });
}
function failIfError(error) {
  if (error) throw Object.assign(new Error("Metadata Clouven Drive belum dapat dibaca."), { status: 503 });
}

export function evaluateDriveItemAccess({ actor, item, ancestors = [], managers = [], grants = [] }) {
  if (!actor?.uid || !actor?.role || !item) return { visible: false, canEdit: false, canDelete: false, reason: "missing_context" };
  const staff = STAFF_ROLES.has(actor.role);
  const ownsItem = item.owner_id === actor.uid;
  const managesFolder = managers.some(row => row.user_id === actor.uid);
  const hasGrant = grants.some(row => row.user_id === actor.uid && ["viewer", "editor"].includes(row.access_level));
  const inheritedManager = ancestors.some(parent => parent.owner_id === actor.uid) || managesFolder;
  const visible = staff || ownsItem || hasGrant || inheritedManager;
  const canEdit = staff || ownsItem || inheritedManager || grants.some(row => row.user_id === actor.uid && row.access_level === "editor");
  return {
    visible,
    canEdit: visible && canEdit,
    canDelete: visible && (staff || ownsItem),
    reason: !visible ? "not_authorized" : "authorized",
  };
}

/**
 * Resolve an item and its folder chain using server-side metadata, then check
 * ownership, folder-manager inheritance and explicit grants before any Drive API call.
 * Never pass owner/role/access flags from the browser into this function.
 */
export async function resolveDriveItemAccess(actor, itemId, { require = "read" } = {}) {
  if (!actor?.uid || !actor?.role) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  if (typeof itemId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(itemId)) {
    throw Object.assign(new Error("ID item tidak valid."), { status: 400 });
  }

  const { data: item, error: itemError } = await adminSupabase
    .from("drive_items")
    .select("id,drive_file_id,parent_id,item_type,name,mime_type,size_bytes,owner_id,created_by,status,trashed_at")
    .eq("id", itemId)
    .maybeSingle();
  failIfError(itemError);
  if (!item) throw notFound();
  if (item.status !== "active" && require !== "trash") throw notFound();

  const ancestors = [];
  const seen = new Set([item.id]);
  let parentId = item.parent_id;
  while (parentId) {
    if (seen.has(parentId) || ancestors.length >= MAX_PARENT_DEPTH) {
      throw Object.assign(new Error("Struktur folder tidak valid atau terlalu dalam."), { status: 409 });
    }
    seen.add(parentId);
    const { data: parent, error } = await adminSupabase
      .from("drive_items")
      .select("id,parent_id,item_type,owner_id,status")
      .eq("id", parentId)
      .maybeSingle();
    failIfError(error);
    if (!parent || parent.item_type !== "folder" || parent.status !== "active") throw notFound();
    ancestors.push(parent);
    parentId = parent.parent_id;
  }

  // Manager permissions on ancestor folders are inherited by descendants.
  const folderIds = [item.id, ...ancestors.map(parent => parent.id)];
  const [inheritedManagers, inheritedGrants] = await Promise.all([
    adminSupabase.from("drive_folder_managers").select("folder_id,user_id").in("folder_id", folderIds).eq("user_id", actor.uid),
    adminSupabase.from("drive_item_grants").select("item_id,user_id,access_level").eq("item_id", item.id).eq("user_id", actor.uid),
  ]);
  failIfError(inheritedManagers.error);
  failIfError(inheritedGrants.error);

  const access = evaluateDriveItemAccess({
    actor,
    item,
    ancestors,
    managers: inheritedManagers.data || [],
    grants: inheritedGrants.data || [],
  });
  if (!access.visible) throw notFound();
  if (require === "edit" && !access.canEdit) throw forbidden();
  if (require === "delete" && !access.canDelete) throw forbidden("Kamu hanya dapat menghapus item milikmu sendiri. Pengelola kelas dapat menghapus item anggota lain.");
  if (require === "manager" && !(STAFF_ROLES.has(actor.role) || item.owner_id === actor.uid || (inheritedManagers.data || []).some(row => row.folder_id === item.id))) {
    throw forbidden("Hanya pemilik folder atau pengelola kelas yang dapat mengatur pengelola folder.");
  }
  return { item, ancestors, access };
}

export function isDriveStaff(role) {
  return STAFF_ROLES.has(role);
}
