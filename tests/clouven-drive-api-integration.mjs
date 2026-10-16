import assert from "node:assert/strict";
import { createDriveAccessService } from "../api/_lib/clouvenDriveService.js";

function client(rows) {
  return {
    from(table) {
      const filters = [];
      let range = null;
      const q = {
        select() { return this; },
        eq(k, v) { filters.push(x => x[k] === v); return this; },
        is(k, v) { filters.push(x => x[k] === v); return this; },
        in(k, values) { filters.push(x => values.includes(x[k])); return this; },
        ilike(k, pattern) {
          const term = pattern.slice(1, -1).toLowerCase();
          filters.push(x => String(x[k] || "").toLowerCase().includes(term));
          return this;
        },
        order() { return this; },
        range(a, b) { range = [a, b]; return this; },
        async maybeSingle() { return { data: (rows[table] || []).filter(x => filters.every(f => f(x)))[0] || null, error: null }; },
        then(resolve, reject) {
          let out = (rows[table] || []).filter(x => filters.every(f => f(x)));
          if (range) out = out.slice(range[0], range[1] + 1);
          return Promise.resolve({ data: out, error: null }).then(resolve, reject);
        }
      };
      return q;
    }
  };
}

const folderId = "11111111-1111-4111-8111-111111111111";
const fileId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const data = {
  drive_items: [
    { id: folderId, parent_id: null, item_type: "folder", name: "Folder A", owner_id: "alice", status: "active" },
    { id: fileId, parent_id: null, item_type: "file", name: "Notes", owner_id: "alice", status: "active" },
    { id: otherId, parent_id: null, item_type: "file", name: "Private notes", owner_id: "bob", status: "active" }
  ],
  drive_folder_managers: [],
  drive_item_grants: []
};
const service = createDriveAccessService(client(data));
const actor = { uid: "alice", role: "student" };

const list = await service.listVisibleDriveItems(actor);
assert.deepEqual(list.items.map(x => x.id), [folderId, fileId]);
assert.equal(JSON.stringify(list).includes("Private notes"), false);
assert.equal((await service.listVisibleDriveItems(actor, { query: "Private" })).items.length, 0);
await assert.rejects(() => service.listVisibleDriveItems(actor, { page: 11 }), e => e.status === 400);
await assert.rejects(() => service.listVisibleDriveItems(actor, { query: "Notes", page: 2 }), e => e.status === 400);
console.log("Clouven Drive API isolation tests passed (4 assertions).");
