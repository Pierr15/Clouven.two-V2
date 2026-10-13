import assert from "node:assert/strict";
import { ACCESS, can } from "../assets/js/permissions.js";

const registeredRoles = ["student", "class_officer", "teacher", "developer"];
const allRoles = ["guest", ...registeredRoles];

for (const permission of Object.keys(ACCESS)) {
  assert.equal(can("developer", permission), true, `Developer must retain ${permission}`);
}
assert.equal(can("developer", "permission-that-does-not-exist"), false, "Unknown permissions must fail closed");

assert.equal(can("guest", "view_member_photos"), true, "Guest can view public profile photos");
assert.equal(can("guest", "members"), true, "Guest can open the public member directory");
assert.equal(can("guest", "manage_own_photo"), false, "Guest cannot upload or remove a profile photo");
assert.equal(can("guest", "manage_member_photos"), false, "Guest cannot manage other members' photos");

for (const role of registeredRoles) {
  assert.equal(can(role, "manage_own_photo"), true, `${role} can manage their own photo`);
}
for (const role of allRoles.filter((role) => role !== "developer")) {
  assert.equal(can(role, "manage_member_photos"), false, `${role} cannot manage other members' photos`);
}
assert.equal(can("developer", "manage_member_photos"), true, "Developer can manage every member's photo");

console.log("Profile photo access checks passed.");
