import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { MAX_DRIVE_UPLOAD_BYTES, readRawBodyWithLimit, validateDriveUpload } from "../api/_lib/clouvenDriveUpload.js";

assert.equal(MAX_DRIVE_UPLOAD_BYTES, 3 * 1024 * 1024);
assert.deepEqual(validateDriveUpload({ name: "  laporan   kelas.pdf ", mimeType: "Application/PDF", sizeBytes: 12 }), {
  name: "laporan kelas.pdf", mimeType: "application/pdf", sizeBytes: 12,
});
for (const input of [
  { name: "", mimeType: "text/plain", sizeBytes: 1 },
  { name: "../secret", mimeType: "text/plain", sizeBytes: 1 },
  { name: "x", mimeType: "", sizeBytes: 1 },
  { name: "x", mimeType: "text/plain", sizeBytes: 0 },
]) assert.throws(() => validateDriveUpload(input), error => error.status === 400);
assert.throws(() => validateDriveUpload({ name: "big.bin", mimeType: "application/octet-stream", sizeBytes: MAX_DRIVE_UPLOAD_BYTES + 1 }), error => error.status === 413 && error.code === "FILE_TOO_LARGE");

function fakeRequest(chunks) {
  const req = new EventEmitter();
  req.pause = () => { req.paused = true; };
  queueMicrotask(() => {
    for (const chunk of chunks) req.emit("data", Buffer.from(chunk));
    req.emit("end");
  });
  return req;
}
const accepted = await readRawBodyWithLimit(fakeRequest(["abc", "def"]), 6);
assert.equal(accepted.toString(), "abcdef");
await assert.rejects(readRawBodyWithLimit(fakeRequest(["1234", "5678"]), 6), error => error.status === 413 && error.code === "FILE_TOO_LARGE");
console.log("Clouven Drive upload validation tests passed (9 assertions).");
