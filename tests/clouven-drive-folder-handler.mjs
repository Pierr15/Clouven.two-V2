import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const handlerPath = path.join(root, "server/api-handlers/clouven-drive/folders.js");
let source = await readFile(handlerPath, "utf8");
source = source
  .replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "")
  .replace("export default async function handler", "async function handler")
  .concat("\n globalThis.__handler = handler;");

const actor = { uid: "student-a", role: "student" };
const stub = {
  adminSupabase: { from() { throw new Error("Database must not be reached in this test"); } },
  verifyRequest: async () => actor,
  resolveDriveItemAccess: async () => ({
    item: { id: "11111111-1111-4111-8111-111111111111", item_type: "folder", drive_file_id: "drive-parent" },
    access: { canEdit: false },
  }),
  getDriveAccessToken: async () => { throw new Error("Google Drive must not be reached in this test"); },
  createDriveFolderForOperation: async () => { throw new Error("Google Drive must not be reached in this test"); },
  findFolderByOperationKey: async () => { throw new Error("Google Drive must not be reached in this test"); },
};
const context = vm.createContext({
  ...stub,
  process: { env: { GOOGLE_DRIVE_ROOT_FOLDER_ID: "test-root" } },
  console,
  Object,
  String,
  Date,
  Error,
});
vm.runInContext(source, context, { filename: handlerPath });
const handler = context.__handler;

function response() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
const key = "11111111-1111-4111-8111-111111111111";

{
  const res = response();
  await handler({ method: "GET", headers: {}, body: {} }, res);
  assert.equal(res.statusCode, 405, "non-POST requests must be rejected");
}
{
  const res = response();
  await handler({ method: "POST", headers: { "idempotency-key": key }, body: { name: " .. " } }, res);
  assert.equal(res.statusCode, 400, "blank/invalid folder names must be rejected");
  assert.equal(res.body.code, "INVALID_FOLDER_NAME");
}
{
  const res = response();
  await handler({ method: "POST", headers: { "idempotency-key": key }, body: { name: "Folder", owner_id: "attacker" } }, res);
  assert.equal(res.statusCode, 400, "client-supplied ownership fields must be rejected");
  assert.equal(res.body.code, "CLIENT_TRUSTED_FIELD_REJECTED");
}
{
  const res = response();
  await handler({
    method: "POST",
    headers: { "idempotency-key": key },
    body: { name: "Nested", parentId: "22222222-2222-4222-8222-222222222222" },
  }, res);
  assert.equal(res.statusCode, 403, "creating a child in a non-editable parent must be denied");
  assert.equal(res.body.code, "PARENT_NOT_EDITABLE");
  assert.equal(res.headers["Cache-Control"], "private, no-store");
}
console.log("Clouven Drive folder handler guard tests passed (4 scenarios).");
