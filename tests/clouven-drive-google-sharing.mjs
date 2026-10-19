import assert from "node:assert/strict";
import {
  createDrivePermission,
  deleteDriveFile,
  deleteDrivePermission,
  downloadDriveFileBytes,
  listDrivePermissions,
} from "../api/_lib/clouvenDriveGoogle.js";

const calls = [];
let next = null;
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  if (next) return next(calls.at(-1));
  return Response.json({});
};

// Download uses alt=media and returns bytes without exposing the token.
next = () => new Response(Buffer.from("payload"), { status: 200 });
const bytes = await downloadDriveFileBytes({ token: "secret-token", driveFileId: "file_12345" });
assert.equal(bytes.toString(), "payload");
assert.match(calls.at(-1).url, /alt=media/);
assert.equal(calls.at(-1).options.headers.Authorization, "Bearer secret-token");

// A missing Google file maps to a 404 with a public-safe code.
next = () => Response.json({ error: { status: "NOT_FOUND" } }, { status: 404 });
await assert.rejects(
  () => downloadDriveFileBytes({ token: "t", driveFileId: "file_12345" }),
  error => error.status === 404 && error.code === "GOOGLE_FILE_NOT_FOUND",
);

// Permanent delete is idempotent: 404 means the file is already gone.
next = () => new Response(null, { status: 204 });
assert.deepEqual(await deleteDriveFile({ token: "t", driveFileId: "file_12345" }), { id: "file_12345", alreadyDeleted: false });
next = () => new Response(null, { status: 404 });
assert.deepEqual(await deleteDriveFile({ token: "t", driveFileId: "file_12345" }), { id: "file_12345", alreadyDeleted: true });

// External permissions send the expected payload and verify the response.
next = ({ url, options }) => {
  assert.match(url, /\/files\/file_12345\/permissions/);
  assert.match(url, /sendNotificationEmail=false/);
  const body = JSON.parse(options.body);
  return Response.json({ id: "permission-1", type: "user", role: body.role, emailAddress: body.emailAddress });
};
const permission = await createDrivePermission({ token: "t", driveFileId: "file_12345", email: "teman@example.com", role: "reader" });
assert.equal(permission.id, "permission-1");
assert.equal(permission.emailAddress, "teman@example.com");

// A mismatched Google response must be rejected, not trusted.
next = () => Response.json({ id: "permission-1", type: "user", role: "writer", emailAddress: "other@example.com" });
await assert.rejects(
  () => createDrivePermission({ token: "t", driveFileId: "file_12345", email: "teman@example.com", role: "reader" }),
  error => error.status === 502 && error.code === "GOOGLE_DRIVE_INVALID_RESPONSE",
);
await assert.rejects(
  () => createDrivePermission({ token: "t", driveFileId: "file_12345", email: "bad", role: "reader" }),
  error => error.code === "INVALID_EMAIL",
);
await assert.rejects(
  () => createDrivePermission({ token: "t", driveFileId: "file_12345", email: "teman@example.com", role: "owner" }),
  error => error.code === "INVALID_SHARE_ROLE",
);

// Listing tolerates an empty permissions array.
next = () => Response.json({ permissions: [{ id: "permission-1", role: "reader", emailAddress: "teman@example.com" }] });
const permissions = await listDrivePermissions({ token: "t", driveFileId: "file_12345" });
assert.equal(permissions.length, 1);

// Revoking is idempotent as well.
next = () => new Response(null, { status: 204 });
assert.deepEqual(
  await deleteDrivePermission({ token: "t", driveFileId: "file_12345", permissionId: "permission-1" }),
  { id: "permission-1", alreadyDeleted: false },
);
next = () => new Response(null, { status: 404 });
assert.deepEqual(
  await deleteDrivePermission({ token: "t", driveFileId: "file_12345", permissionId: "permission-1" }),
  { id: "permission-1", alreadyDeleted: true },
);

console.log("Clouven Drive Google sharing helper tests passed (12 assertions).");
