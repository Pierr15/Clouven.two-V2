const STAFF_ROLES = new Set(["class_officer", "teacher", "developer", "owner"]);

/**
 * Pure authorization policy. Keep this module free of database/client imports
 * so unit tests can run without environment secrets or a live Supabase project.
 */
export function evaluateDriveItemAccess({ actor, item, ancestors = [], managers = [], grants = [] }) {
  if (!actor?.uid || !actor?.role || !item) {
    return { visible: false, canEdit: false, canDelete: false, reason: "missing_context" };
  }
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

export function isDriveStaff(role) {
  return STAFF_ROLES.has(role);
}
