// Browser regression for the Clouven Drive page. Requires Playwright and a local
// Edge/Chrome install; run with PLAYWRIGHT_MODULE pointing at the package when it
// is not installed in the repository:
//   $env:PLAYWRIGHT_MODULE="C:\path\to\node_modules\playwright"; node tests/ui-drive.cjs
// Set UI_BROWSER_CHANNEL=chrome to use Chrome instead of Edge.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "ui-test-results", "drive-" + Date.now());
fs.mkdirSync(out, { recursive: true });
const folderId = "11111111-1111-4111-8111-111111111111";
const fileId = "22222222-2222-4222-8222-222222222222";
const trashId = "33333333-3333-4333-8333-333333333333";

const server = http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404); return res.end();
  }
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
});

function item({ id, type = "file", name, parent = null, owner = "u1", size = 1234, perms = {} }) {
  return {
    id, drive_file_id: "drive-" + id, parent_id: parent, item_type: type, name,
    mime_type: type === "folder" ? "application/vnd.google-apps.folder" : "text/plain",
    size_bytes: type === "folder" ? 0 : size, owner_id: owner,
    status: "active", updated_at: "2026-10-18T10:00:00.000Z",
    permissions: { canEdit: true, canDelete: true, canManage: true, ...perms },
  };
}

