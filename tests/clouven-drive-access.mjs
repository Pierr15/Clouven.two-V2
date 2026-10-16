import assert from "node:assert/strict";
import { evaluateDriveItemAccess } from "../api/_lib/clouvenDrivePolicy.js";

const actor = { uid: "student-a", role: "student" };
const ownItem = { id: "item-1", owner_id: "student-a" };
const anotherItem = { id: "item-2", owner_id: "student-b" };

assert.deepEqual(
  evaluateDriveItemAccess({ actor, item: ownItem }),
  { visible: true, canEdit: true, canDelete: true, reason: "authorized" },
  "owners can view, edit and delete their own items",
);

assert.deepEqual(
  evaluateDriveItemAccess({ actor, item: anotherItem }),
  { visible: false, canEdit: false, canDelete: false, reason: "not_authorized" },
  "students cannot see another student's private item",
);

assert.deepEqual(
  evaluateDriveItemAccess({
    actor,
    item: anotherItem,
    grants: [{ item_id: "item-2", user_id: "student-a", access_level: "viewer" }],
  }),
  { visible: true, canEdit: false, canDelete: false, reason: "authorized" },
  "a viewer grant permits read-only visibility",
);

assert.deepEqual(
  evaluateDriveItemAccess({
    actor,
    item: anotherItem,
    grants: [{ item_id: "item-2", user_id: "student-a", access_level: "editor" }],
  }),
  { visible: true, canEdit: true, canDelete: false, reason: "authorized" },
  "an editor grant permits editing but not deletion of another owner's item",
);

assert.deepEqual(
  evaluateDriveItemAccess({
    actor: { uid: "officer", role: "class_officer" },
    item: anotherItem,
  }),
  { visible: true, canEdit: true, canDelete: true, reason: "authorized" },
  "class officers can manage class items",
);

assert.deepEqual(
  evaluateDriveItemAccess({
    actor,
    item: anotherItem,
    ancestors: [{ id: "folder-1", owner_id: "student-a" }],
  }),
  { visible: true, canEdit: true, canDelete: false, reason: "authorized" },
  "folder ownership grants inherited access to descendants without granting deletion",
);

console.log("Clouven Drive access policy tests passed.");
