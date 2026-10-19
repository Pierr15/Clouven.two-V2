import assert from "node:assert/strict";
import {
  createFakeDb, createRequest, createResponse,
  ITEM_ID, OPERATION_KEY, PARENT_ID,
} from "./clouven-drive-handler-helpers.mjs";

Object.assign(process.env, { SUPABASE_URL: "https://local.invalid", SUPABASE_SECRET_KEY: "local-test-only" });
const { createItemsHandler } = await import("../server/api-handlers/clouven-drive/items.js");

const baseItem = {
  id: ITEM_ID,
  drive_file_id: "drive-file-1",
  parent_id: null,
  item_type: "file",
  name: "Catatan lama.txt",
  mime_type: "text/plain",
  size_bytes: 5,
  owner_id: "student-a",
  status: "active",
  trashed_at: null,
  created_at: "2026-10-19T00:00:00.000Z",
  updated_at: "2026-10-19T00:00:00.000Z",
};

function setup(overrides = {}) {
  const db = overrides.db || createFakeDb({ drive_items: [{ ...baseItem }], drive_operations: [] });
  const calls = { rename: [], move: [] };
  const deps = {
    db,
    authenticate: async () => ({ uid: "student-a", role: "student" }),
    resolveAccess: async (actor, id) => {
      if (id === ITEM_ID) {
        return { item: { ...baseItem }, ancestors: [], access: { visible: true, canEdit: true, canDelete: true, canManage: false } };
      }
      return {
        item: { id: PARENT_ID, item_type: "folder", drive_file_id: "drive-parent", status: "active" },
        ancestors: overrides.destinationAncestors || [],
        access: { visible: true, canEdit: true, canDelete: false, canManage: false },
      };
    },
    listItems: async () => ({ items: [], page: 1, pageSize: 25, hasMore: false, truncated: false }),
    listTrash: async () => ({ items: [{ ...baseItem, status: "trashed" }], page: 1, pageSize: 25, hasMore: false, truncated: false }),
    getToken: async () => "drive-token",
    renameItem: async args => { calls.rename.push(args); return { id: args.driveFileId, name: args.name }; },
    moveItem: async args => { calls.move.push(args); return { id: args.driveFileId, parents: [args.newParentDriveId] }; },
    env: { GOOGLE_DRIVE_ROOT_FOLDER_ID: "drive-root" },
    ...overrides,
  };
  return { db, calls, handler: createItemsHandler(deps) };
}

function patchRequest(body) {
  return createRequest({
    method: "PATCH",
    headers: { "idempotency-key": OPERATION_KEY, "content-type": "application/json" },
    body,
  });
}

{
  const { handler } = setup();
  const res = createResponse();
  await handler(createRequest({ method: "DELETE", headers: {} }), res);
  assert.equal(res.statusCode, 405);
}

{
  const { handler } = setup();
  const res = createResponse();
  await handler(createRequest({ method: "PATCH", headers: { "content-type": "application/json" }, body: { id: ITEM_ID, name: "Baru.txt" } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "IDEMPOTENCY_KEY_REQUIRED");
}

{
  const { handler } = setup({
    resolveAccess: async () => ({ item: { ...baseItem }, ancestors: [], access: { visible: true, canEdit: false } }),
  });
  const res = createResponse();
  await handler(patchRequest({ id: ITEM_ID, name: "Baru.txt" }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "ITEM_NOT_EDITABLE", "viewers must not rename items");
}

{
  const { db, calls, handler } = setup();
  const res = createResponse();
  await handler(patchRequest({ id: ITEM_ID, name: "  Catatan   baru.txt  " }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.item.name, "Catatan baru.txt");
  assert.equal(calls.rename.length, 1, "rename must reach Google Drive");
  assert.equal(calls.rename[0].driveFileId, "drive-file-1");
  assert.equal(db.state.drive_items[0].name, "Catatan baru.txt");
  assert.equal(db.state.drive_operations[0].state, "succeeded");

  const replayed = createResponse();
  await handler(patchRequest({ id: ITEM_ID, name: "  Catatan   baru.txt  " }), replayed);
  assert.equal(replayed.statusCode, 200);
  assert.equal(replayed.body.replayed, true);
  assert.equal(calls.rename.length, 1, "replays must not repeat the Google mutation");
}

{
  const { handler } = setup({ destinationAncestors: [{ id: ITEM_ID }] });
  const res = createResponse();
  await handler(patchRequest({ id: ITEM_ID, parentId: PARENT_ID }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "MOVE_INTO_DESCENDANT", "folders must not move into themselves");
}

{
  const { db, calls, handler } = setup();
  const res = createResponse();
  await handler(patchRequest({ id: ITEM_ID, parentId: PARENT_ID }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.move[0].oldParentDriveId, "drive-root");
  assert.equal(calls.move[0].newParentDriveId, "drive-parent");
  assert.equal(db.state.drive_items[0].parent_id, PARENT_ID);
}

{
  const { handler } = setup();
  const res = createResponse();
  await handler(createRequest({ method: "GET", headers: {}, query: { view: "trash" } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.view, "trash");
  assert.equal(res.body.items[0].status, "trashed", "trash view must delegate to the trash listing");
}

console.log("Clouven Drive items handler tests passed (7 scenarios).");
