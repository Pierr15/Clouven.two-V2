import assert from "node:assert/strict";
import { createResponse, ITEM_ID } from "./clouven-drive-handler-helpers.mjs";

Object.assign(process.env, { SUPABASE_URL: "https://local.invalid", SUPABASE_SECRET_KEY: "local-test-only" });
const { createDownloadHandler } = await import("../server/api-handlers/clouven-drive/download.js");

function setup(overrides = {}) {
  return createDownloadHandler({
    authenticate: async () => ({ uid: "student-a", role: "student" }),
    resolveAccess: async () => ({
      item: { id: ITEM_ID, item_type: "file", name: "Catatan kelas.txt", mime_type: "text/plain", drive_file_id: "drive-file-1" },
      access: { visible: true },
    }),
    getToken: async () => "drive-token",
    downloadBytes: async () => Buffer.from("hello"),
    ...overrides,
  });
}

{
  const res = createResponse();
  await setup()({ method: "POST", headers: {} }, res);
  assert.equal(res.statusCode, 405);
}

{
  const res = createResponse();
  await setup()({ method: "GET", headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 400, "missing itemId must be rejected");
  assert.equal(res.body.code, "ITEM_ID_REQUIRED");
}

{
  const res = createResponse();
  await setup({
    resolveAccess: async () => { throw Object.assign(new Error("Item tidak ditemukan."), { status: 404 }); },
  })({ method: "GET", headers: {}, query: { itemId: ITEM_ID } }, res);
  assert.equal(res.statusCode, 404, "inaccessible items must not leak existence");
}

{
  const res = createResponse();
  await setup({
    resolveAccess: async () => ({
      item: { id: ITEM_ID, item_type: "folder", name: "Folder", mime_type: "application/vnd.google-apps.folder" },
      access: { visible: true },
    }),
  })({ method: "GET", headers: {}, query: { itemId: ITEM_ID } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "ITEM_NOT_DOWNLOADABLE");
}

{
  const res = createResponse();
  await setup()({ method: "GET", headers: {}, query: { itemId: ITEM_ID } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.sent.toString(), "hello");
  assert.equal(res.headers["Content-Type"], "text/plain");
  assert.match(res.headers["Content-Disposition"], /^attachment; filename="Catatan kelas.txt"/);
  assert.match(res.headers["Content-Disposition"], /filename\*=UTF-8''Catatan%20kelas\.txt$/);
  assert.equal(JSON.stringify(res.headers).includes("drive-token"), false, "Google token must never leave the server");
}

{
  const res = createResponse();
  await setup({
    downloadBytes: async () => { throw Object.assign(new Error("File tidak ditemukan di Google Drive."), { status: 404, code: "GOOGLE_FILE_NOT_FOUND" }); },
  })({ method: "GET", headers: {}, query: { itemId: ITEM_ID } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, "GOOGLE_FILE_NOT_FOUND");
}

console.log("Clouven Drive download handler tests passed (6 scenarios).");
