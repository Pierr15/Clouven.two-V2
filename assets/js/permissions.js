const signed = ["student", "class_officer", "teacher", "developer"];
const managers = ["class_officer", "teacher", "developer"];
const teachers = ["teacher", "developer"];
const developer = ["developer"];
const owner = ["owner"];
const ownerOnly = new Set(["owner_console", "transfer_owner", "view_owner_audit", "manage_owner_settings"]);
const everyone = ["guest", ...signed];
export const ACCESS = Object.freeze({
  home: everyone, schedule: everyone, apel: everyone, tools: everyone, theme: everyone,
  calendar: signed, edit_calendar: managers,
  task_summary: signed, tasks: signed, own_progress: signed,
  files: signed, own_account: signed, edit_instagram: signed, members: signed,
  view_member_photos: everyone, manage_own_photo: signed, manage_member_photos: developer,
  upload: managers, manage_files: managers,
  view_progress: managers, edit_progress: teachers, edit_self: teachers,
  manage_class: managers, edit_class: managers, edit_schedule: managers,
  edit_apel: managers, edit_tasks: managers, admin: developer,
  create_user: developer, change_role: developer, edit_user: developer,
  delete_user: developer, reset_password: developer, customize_name: developer,
  owner_console: owner, transfer_owner: owner, view_owner_audit: owner, manage_owner_settings: owner,
});
// Owner inherits all declared application permissions; a developer cannot use owner-only tools.
export function can(role, permission) {
  if (!(permission in ACCESS)) return false;
  if (role === "owner") return true;
  if (ownerOnly.has(permission)) return false;
  return role === "developer" || ACCESS[permission].includes(role);
}
