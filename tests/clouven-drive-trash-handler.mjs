import assert from "node:assert/strict";
import { createFakeDb, createRequest, createResponse, ITEM_ID, OPERATION_KEY, PARENT_ID } from "./clouven-drive-handler-helpers.mjs";

Object.assign(process.env, { SUPABASE_URL: "https://local.invalid", SUPABASE_SECRET_KEY: "local-test-only" });
const { createTrashHandler } = await import("../server/api-handlers/clouven-drive/trash.js");

function item(overrides = {}) {
  return {
    id: ITEM_ID,
    drive_file_id: "drive-file-1",
    parent_id: null,
    item_type: "file",
    name: "Catatan.txt",
    mime_type: "text/plain",
    size_bytes: 5,
    owner_id: "student-a",
    status: "active",
    trashed_at: null,
    ...overrides,
  };
}

function setup(overrides = {}) {
  const db = overrides.db || createFakeDb({ drive_items: [item(overrides.item)], drive_operations: [] });
  const calls = { trashed: [], deleted: [] };
  const deps = {
    db,
    authenticate: async () => ({ uid: "student-a", role: "student" }),
    resolveAccess: async () => ({
      item: item(overrides.item),
      ancestors: [],
      access: overrides.access || { visible: true, canEdit: true, canDelete: true, canManage: false },
    }),
    getToken: async () => "drive-token",
    setTrashed: async args => { calls.trashed.push(args); return { id: args.driveFileId, trashed: args.trashed }; },
    removeDriveFile: async args => { calls.deleted.push(args); return { id: args.driveFileId }; },
    env: { GOOGLE_DRIVE_ROOT_FOLDER_ID: "drive-root" },
    ...overrides,
  };
  return { db, calls, handler: createTrashHandler(deps) };
}

function trashRequest(body) {
  return createRequest({
    method: "POST",
    headers: { "idempotency-key": OPERATION_KEY, "content-type": "application/json" },
    body,
  });
}

{
  const { handler } = setup();
  const res = createResponse();
  await handler(trashRequest({ id: ITEM_ID, action: "destroy" }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "INVALID_TRASH_ACTION");
}

{
  const { handler } = setup({ access: { visible: true, canEdit: true, canDelete: false } });
  const res = createResponse();
  await handler(trashRequest({ id: ITEM_ID, action: "trash" }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "ITEM_NOT_DELETABLE", "editors without delete rights must be denied");
}

{
  const { db, calls, handler } = setup();
  const res = createResponse();
  await handler(trashRequest({ id: ITEM_ID, action: "trash" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.trashed[0].trashed, true);
  assert.equal(db.state.drive_items[0].status, "trashed");
  assert.ok(db.state.drive_items[0].trashed_at);
  assert.equal(db.state.drive_operations[0].state, "succeeded");
}

{
  const { db, calls, handler } = setup({ item: { status: "trashed", trashed_at: "2026-10-19T00:00:00.000Z" } });
  const res = createResponse();
  await handler(trashRequest({ id: ITEM_ID, action: "restore" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.trashed[0].trashed, false);
  assert.equal(db.state.drive_items[0].status, "active");
  assert.equal(db.state.drive_items[0].trashed_at, null);
}

{
  const { handler } = setup({ item: { status: "trashed" } });
  const res = createResponse();
  await handler(trashRequest({ id: ITEM_ID, action: "delete" }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "PERMANENT_DELETE_CONFIRMATION_REQUIRED");
}

{
  const { handler } = setup({
    item: { status: "trashed", owner_id: "student-b" },
    access: { visible: true, canEdit: false, canDelete: false },
  });
  const res = createResponse();
  await handler(trashRequest({ id: ITEM_ID, action: "delete", confirm: true }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "PERMANENT_DELETE_FORBIDDEN", "only the owner or Owner role may purge files");
}

{
  const { db, calls, handler } = setup({ item: { status: "trashed" } });
  const res = createResponse();
  await handler(trashRequest({ id: ITEM_ID, action: "delete", confirm: true }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.deleted[0].driveFileId, "drive-file-1");
  assert.equal(db.state.drive_items.length, 0, "permanent delete must remove metadata");
}

{
  const db = createFakeDb({
    drive_items: [item({ item_type: "folder", status: "trashed" }), item({ id: PARENT_ID, parent_id: ITEM_ID })],
    drive_operations: [],
  });
  const { handler } = setup({ db, item: { item_type: "folder", status: "trashed" } });
  const res = createResponse();
  await handler(trashRequest({ id: ITEM_ID, action: "delete", confirm: true }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "FOLDER_NOT_EMPTY");
}

console.log("Clouven Drive trash handler tests passed (8 scenarios).");
