import assert from "node:assert/strict";
import { createDriveFolderForOperation, findFolderByOperationKey } from "../api/_lib/clouvenDriveGoogle.js";

const calls = [];
let existing = null;
let failNextRequest = false;
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
  if (failNextRequest) {
    failNextRequest = false;
    return Response.json({ error: { message: "simulated outage", status: "UNAVAILABLE" } }, { status: 503 });
  }
  if ((options.method || "GET") === "GET") {
    return Response.json({ files: existing ? [existing] : [] });
  }
  const body = JSON.parse(options.body);
  existing = {
    id: "drive-folder-123",
    name: body.name,
    mimeType: body.mimeType,
    parents: body.parents,
    appProperties: body.appProperties,
  };
  return Response.json(existing, { status: 200 });
};

const token = "test-access-token";
const operationKey = "11111111-1111-4111-8111-111111111111";
const first = await createDriveFolderForOperation({
  token, operationKey, name: "Dokumentasi", parentDriveId: "root-folder",
});
assert.equal(first.id, "drive-folder-123");
assert.equal(first.appProperties.clouvenOperationKey, operationKey);
assert.equal(calls.filter(call => call.method === "POST").length, 1);

const replay = await createDriveFolderForOperation({
  token, operationKey, name: "Dokumentasi", parentDriveId: "root-folder",
});
assert.equal(replay.id, first.id);
assert.equal(calls.filter(call => call.method === "POST").length, 1,
  "repeating the same operation key must reuse the Drive folder instead of creating a duplicate");

assert.equal((await findFolderByOperationKey(token, operationKey)).id, first.id);
console.log("Clouven Drive folder Google helper tests passed (4 assertions).");
