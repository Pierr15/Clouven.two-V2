import assert from "node:assert/strict";
import {
  createFakeDb, createRequest, createResponse,
  ITEM_ID, MEMBER_ID, OPERATION_KEY, PARENT_ID,
} from "./clouven-drive-handler-helpers.mjs";

Object.assign(process.env, { SUPABASE_URL: "https://local.invalid", SUPABASE_SECRET_KEY: "local-test-only" });
const { createPermissionsHandler } = await import("../server/api-handlers/clouven-drive/permissions.js");

function setup(overrides = {}) {
  const db = overrides.db || createFakeDb({
    drive_item_grants: [],
    drive_folder_managers: [],
    drive_operations: [],
    members: [{ id: MEMBER_ID, name: "Teman", username: "teman", role: "student" }],
  });
  return createPermissionsHandler({
    db,
    authenticate: async () => ({ uid: "student-a", role: "student" }),
    resolveAccess: async () => ({
      item: { id: ITEM_ID, item_type: overrides.itemType || "folder", owner_id: "student-a" },
      access: overrides.access || { visible: true, canEdit: true, canDelete: true, canManage: true },
    }),
    ...overrides.deps,
  });
}

function postRequest(body) {
  return createRequest({
    method: "POST",
    headers: { "idempotency-key": OPERATION_KEY, "content-type": "application/json" },
    body,
  });
}

{
  const res = createResponse();
  await setup({ deps: { authenticate: async () => ({ uid: MEMBER_ID, role: "student" }) } })(
    postRequest({ itemId: ITEM_ID, userId: MEMBER_ID, access: "viewer" }), res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "SELF_GRANT_REJECTED");
}

{
  const res = createResponse();
  await setup({ access: { visible: true, canEdit: false, canDelete: false, canManage: false } })(
    postRequest({ itemId: ITEM_ID, userId: MEMBER_ID, access: "viewer" }), res,
  );
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "ITEM_NOT_MANAGEABLE", "non-managers must not change sharing");
}

{
  const db = createFakeDb({
    drive_item_grants: [],
    drive_folder_managers: [],
    drive_operations: [],
    members: [{ id: MEMBER_ID, role: "student" }],
  });
  const res = createResponse();
  await setup({ db })(postRequest({ itemId: ITEM_ID, userId: MEMBER_ID, access: "viewer" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(db.state.drive_item_grants.length, 1);
  assert.equal(db.state.drive_item_grants[0].access_level, "viewer");
  assert.equal(db.state.drive_operations[0].state, "succeeded");

  const upgraded = createResponse();
  const upgradeKey = "66666666-6666-4666-8666-666666666666";
  await setup({ db })(createRequest({
    method: "POST",
    headers: { "idempotency-key": upgradeKey, "content-type": "application/json" },
    body: { itemId: ITEM_ID, userId: MEMBER_ID, access: "editor" },
  }), upgraded);
  assert.equal(upgraded.statusCode, 200);
  assert.equal(db.state.drive_item_grants.length, 1, "share upgrades must not duplicate rows");
  assert.equal(db.state.drive_item_grants[0].access_level, "editor");
}

{
  const res = createResponse();
  await setup({ itemType: "file" })(postRequest({ itemId: ITEM_ID, userId: MEMBER_ID, access: "manager" }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "MANAGER_REQUIRES_FOLDER");
}

{
  const db = createFakeDb({
    drive_item_grants: [],
    drive_folder_managers: [],
    drive_operations: [],
    members: [{ id: MEMBER_ID, role: "student" }],
  });
  const res = createResponse();
  await setup({ db })(postRequest({ itemId: ITEM_ID, userId: MEMBER_ID, access: "manager" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(db.state.drive_folder_managers.length, 1);
  assert.equal(db.state.drive_folder_managers[0].folder_id, ITEM_ID);
}

{
  const db = createFakeDb({
    drive_item_grants: [{ item_id: ITEM_ID, user_id: MEMBER_ID, access_level: "viewer" }],
    drive_folder_managers: [],
    drive_operations: [],
  });
  const res = createResponse();
  await setup({ db })(createRequest({
    method: "DELETE",
    headers: { "idempotency-key": OPERATION_KEY },
    query: { itemId: ITEM_ID, userId: MEMBER_ID, access: "viewer" },
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(db.state.drive_item_grants.length, 0);
}

{
  const db = createFakeDb({
    drive_item_grants: [{ item_id: ITEM_ID, user_id: MEMBER_ID, access_level: "editor" }],
    drive_folder_managers: [{ folder_id: ITEM_ID, user_id: PARENT_ID }],
    drive_operations: [],
  });
  const res = createResponse();
  await setup({ db })(createRequest({ method: "GET", headers: {}, query: { itemId: ITEM_ID } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.grants.length, 1);
  assert.equal(res.body.managers.length, 1);
}

console.log("Clouven Drive permissions handler tests passed (7 scenarios).");
