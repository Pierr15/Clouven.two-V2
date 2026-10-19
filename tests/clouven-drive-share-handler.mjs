import assert from "node:assert/strict";
import { createFakeDb, createRequest, createResponse, ITEM_ID, OPERATION_KEY } from "./clouven-drive-handler-helpers.mjs";

Object.assign(process.env, { SUPABASE_URL: "https://local.invalid", SUPABASE_SECRET_KEY: "local-test-only" });
const { createShareHandler } = await import("../server/api-handlers/clouven-drive/share.js");

function setup(overrides = {}) {
  const db = overrides.db || createFakeDb({ drive_operations: [] });
  const calls = { created: [], removed: [] };
  return {
    db,
    calls,
    handler: createShareHandler({
      db,
      authenticate: async () => ({ uid: "student-a", role: "student" }),
      resolveAccess: async () => ({
        item: { id: ITEM_ID, item_type: "file", drive_file_id: "drive-file-1" },
        access: overrides.access || { visible: true, canEdit: true, canDelete: true, canManage: true },
      }),
      getToken: async () => "drive-token",
      createPermission: async args => {
        calls.created.push(args);
        return { id: "permission-1", type: "user", role: args.role, emailAddress: args.email };
      },
      listPermissions: async () => [],
      removePermission: async args => {
        calls.removed.push(args);
        return { id: args.permissionId, alreadyDeleted: false };
      },
      ...overrides.deps,
    }),
  };
}

function shareRequest(body) {
  return createRequest({
    method: "POST",
    headers: { "idempotency-key": OPERATION_KEY, "content-type": "application/json" },
    body,
  });
}

{
  const res = createResponse();
  await setup().handler(shareRequest({ itemId: ITEM_ID, email: "teman@example.com", role: "reader" }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "SHARE_CONFIRMATION_REQUIRED");
}

{
  const res = createResponse();
  await setup({ access: { visible: true, canManage: false } }).handler(
    shareRequest({ itemId: ITEM_ID, email: "teman@example.com", role: "reader", confirm: true }), res,
  );
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "ITEM_NOT_MANAGEABLE");
}

{
  const res = createResponse();
  await setup().handler(shareRequest({ itemId: ITEM_ID, email: "not-an-email", role: "reader", confirm: true }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "INVALID_EMAIL");
}

{
  const { db, calls, handler } = setup();
  const res = createResponse();
  await handler(shareRequest({ itemId: ITEM_ID, email: "Teman@Example.com", role: "writer", confirm: true }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(calls.created[0].email, "teman@example.com");
  assert.equal(calls.created[0].role, "writer");
  assert.equal(db.state.drive_operations[0].state, "succeeded");
  assert.equal(db.state.drive_operations[0].request_data.email, "teman@example.com");

  const replayed = createResponse();
  await handler(shareRequest({ itemId: ITEM_ID, email: "Teman@Example.com", role: "writer", confirm: true }), replayed);
  assert.equal(replayed.statusCode, 200);
  assert.equal(replayed.body.replayed, true);
  assert.equal(calls.created.length, 1, "replays must not create a second Google permission");
}

{
  const res = createResponse();
  await setup({ deps: { listPermissions: async () => [{ id: "p1", role: "reader", emailAddress: "teman@example.com" }] } }).handler(
    createRequest({ method: "GET", headers: {}, query: { itemId: ITEM_ID } }), res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.permissions.length, 1);
}

{
  const { db, calls, handler } = setup();
  const res = createResponse();
  await handler(createRequest({
    method: "DELETE",
    headers: { "idempotency-key": OPERATION_KEY },
    query: { itemId: ITEM_ID, permissionId: "permission-1" },
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.removed[0].permissionId, "permission-1");
  assert.equal(db.state.drive_operations[0].state, "succeeded");
}

console.log("Clouven Drive share handler tests passed (6 scenarios).");
