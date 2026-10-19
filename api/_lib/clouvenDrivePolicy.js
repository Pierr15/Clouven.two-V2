/**
 * Staff-level Drive access: can open, create, edit, and delete every member's
 * Drive items, regardless of who owns them. Owner is included so the elevated
 * account can access and manage folder/file in each member's Drive.
 */
const STAFF_ROLES = new Set(["class_officer", "teacher", "developer", "owner"]);
export function evaluateDriveItemAccess({ actor, item, ancestors = [], managers = [], grants = [] }) {
  if (!actor?.uid || !actor?.role || !item) {
    return { visible: false, canEdit: false, canDelete: false, canManage: false, reason: "missing_context" };
  }
  const staff = STAFF_ROLES.has(actor.role);
  const ownsItem = item.owner_id === actor.uid;
  const directlyManagesFolder = item.item_type === "folder" &&
    managers.some(row => row.user_id === actor.uid && row.folder_id === item.id);
  const inheritedManager = managers.some(row => row.user_id === actor.uid) ||
    ancestors.some(parent => parent.owner_id === actor.uid);
  const grant = grants.find(row => row.user_id === actor.uid && ["viewer", "editor"].includes(row.access_level));
  const visible = staff || ownsItem || Boolean(grant) || inheritedManager;
  const canEdit = staff || ownsItem || inheritedManager || grant?.access_level === "editor";
  const canDelete = staff || ownsItem;
  const canManage = staff || directlyManagesFolder || ownsItem;
  return {
    visible,
    canEdit: visible && canEdit,
    canDelete: visible && canDelete,
    canManage: visible && canManage,
    reason: !visible ? "not_authorized" : "authorized",
  };
}

export function isDriveStaff(role) {
  return STAFF_ROLES.has(role);
}