function mockBackend(role) {
  const profile = { id: "u1", name: "Guru Kelas", username: "guru", role };
  const members = [profile, { id: "u2", name: "Siswa Satu", username: "siswa1", role: "student" }];
  window.__xss = 0;
  const tables = { members, notifications: [], notification_preferences: [], task_summaries: [] };
  function builder(table) {
    const filters = [];
    let single = false, mode = "select", payload = null, wantCount = false;
    const where = () => (tables[table] || []).filter(row => filters.every(fn => fn(row)));
    const q = {
      select(_columns, options) { if (options?.count) wantCount = true; return q; },
      eq(key, value) { filters.push(row => row[key] === value); return q; },
      in(key, values) { filters.push(row => values.includes(row[key])); return q; },
      is(key) { filters.push(row => row[key] === null || row[key] === undefined); return q; },
      order() { return q; },
      limit() { return q; },
      range() { return q; },
      maybeSingle() { single = true; return q; },
      insert(value) { mode = "insert"; payload = value; return q; },
      update(value) { mode = "update"; payload = value; return q; },
      delete() { mode = "delete"; return q; },
      then(resolve, reject) {
        let data = null;
        if (mode === "select") data = single ? (where()[0] ?? null) : where().slice();
        else if (mode === "insert") {
          const row = { id: "row-" + Math.random(), ...payload };
          tables[table] = [...(tables[table] || []), row];
          data = row;
        } else if (mode === "update") {
          for (const row of where()) Object.assign(row, payload);
        } else {
          tables[table] = (tables[table] || []).filter(row => !filters.every(fn => fn(row)));
        }
        return Promise.resolve({ data, error: null, count: wantCount ? (table === "notifications" ? 0 : where().length) : null }).then(resolve, reject);
      },
    };
    return q;
  }
  window.supabase = {
    createClient: () => ({
      auth: {
        getSession: async () => ({ data: { session: { access_token: "test-token", user: { id: "u1", user_metadata: { name: "Guru Kelas" } } } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: table => builder(table),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel() {},
    }),
  };
}

async function createPage(browser, base, options = {}) {
  const state = {
    role: options.role || "developer",
    items: options.items ? structuredClone(options.items) : [],
    trash: options.trash ? structuredClone(options.trash) : [],
    grants: options.grants ? structuredClone(options.grants) : [],
    managers: [],
    share: options.share ? structuredClone(options.share) : [],
    calls: [],
    errors: [],
    failItems: false,
    delayItems: 0,
    uploads: [],
  };
  const page = await browser.newPage({ viewport: options.viewport || { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  await page.addInitScript(mockBackend, state.role);
  page.on("pageerror", error => state.errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && !/Failed to load resource|net::ERR_FAILED/.test(message.text())) state.errors.push("console: " + message.text()); });

  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (pathname === "/api/config") {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ url: "https://classroom.invalid", publishableKey: "sb_publishable_local_test_configuration" }) });
    }
    if (!pathname.startsWith("/api/clouven-drive/")) {
      if (request.url().startsWith(base)) return route.continue();
      return route.abort();
    }
    const action = pathname.slice("/api/clouven-drive/".length);
    const method = request.method();
    state.calls.push({ action, method, url: request.url(), headers: request.headers(), body: request.postData() });
    const json = (status, data) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });

    if (action === "overview" && method === "GET") {
      return json(200, { counts: { files: 3, folders: 2 }, partial: false, quota: { usage: 2 * 1024 * 1024, limit: 10 * 1024 * 1024 } });
    }
    if (action === "items" && method === "GET") {
      if (state.failItems) return json(503, { error: "Metadata Clouven Drive belum dapat dibaca." });
      if (state.delayItems) await new Promise(resolve => setTimeout(resolve, state.delayItems));
      if (url.searchParams.get("view") === "trash") return json(200, { items: state.trash, page: 1, pageSize: 50, hasMore: false });
      const parentId = url.searchParams.get("parentId");
      const query = (url.searchParams.get("q") || "").toLowerCase();
      let items = state.items;
      if (query) items = items.filter(entry => entry.name.toLowerCase().includes(query));
      else items = items.filter(entry => (entry.parent_id || null) === (parentId || null));
      return json(200, { items, page: 1, pageSize: 50, hasMore: false });
    }
    if (action === "items" && method === "PATCH") {
      const body = JSON.parse(request.postData() || "{}");
      const target = state.items.find(entry => entry.id === body.id) || state.trash.find(entry => entry.id === body.id);
      if (target) {
        if (body.name !== undefined) target.name = body.name;
        if (Object.hasOwn(body, "parentId")) target.parent_id = body.parentId;
      }
      return json(200, { ok: true, item: target });
    }
    if (action === "files" && method === "POST") {
      const buffer = request.postDataBuffer() || Buffer.alloc(0);
      const name = decodeURIComponent(request.headers()["x-file-name"] || "file");
      state.uploads.push({ bytes: buffer.length, headers: request.headers(), name });
      const parentId = request.headers()["x-parent-id"] || null;
      const created = item({ id: "44444444-4444-4444-8444-444444444444", name, parent: parentId, size: buffer.length });
      state.items.push(created);
      return json(201, { ok: true, item: created });
    }
    if (action === "folders" && method === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      const created = item({ id: "55555555-5555-4555-8555-555555555555", type: "folder", name: body.name, parent: body.parentId || null });
      state.items.push(created);
      return json(201, { ok: true, item: created });
    }
    if (action === "trash" && method === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      const index = state.trash.findIndex(entry => entry.id === body.id);
      if (body.action === "trash") {
        const activeIndex = state.items.findIndex(entry => entry.id === body.id);
        if (activeIndex >= 0) {
          const [entry] = state.items.splice(activeIndex, 1);
          entry.status = "trashed";
          state.trash.push(entry);
        }
      } else if (body.action === "restore" && index >= 0) {
        const [entry] = state.trash.splice(index, 1);
        entry.status = "active";
        state.items.push(entry);
      } else if (body.action === "delete" && index >= 0) {
        state.trash.splice(index, 1);
      }
      return json(200, { ok: true });
    }
    if (action === "permissions" && method === "GET") {
      return json(200, { grants: state.grants, managers: state.managers });
    }
    if (action === "permissions" && method === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      state.grants.push({ user_id: body.userId, access_level: body.access });
      return json(200, { ok: true });
    }
    if (action === "permissions" && method === "DELETE") {
      return json(200, { ok: true });
    }
    if (action === "share" && method === "GET") {
      return json(200, { permissions: state.share });
    }
    if (action === "share" && method === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      state.share.push({ id: "perm-" + state.share.length, type: "user", role: body.role, emailAddress: body.email });
      return json(200, { ok: true });
    }
    if (action === "share" && method === "DELETE") {
      const id = url.searchParams.get("permissionId");
      state.share = state.share.filter(permission => permission.id !== id);
      return json(200, { ok: true });
    }
    if (action === "download" && method === "GET") {
      return route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Content-Disposition": 'attachment; filename="catatan.txt"',
          "Cache-Control": "private, no-store",
        },
        body: Buffer.from("isi file"),
      });
    }
    return json(404, { error: "Endpoint mock tidak ditemukan: " + action });
  });

  await page.goto(base + "/clouven-drive/");
  await page.locator("#driveSearch").waitFor();
  return { page, state };
}

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ channel: process.env.UI_BROWSER_CHANNEL || "msedge", headless: true });
  const results = [];
  async function until(fn, timeout = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (fn()) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("Timed out waiting for condition");
  }
  async function check(name, fn) {
    try {
      await fn();
      results.push({ name, status: "PASS" });
      console.log("PASS " + name);
    } catch (error) {
      results.push({ name, status: "FAIL", error: error.message });
      console.log("FAIL " + name + " :: " + error.message);
      throw error;
    }
  }

  const folder = item({ id: folderId, type: "folder", name: "Materi" });
  const child = item({ id: "66666666-6666-4666-8666-666666666666", name: "di dalam folder.txt", parent: folderId });
  const file = item({ id: fileId, name: "catatan.txt", size: 2048 });

  await check("listing, quota, actions, folder navigation, and breadcrumbs", async () => {
    const { page, state } = await createPage(browser, base, { items: [folder, child, file] });
    await page.locator(".drive-item-row").first().waitFor();
    assert.equal(await page.locator(".drive-item-row").count(), 2);
    assert.equal(await page.locator(".drive-item-name").first().innerText(), "Materi");
    assert.match(await page.locator(".drive-stat-value").nth(0).innerText(), /2 MB dari 10 MB/);
    assert.match(await page.locator(".drive-stat-value").nth(1).innerText(), /3 file · 2 folder/);
    assert.equal(await page.getByRole("button", { name: "Unduh catatan.txt" }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Bagikan catatan.txt" }).count(), 1);
    await page.getByRole("button", { name: "Buka folder Materi" }).click();
    await page.locator(".drive-item-name", { hasText: "di dalam folder.txt" }).waitFor();
    assert.match(await page.locator(".drive-breadcrumb-current").innerText(), /Drive saya\s*Materi/);
    assert.equal(state.calls.some(call => call.action === "items" && call.url.includes("parentId=" + folderId)), true);
    await page.locator(".drive-breadcrumb-home").click();
    await page.getByRole("button", { name: "Buka folder Materi" }).waitFor();
    assert.equal(state.errors.length, 0, state.errors.join("\n"));
    await page.close();
  });

  await check("empty, error/retry, loading, search, and XSS-safe names", async () => {
    const empty = await createPage(browser, base, { items: [] });
    await empty.page.getByText("Folder ini masih kosong").waitFor();
    await empty.page.close();

    const errorPage = await createPage(browser, base, { items: [file] });
    await errorPage.page.locator(".drive-item-name").waitFor();
    errorPage.state.failItems = true;
    await errorPage.page.locator("#driveTrashToggle").click();
    await errorPage.page.getByText("Daftar belum dapat dimuat").waitFor();
    errorPage.state.failItems = false;
    await errorPage.page.getByRole("button", { name: "Coba lagi" }).click();
    await errorPage.page.getByText("Sampah kosong").waitFor();
    await errorPage.page.close();

    const loading = await createPage(browser, base, { items: [folder, child, file] });
    await loading.page.locator(".drive-item-row").first().waitFor();
    loading.state.delayItems = 500;
    const nav = loading.page.getByRole("button", { name: "Buka folder Materi" });
    await nav.click();
    assert.equal(await loading.page.locator("#driveList").getAttribute("aria-busy"), "true");
    assert.match(await loading.page.locator("#driveSearchHelp").innerText(), /Memuat daftar/);
    await loading.page.getByText("di dalam folder.txt").waitFor();
    await loading.page.close();

    const searchPage = await createPage(browser, base, { items: [file, item({ id: "77777777-7777-4777-8777-777777777777", name: "lain.txt" })] });
    await searchPage.page.locator(".drive-item-row").first().waitFor();
    await searchPage.page.locator("#driveSearch").fill("catatan");
    await searchPage.page.getByText("Hasil pencarian").waitFor();
    assert.equal(await searchPage.page.locator(".drive-item-row").count(), 1);
    await searchPage.page.locator("#driveSearch").fill("");
    await searchPage.page.locator(".drive-item-row").first().waitFor();
    await searchPage.page.close();

    const xss = await createPage(browser, base, { items: [item({ id: "88888888-8888-4888-8888-888888888888", name: '<img src=x onerror="window.__xss=1">' })] });
    await xss.page.locator(".drive-item-name").waitFor();
    assert.equal(await xss.page.locator(".drive-item-name img").count(), 0);
    assert.equal(await xss.page.evaluate(() => window.__xss), 0);
    await xss.page.close();
  });

  await check("rename, create folder, move picker, upload, and download", async () => {
    const { page, state } = await createPage(browser, base, { items: [folder, file] });
    await page.locator(".drive-item-row").first().waitFor();

    page.once("dialog", dialog => dialog.accept("catatan baru.txt"));
    await page.getByRole("button", { name: "Ubah nama catatan.txt" }).click();
    await page.getByText("catatan baru.txt").waitFor();
    const rename = state.calls.find(call => call.action === "items" && call.method === "PATCH");
    assert.equal(JSON.parse(rename.body).name, "catatan baru.txt");

    const downloadPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await page.getByRole("button", { name: "Unduh catatan baru.txt" }).click();
    const download = await downloadPromise;
    if (download) assert.match(download.suggestedFilename(), /catatan/);
    assert.equal(state.calls.some(call => call.action === "download"), true);

    page.once("dialog", dialog => dialog.accept("Folder Baru"));
    await page.locator("#driveNewFolder").click();
    await page.getByText("Folder Baru").waitFor();
    assert.equal(state.calls.some(call => call.action === "folders" && call.method === "POST"), true);

    await page.getByRole("button", { name: "Pindahkan catatan baru.txt", exact: true }).click();
    const moveDialog = page.locator(".drive-dialog").filter({ hasText: "Pindahkan" });
    await moveDialog.getByRole("button", { name: "Materi" }).click();
    await moveDialog.getByRole("button", { name: "Pindahkan ke sini" }).click();
    await page.waitForFunction(() => !document.querySelector(".drive-dialog"));
    const move = state.calls.filter(call => call.action === "items" && call.method === "PATCH").at(-1);
    assert.equal(JSON.parse(move.body).parentId, folderId);

    await page.locator('input[type="file"]').setInputFiles({ name: "unggahan.txt", mimeType: "text/plain", buffer: Buffer.alloc(1024, 65) });
    await page.getByText("unggahan.txt").waitFor();
    assert.equal(state.uploads.length, 1);
    assert.equal(state.uploads[0].bytes, 1024);
    assert.equal(state.uploads[0].headers["authorization"], "Bearer test-token");
    assert.match(state.uploads[0].headers["idempotency-key"], /^[0-9a-f-]{36}$/);
    assert.equal(state.uploads[0].headers["x-file-name"], "unggahan.txt");

    await page.locator('input[type="file"]').setInputFiles({ name: "besar.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(3 * 1024 * 1024 + 1, 66) });
    await page.getByText("File terlalu besar. Maksimal 3 MiB per file.").waitFor();
    assert.equal(state.uploads.length, 1);

    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Pindahkan unggahan.txt ke Sampah" }).click();
    await page.getByText("unggahan.txt").waitFor({ state: "detached" });
    await until(() => state.calls.some(call => call.action === "trash" && JSON.parse(call.body).action === "trash"));
    await page.close();
  });

  await check("share dialog: internal grant and confirmed external share", async () => {
    const shareItem = item({ id: fileId, name: "dibagikan.txt" });
    const { page, state } = await createPage(browser, base, { items: [shareItem], grants: [{ user_id: "u2", access_level: "viewer" }], share: [{ id: "perm-1", type: "user", role: "reader", emailAddress: "tamu@example.com" }] });
    await page.locator(".drive-item-row").waitFor();
    await page.getByRole("button", { name: "Bagikan dibagikan.txt" }).click();
    const dialog = page.locator(".drive-share-dialog");
    await dialog.locator("[data-member] option").first().waitFor({ state: "attached" });
    assert.equal(await dialog.locator("[data-member] option").count(), 1);
    await dialog.locator("[data-member]").selectOption("u2");
    await dialog.locator("[data-access]").selectOption("editor");
    await dialog.getByRole("button", { name: "Tambah" }).click();
    await until(() => state.calls.some(call => call.action === "permissions" && call.method === "POST"));
    const grant = state.calls.find(call => call.action === "permissions" && call.method === "POST");
    assert.equal(JSON.parse(grant.body).access, "editor");

    await dialog.getByRole("button", { name: "Cabut akses tamu@example.com" }).waitFor();
    await dialog.locator("[data-email]").fill("baru@example.com");
    await dialog.locator("[data-role]").selectOption("writer");
    await dialog.getByRole("button", { name: "Bagikan", exact: true }).click();
    await dialog.getByText("Centang konfirmasi sebelum berbagi eksternal.").waitFor();
    await dialog.locator("[data-confirm]").check();
    await dialog.getByRole("button", { name: "Bagikan", exact: true }).click();
    await until(() => state.calls.some(call => call.action === "share" && call.method === "POST"));
    const share = state.calls.find(call => call.action === "share" && call.method === "POST");
    assert.equal(JSON.parse(share.body).confirm, true);
    assert.equal(JSON.parse(share.body).email, "baru@example.com");
    await page.close();
  });

  await check("trash view: restore, owner purge, and teacher cannot purge others", async () => {
    const restoreId = "99999999-9999-4999-8999-999999999999";
    const purgeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { page, state } = await createPage(browser, base, {
      items: [file],
      trash: [
        item({ id: restoreId, name: "pulihkan.txt", owner: "u1" }),
        item({ id: purgeId, name: "hapus.txt", owner: "u1" }),
      ],
    });
    await page.locator("#driveTrashToggle").click();
    await page.getByText("Isi Sampah").waitFor();
    assert.equal(await page.locator("#driveSearch").isDisabled(), true);
    assert.equal(await page.locator("#driveUpload").isVisible(), false);
    assert.equal(await page.locator("#driveNewFolder").isVisible(), false);
    assert.equal(await page.getByRole("button", { name: "Hapus permanen hapus.txt" }).count(), 1);
    await page.getByRole("button", { name: "Pulihkan pulihkan.txt" }).click();
    await page.getByText("pulihkan.txt").waitFor({ state: "detached" });
    await until(() => state.calls.some(call => call.action === "trash" && JSON.parse(call.body).action === "restore"));
    const restore = state.calls.find(call => call.action === "trash" && JSON.parse(call.body).action === "restore");
    assert.ok(restore);

    page.on("dialog", dialog => dialog.type() === "prompt" ? dialog.accept("HAPUS") : dialog.accept());
    await page.getByRole("button", { name: "Hapus permanen hapus.txt" }).click();
    await page.getByText("Sampah kosong").waitFor();
    const purge = state.calls.find(call => call.action === "trash" && JSON.parse(call.body).action === "delete");
    assert.equal(JSON.parse(purge.body).confirm, true);
    await page.close();

    const teacher = await createPage(browser, base, {
      role: "teacher",
      items: [],
      trash: [item({ id: trashId, name: "milik siswa.txt", owner: "u2", perms: { canEdit: true, canDelete: true, canManage: true } })],
    });
    await teacher.page.locator("#driveTrashToggle").click();
    await teacher.page.getByText("milik siswa.txt").waitFor();
    assert.equal(await teacher.page.getByRole("button", { name: "Pulihkan milik siswa.txt" }).count(), 1);
    assert.equal(await teacher.page.getByRole("button", { name: "Hapus permanen milik siswa.txt" }).count(), 0);
    await teacher.page.close();
  });

  await check("mobile layout has no horizontal overflow", async () => {
    const { page } = await createPage(browser, base, { items: [folder, file], viewport: { width: 360, height: 800 } });
    await page.locator(".drive-item-row").first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(out, "drive-mobile.png"), fullPage: true });
    await page.close();
  });

  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2));
  console.log("All " + results.length + " Drive UI checks passed. Results: " + out);
  await browser.close();
  server.close();
})().catch(error => {
  console.error(error);
  server.close();
  process.exit(1);
});
