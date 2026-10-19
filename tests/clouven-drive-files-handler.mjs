import assert from "node:assert/strict";
import { createFakeDb, createResponse, createRequest, OPERATION_KEY, PARENT_ID } from "./clouven-drive-handler-helpers.mjs";

Object.assign(process.env, { SUPABASE_URL: "https://local.invalid", SUPABASE_SECRET_KEY: "local-test-only" });
const { createFilesHandler } = await import("../server/api-handlers/clouven-drive/files.js");

const bytes = Buffer.from("hello world");

function setup(overrides = {}) {
  const db = overrides.db || createFakeDb({ drive_items: [], drive_operations: [] });
  const deps = {
    db,
    authenticate: async () => ({ uid: "student-a", role: "student" }),
    resolveAccess: async () => ({
      item: { id: PARENT_ID, item_type: "folder", drive_file_id: "drive-parent" },
      access: { visible: true, canEdit: true, canDelete: true, canManage: true },
    }),
    getToken: async () => "drive-token",
    uploadFile: async ({ name, mimeType, bytes: body }) => ({
      id: "drive-file-1", name, mimeType, size: String(body.length),
    }),
    findFile: async () => null,
    readBody: async () => bytes,
    env: { GOOGLE_DRIVE_ROOT_FOLDER_ID: "drive-root" },
    ...overrides,
  };
  return { db, handler: createFilesHandler(deps) };
}

function uploadRequest(overrides = {}) {
  return createRequest({
    method: "POST",
    headers: {
      "idempotency-key": OPERATION_KEY,
      "x-file-name": encodeURIComponent("Catatan.txt"),
      "x-parent-id": PARENT_ID,
      "content-type": "text/plain",
      ...overrides.headers,
    },
  });
}

{
  const { handler } = setup();
  const res = createResponse();
  await handler(createRequest({ method: "GET", headers: {} }), res);
  assert.equal(res.statusCode, 405, "non-POST upload requests must be rejected");
}

{
  const { handler } = setup();
  const res = createResponse();
  await handler(createRequest({ method: "POST", headers: { "x-file-name": "a.txt", "content-type": "text/plain" } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "IDEMPOTENCY_KEY_REQUIRED");
}

{
  const { handler } = setup();
  const res = createResponse();
  await handler(uploadRequest({ headers: { "x-file-name": "%2E%2E" } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "INVALID_FILE_NAME", "path-like names must be rejected");
}

{
  const { handler } = setup({ readBody: async () => Buffer.alloc(0) });
  const res = createResponse();
  await handler(uploadRequest(), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "INVALID_FILE_SIZE", "empty files must be rejected");
}

{
  const { handler } = setup({
    resolveAccess: async () => ({
      item: { id: PARENT_ID, item_type: "folder", drive_file_id: "drive-parent" },
      access: { visible: true, canEdit: false, canDelete: false, canManage: false },
    }),
  });
  const res = createResponse();
  await handler(uploadRequest(), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "PARENT_NOT_EDITABLE", "upload into a non-editable folder must be denied");
}

{
  const { db, handler } = setup();
  const res = createResponse();
  await handler(uploadRequest(), res);
  assert.equal(res.statusCode, 201, "valid upload must succeed");
  assert.equal(res.body.ok, true);
  assert.equal(res.body.item.status, "active");
  assert.equal(res.body.item.drive_file_id, "drive-file-1");
  assert.equal(res.body.item.size_bytes, bytes.length);
  assert.equal(db.state.drive_items.length, 1);
  assert.equal(db.state.drive_operations[0].state, "succeeded");

  const replayed = createResponse();
  await handler(uploadRequest(), replayed);
  assert.equal(replayed.statusCode, 200);
  assert.equal(replayed.body.replayed, true, "same key and payload must replay the stored item");

  const mismatched = createResponse();
  await handler(uploadRequest({ headers: { "x-file-name": encodeURIComponent("Lain.txt") } }), mismatched);
  assert.equal(mismatched.statusCode, 409);
  assert.equal(mismatched.body.code, "IDEMPOTENCY_PAYLOAD_CONFLICT", "same key with different bytes/name must be rejected");
}

{
  const { handler } = setup({
    readBody: async () => {
      throw Object.assign(new Error("File terlalu besar. Maksimal 3 MiB."), { status: 413, code: "FILE_TOO_LARGE" });
    },
  });
  const res = createResponse();
  await handler(uploadRequest(), res);
  assert.equal(res.statusCode, 413, "raw body overflow must surface as 413");
  assert.equal(res.body.code, "FILE_TOO_LARGE");
}

{
  const db = createFakeDb({ drive_items: [], drive_operations: [] });
  const { handler: failing } = setup({
    db,
    uploadFile: async () => { throw new Error("Google upload failed"); },
  });
  const first = createResponse();
  await failing(uploadRequest(), first);
  assert.equal(first.statusCode, 500);
  assert.equal(db.state.drive_operations[0].state, "needs_reconciliation");

  const { handler: recovering } = setup({
    db,
    findFile: async () => ({ id: "drive-file-1", name: "Catatan.txt", mimeType: "text/plain", size: String(bytes.length) }),
  });
  const second = createResponse();
  await recovering(uploadRequest(), second);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.reconciled, true, "an interrupted upload must reconcile the existing Drive file");
  assert.equal(db.state.drive_items[0].status, "active");
  assert.equal(db.state.drive_operations[0].state, "succeeded");
}

{
  const db = createFakeDb({ drive_items: [], drive_operations: [] });
  db.from = () => ({
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: null, error: { code: "SIMULATED_DB_OUTAGE" } }; },
  });
  const { handler } = setup({ db });
  const res = createResponse();
  await handler(uploadRequest(), res);
  assert.equal(res.statusCode, 503, "metadata outages must fail closed");
  assert.equal(res.body.code, "DRIVE_METADATA_UNAVAILABLE");
}

console.log("Clouven Drive upload handler tests passed (11 scenarios).");
