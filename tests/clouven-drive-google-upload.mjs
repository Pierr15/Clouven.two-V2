import assert from "node:assert/strict";
import { uploadDriveFileForOperation } from "../api/_lib/clouvenDriveGoogle.js";

const calls = [];
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  if (String(url).includes("/files?q=")) return Response.json({ files: [] });
  const body = options.body;
  const contentType = options.headers["Content-Type"];
  const boundary = /boundary=([^;]+)/.exec(contentType)?.[1];
  assert.ok(boundary, "multipart boundary exists");
  const raw = Buffer.from(body);
  assert.ok(raw.includes(Buffer.from("hello test bytes")), "binary payload is preserved");
  assert.ok(raw.includes(Buffer.from('"clouvenOperationKey":"123e4567-e89b-42d3-a456-426614174000"')), "operation key is stored in appProperties");
  return Response.json({
    id: "drive_file_123",
    name: "hello.txt",
    mimeType: "text/plain",
    size: "16",
    parents: ["root_folder_123"],
    appProperties: { clouvenOperationKey: "123e4567-e89b-42d3-a456-426614174000" },
  });
};

const result = await uploadDriveFileForOperation({
  token: "fake-token",
  operationKey: "123e4567-e89b-42d3-a456-426614174000",
  name: "hello.txt",
  mimeType: "text/plain",
  parentDriveId: "root_folder_123",
  bytes: Buffer.from("hello test bytes"),
});
assert.equal(result.id, "drive_file_123");
assert.equal(calls.length, 2, "operation lookup precedes upload");
assert.match(calls[1].url, /uploadType=multipart/);
assert.equal(calls[1].options.headers.Authorization, "Bearer fake-token");

await assert.rejects(() => uploadDriveFileForOperation({
  token: "fake-token",
  operationKey: "123e4567-e89b-42d3-a456-426614174000",
  name: "too-big.bin",
  mimeType: "application/octet-stream",
  parentDriveId: "root_folder_123",
  bytes: Buffer.alloc(3 * 1024 * 1024 + 1),
}), error => error.status === 413 && error.code === "FILE_TOO_LARGE");

console.log("Clouven Drive Google upload helper tests passed (6 assertions).");
