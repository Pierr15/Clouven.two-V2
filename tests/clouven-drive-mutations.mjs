import assert from "node:assert/strict";
import { moveDriveItem, renameDriveItem, setDriveItemTrashed } from "../api/_lib/clouvenDriveMutations.js";

const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), options });
  const id = decodeURIComponent(String(url).split("/files/")[1].split("?")[0]);
  return Response.json({ id, name: "test.pdf", parents: ["new_parent"], trashed: true });
};
const renamed = await renameDriveItem({ token: "test-token", driveFileId: "file_12345", name: "  laporan   akhir.pdf " });
assert.equal(renamed.id, "file_12345");
assert.equal(JSON.parse(calls.at(-1).options.body).name, "laporan akhir.pdf");
const moved = await moveDriveItem({ token: "test-token", driveFileId: "file_12345", oldParentDriveId: "old_parent", newParentDriveId: "new_parent" });
assert.equal(moved.id, "file_12345");
assert.match(calls.at(-1).url, /addParents=new_parent/);
assert.match(calls.at(-1).url, /removeParents=old_parent/);
await setDriveItemTrashed({ token: "test-token", driveFileId: "file_12345", trashed: true });
assert.equal(JSON.parse(calls.at(-1).options.body).trashed, true);
await assert.rejects(() => renameDriveItem({ token: "test-token", driveFileId: "file_12345", name: "../bad" }), e => e.code === "INVALID_ITEM_NAME");
await assert.rejects(() => moveDriveItem({ token: "test-token", driveFileId: "file_12345", oldParentDriveId: "same_parent", newParentDriveId: "same_parent" }), e => e.code === "SAME_PARENT");
await assert.rejects(() => setDriveItemTrashed({ token: "test-token", driveFileId: "file_12345", trashed: "true" }), e => e.code === "INVALID_TRASH_STATE");
console.log("Clouven Drive mutation helper tests passed (7 assertions).");
