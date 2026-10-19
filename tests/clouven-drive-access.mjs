import assert from "node:assert/strict";
import { evaluateDriveItemAccess } from "../api/_lib/clouvenDrivePolicy.js";

const student = { uid: "student-a", role: "student" };
const ownFile = { id: "item-1", item_type: "file", owner_id: "student-a" };
const ownFolder = { id: "folder-own", item_type: "folder", owner_id: "student-a" };
const anotherFile = { id: "item-2", item_type: "file", owner_id: "student-b" };

assert.deepEqual(evaluateDriveItemAccess({ actor: student, item: ownFile }), {
  visible: true, canEdit: true, canDelete: true, canManage: true, reason: "authorized",
});
assert.deepEqual(evaluateDriveItemAccess({ actor: student, item: anotherFile }), {
  visible: false, canEdit: false, canDelete: false, canManage: false, reason: "not_authorized",
});
assert.deepEqual(evaluateDriveItemAccess({ actor: student, item: ownFolder }), {
  visible: true, canEdit: true, canDelete: true, canManage: true, reason: "authorized",
});
assert.deepEqual(evaluateDriveItemAccess({
  actor: student, item: anotherFile,
  grants: [{ item_id: "item-2", user_id: "student-a", access_level: "viewer" }],
}), {
  visible: true, canEdit: false, canDelete: false, canManage: false, reason: "authorized",
});
assert.deepEqual(evaluateDriveItemAccess({
  actor: student, item: anotherFile,
  grants: [{ item_id: "item-2", user_id: "student-a", access_level: "editor" }],
}), {
  visible: true, canEdit: true, canDelete: false, canManage: false, reason: "authorized",
});
assert.deepEqual(evaluateDriveItemAccess({
  actor: { uid: "officer", role: "class_officer" }, item: anotherFile,
}), {
  visible: true, canEdit: true, canDelete: true, canManage: true, reason: "authorized",
});
assert.deepEqual(evaluateDriveItemAccess({
  actor: student, item: anotherFile,
  ancestors: [{ id: "folder-1", item_type: "folder", owner_id: "student-a" }],
}), {
  visible: true, canEdit: true, canDelete: false, canManage: false, reason: "authorized",
});
assert.deepEqual(evaluateDriveItemAccess({
  actor: { uid: "owner-role", role: "owner" }, item: anotherFile,
}), {
  visible: true, canEdit: true, canDelete: true, canManage: true, reason: "authorized",
});
assert.deepEqual(evaluateDriveItemAccess({
  actor: { uid: "teacher-role", role: "teacher" }, item: anotherFile,
}), {
  visible: true, canEdit: true, canDelete: true, canManage: true, reason: "authorized",
});
assert.deepEqual(evaluateDriveItemAccess({
  actor: student, item: { id: "folder-1", item_type: "folder", owner_id: "student-b" },
  managers: [{ folder_id: "folder-1", user_id: "student-a" }],
}), {
  visible: true, canEdit: true, canDelete: false, canManage: true, reason: "authorized",
});
console.log("Clouven Drive access policy tests passed (10 assertions).");
