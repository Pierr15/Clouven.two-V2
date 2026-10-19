import { requireAuth, authHeader } from "../auth.js";
import { bootShell } from "../bootstrap.js";
import { openModal, showToast } from "../utils.js";
import { supabase } from "../supabase.js";

const session = await requireAuth();
if (!session) throw new Error("redirect");
await bootShell("drive");

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const notice = document.querySelector(".drive-foundation-notice");
const search = document.querySelector("#driveSearch");
const help = document.querySelector("#driveSearchHelp");
const list = document.querySelector(".drive-empty-state");
const folderButton = document.querySelector("#driveNewFolder");
const uploadButton = document.querySelector("#driveUpload");
const trashButton = document.querySelector("#driveTrashToggle");
const breadcrumb = document.querySelector(".drive-breadcrumb-current");
const breadcrumbNote = document.querySelector(".drive-breadcrumb-note");
const statValues = document.querySelectorAll(".drive-stat-value");
const statDescriptions = document.querySelectorAll(".drive-stat-card p");
const quotaBar = document.querySelector(".drive-stat-track span");
let parentId = null;
let currentFolderName = "";
let view = "active";
let searchTimer = null;
let activeController = null;
let loading = false;
let currentItems = [];

if (notice) {
  notice.dataset.role = session.role;
}

const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.hidden = true;
document.body.append(fileInput);

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function bytesLabel(value) {
  const size = Number(value) || 0;
  if (size < 1024) return size + " B";
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
  return (size / (1024 * 1024)).toFixed(1) + " MB";
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const step = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / 1024 ** step;
  const digits = step === 0 ? 0 : scaled >= 10 ? 1 : 2;
  return scaled.toLocaleString("id-ID", { maximumFractionDigits: digits }) + " " + units[step];
}

async function requestJson(path, { method = "GET", body, idempotent = false } = {}) {
  const headers = { ...(await authHeader()) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotent) headers["Idempotency-Key"] = crypto.randomUUID();
  const response = await fetch(path, {
    method,
    headers,
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Permintaan Clouven Drive gagal.");
  return data;
}

function iconButton(icon, label, onClick, { danger = false } = {}) {
  const button = node("button", "drive-icon-button");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  if (danger) button.dataset.danger = "true";
  const iconElement = node("i", "ti " + icon);
  iconElement.setAttribute("aria-hidden", "true");
  button.append(iconElement);
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await onClick(button);
    } catch (error) {
      showToast(error.message || "Aksi belum dapat diselesaikan.");
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function actionCluster(item) {
  const actions = node("div", "drive-item-actions");
  const permissions = item.permissions || {};
  if (view === "trash") {
    if (permissions.canDelete) {
      actions.append(iconButton("ti-restore", "Pulihkan " + item.name, () => restoreItem(item)));
      const canPurge = item.owner_id === session.user.id || session.role === "owner";
      if (canPurge) {
        actions.append(iconButton("ti-trash-x", "Hapus permanen " + item.name, () => purgeItem(item), { danger: true }));
      }
    }
    return actions;
  }
  if (item.item_type === "file" && item.drive_file_id) {
    actions.append(iconButton("ti-download", "Unduh " + item.name, () => downloadItem(item)));
  }
  if (permissions.canEdit) {
    actions.append(iconButton("ti-pencil", "Ubah nama " + item.name, () => renameItem(item)));
    actions.append(iconButton("ti-arrows-move", "Pindahkan " + item.name, trigger => openMoveDialog(item, trigger)));
  }
  if (permissions.canManage) {
    actions.append(iconButton("ti-share", "Bagikan " + item.name, trigger => openShareDialog(item, trigger)));
  }
  if (permissions.canDelete) {
    actions.append(iconButton("ti-trash", "Pindahkan " + item.name + " ke Sampah", () => trashItem(item), { danger: true }));
  }
  return actions;
}

function renderItems(items, query, truncated) {
  list.replaceChildren();
  list.classList.remove("drive-empty-state");
  if (!items.length) {
    list.classList.add("drive-empty-state");
    list.append(
      node("h3", "", view === "trash"
        ? "Sampah kosong"
        : query ? "Tidak ada hasil yang cocok" : "Folder ini masih kosong"),
      node("p", "", view === "trash"
        ? "Item yang kamu pindahkan ke Sampah akan muncul di sini."
        : query
          ? "Coba kata kunci lain atau periksa ejaan nama file."
          : "Unggah file atau buat folder untuk memulai.")
    );
    return;
  }

  const heading = node("h3", "drive-list-heading", view === "trash" ? "Isi Sampah" : query ? "Hasil pencarian" : "Isi folder");
  list.append(heading);
  const rows = node("div", "drive-item-list");
  for (const item of items) {
    const row = node("article", "drive-item-row");
    const icon = node("span", "drive-item-icon");
    const iconElement = node("i", item.item_type === "folder" ? "ti ti-folder" : "ti ti-file-description");
    iconElement.setAttribute("aria-hidden", "true");
    icon.append(iconElement);

    const details = node("div", "drive-item-details");
    const name = node(item.item_type === "folder" && view === "active" ? "button" : "strong", "drive-item-name", item.name);
    if (item.item_type === "folder" && view === "active") {
      name.type = "button";
      name.addEventListener("click", () => {
        parentId = item.id;
        currentFolderName = item.name;
        if (search) search.value = "";
        loadItems();
      });
    }
    const metaParts = [item.item_type === "folder" ? "Folder" : bytesLabel(item.size_bytes)];
    if (item.updated_at) metaParts.push("Diperbarui " + new Date(item.updated_at).toLocaleDateString("id-ID"));
    if (item.owner_id && item.owner_id !== session.user.id) metaParts.push("Milik anggota lain");
    details.append(name, node("p", "", metaParts.join(" · ")));
    row.append(icon, details, actionCluster(item));

    if (item.item_type === "folder" && view === "active") {
      const open = node("button", "drive-item-open");
      open.type = "button";
      open.title = "Buka folder";
      open.setAttribute("aria-label", "Buka folder " + item.name);
      const arrow = node("i", "ti ti-chevron-right");
      arrow.setAttribute("aria-hidden", "true");
      open.append(arrow);
      open.addEventListener("click", () => {
        parentId = item.id;
        currentFolderName = item.name;
        if (search) search.value = "";
        loadItems();
      });
      row.append(open);
    }
    rows.append(row);
  }
  list.append(rows);
  if (truncated) list.append(node("p", "drive-toolbar-hint", "Daftar dibatasi untuk menjaga respons tetap ringan."));
}

function renderOverviewQuota(quota) {
  const usage = Number(quota?.usage) || 0;
  const limit = Number(quota?.limit) || 0;
  if (limit > 0) {
    const percent = Math.min(100, (usage / limit) * 100);
    const percentLabel = Math.round(percent);
    if (statValues[0]) statValues[0].textContent = `${formatBytes(usage)} dari ${formatBytes(limit)}`;
    if (statDescriptions[0]) statDescriptions[0].textContent = percentLabel < 1
      ? "Terpakai di bawah 1% dari kuota akun Google."
      : `Terpakai sekitar ${percentLabel}% dari kuota akun Google.`;
    if (quotaBar) quotaBar.style.width = percent + "%";
  } else if (usage > 0) {
    if (statValues[0]) statValues[0].textContent = `${formatBytes(usage)} terpakai`;
    if (statDescriptions[0]) statDescriptions[0].textContent = "Kuota akun Google tidak membatasi penyimpanan.";
    if (quotaBar) quotaBar.style.width = "0%";
  } else {
    if (statValues[0]) statValues[0].textContent = "Belum tersedia";
    if (statDescriptions[0]) statDescriptions[0].textContent = "Kuota Google Drive belum dapat dibaca saat ini.";
    if (quotaBar) quotaBar.style.width = "0%";
  }
}

async function loadOverview() {
  try {
    const response = await fetch("/api/clouven-drive/overview", {
      headers: await authHeader(),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("Ringkasan belum tersedia.");
    const counts = data.counts || {};
    renderOverviewQuota(data.quota);
    if (statValues[1]) statValues[1].textContent = (Number(counts.files) || 0) + " file · " + (Number(counts.folders) || 0) + " folder";
    if (statDescriptions[1]) statDescriptions[1].textContent = data.partial
      ? "Ringkasan parsial dari item yang dapat diakses."
      : "Jumlah item yang dapat diakses akunmu.";
  } catch {
    if (statValues[0]) statValues[0].textContent = "Belum tersedia";
    if (statDescriptions[0]) statDescriptions[0].textContent = "Kuota Google Drive belum dapat dibaca saat ini.";
    if (statValues[1]) statValues[1].textContent = "Belum tersedia";
    if (statDescriptions[1]) statDescriptions[1].textContent = "Ringkasan metadata tidak dapat dimuat saat ini.";
  }
}

function renderBreadcrumbs() {
  if (!breadcrumb) return;
  breadcrumb.replaceChildren();
  const icon = node("i", view === "trash" ? "ti ti-trash" : "ti ti-cloud");
  icon.setAttribute("aria-hidden", "true");
  if (view === "trash") {
    breadcrumb.append(icon, document.createTextNode("Sampah"));
  } else if (parentId) {
    const home = node("button", "drive-breadcrumb-home", "Drive saya");
    home.type = "button";
    home.addEventListener("click", () => {
      parentId = null;
      currentFolderName = "";
      if (search) search.value = "";
      loadItems();
    });
    const separator = node("i", "ti ti-chevron-right");
    separator.setAttribute("aria-hidden", "true");
    breadcrumb.append(icon, home, separator, node("span", "drive-breadcrumb-current-label", currentFolderName || "Folder terpilih"));
  } else {
    breadcrumb.append(icon, document.createTextNode("Drive saya"));
  }
  if (breadcrumbNote) {
    breadcrumbNote.textContent = view === "trash"
      ? "Item yang dipindahkan ke Sampah"
      : parentId ? "Isi folder yang dipilih" : "Lokasi utama";
  }
}

async function loadItems() {
  if (loading && activeController) activeController.abort();
  const controller = new AbortController();
  activeController = controller;
  loading = true;
  const query = view === "active" ? (search?.value || "").trim() : "";
  list.setAttribute("aria-busy", "true");
  if (help) help.textContent = "Memuat daftar…";
  renderBreadcrumbs();
  if (search) search.disabled = view === "trash";
  try {
    const params = new URLSearchParams({ page: "1", limit: "50" });
    if (view === "trash") {
      params.set("view", "trash");
    } else {
      if (parentId) params.set("parentId", parentId);
      if (query) params.set("q", query);
    }
    const response = await fetch("/api/clouven-drive/items?" + params.toString(), {
      headers: await authHeader(),
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Daftar Clouven Drive belum dapat dibaca.");
    currentItems = Array.isArray(data.items) ? data.items : [];
    renderItems(currentItems, query, Boolean(data.truncated || data.hasMore));
    if (help) help.textContent = view === "trash"
      ? "Pulihkan item atau hapus permanen sesuai izinmu."
      : query ? "Pencarian selesai." : "Hanya item yang diizinkan untuk akunmu yang ditampilkan.";
  } catch (error) {
    if (error.name === "AbortError") return;
    list.replaceChildren();
    list.classList.add("drive-empty-state");
    const title = node("h3", "", "Daftar belum dapat dimuat");
    const detail = node("p", "", error.message || "Coba lagi sebentar lagi.");
    const retry = node("button", "button button-light drive-action-button", "Coba lagi");
    retry.type = "button";
    retry.addEventListener("click", loadItems);
    list.append(title, detail, retry);
    if (help) help.textContent = "Gagal memuat daftar.";
  } finally {
    if (activeController === controller) {
      activeController = null;
      loading = false;
      list.removeAttribute("aria-busy");
    }
  }
}

async function refreshAfterMutation(message) {
  if (message) showToast(message);
  await Promise.all([loadItems(), loadOverview()]);
}

async function downloadItem(item) {
  const response = await fetch(`/api/clouven-drive/download?itemId=${encodeURIComponent(item.id)}`, {
    headers: await authHeader(),
    cache: "no-store",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "File belum dapat diunduh.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = item.name || "file";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function renameItem(item) {
  const raw = window.prompt("Nama baru (maksimal 240 karakter):", item.name);
  if (raw === null) return;
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > 240 || /[\u0000-\u001f\u007f]/.test(name) || /[\\/]/.test(name) || name === "." || name === "..") {
    showToast("Nama tidak valid. Gunakan 1–240 karakter.");
    return;
  }
  if (name === item.name) return;
  await requestJson("/api/clouven-drive/items", { method: "PATCH", idempotent: true, body: { id: item.id, name } });
  await refreshAfterMutation("Nama berhasil diubah.");
}

async function trashItem(item) {
  if (!window.confirm(`Pindahkan "${item.name}" ke Sampah?`)) return;
  await requestJson("/api/clouven-drive/trash", { method: "POST", idempotent: true, body: { id: item.id, action: "trash" } });
  await refreshAfterMutation("Item dipindahkan ke Sampah.");
}

async function restoreItem(item) {
  await requestJson("/api/clouven-drive/trash", { method: "POST", idempotent: true, body: { id: item.id, action: "restore" } });
  await refreshAfterMutation("Item dipulihkan.");
}

async function purgeItem(item) {
  if (!window.confirm(`Hapus permanen "${item.name}"? Tindakan ini tidak dapat dibatalkan.`)) return;
  const answer = window.prompt(`Ketik HAPUS untuk menghapus permanen "${item.name}".`);
  if (answer !== "HAPUS") {
    showToast("Hapus permanen dibatalkan.");
    return;
  }
  await requestJson("/api/clouven-drive/trash", {
    method: "POST", idempotent: true,
    body: { id: item.id, action: "delete", confirm: true },
  });
  await refreshAfterMutation("Item dihapus permanen.");
}

function openMoveDialog(item, trigger) {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `<section class="modal action-modal drive-dialog"><button class="modal-close" type="button" data-close>×</button><p class="eyebrow">pindahkan item</p><h2></h2><p class="muted dialog-description">Pilih folder tujuan. Hanya folder yang dapat kamu ubah yang ditampilkan.</p><div class="drive-dialog-location" data-location>Lokasi: Drive saya</div><div class="drive-dialog-folders" data-folders></div><p class="notice error" role="alert" data-error hidden></p><div class="form-actions"><button class="button button-light" type="button" data-close>Batal</button><button class="button button-coral" type="button" data-confirm>Pindahkan ke sini</button></div></section>`;
  wrap.querySelector("h2").textContent = 'Pindahkan "' + item.name + '"';
  const close = openModal(wrap, trigger);
  const foldersBox = wrap.querySelector("[data-folders]");
  const locationBox = wrap.querySelector("[data-location]");
  const errorBox = wrap.querySelector("[data-error]");
  const confirmButton = wrap.querySelector("[data-confirm]");
  const stack = [];

  function currentLocation() {
    return stack.length ? stack[stack.length - 1] : null;
  }

  async function loadFolders() {
    errorBox.hidden = true;
    const current = currentLocation();
    locationBox.textContent = "Lokasi: " + (stack.length ? stack.map(entry => entry.name).join(" / ") : "Drive saya");
    foldersBox.replaceChildren(node("p", "drive-toolbar-hint", "Memuat folder…"));
    const params = new URLSearchParams({ page: "1", limit: "50" });
    if (current) params.set("parentId", current.id);
    const data = await requestJson("/api/clouven-drive/items?" + params.toString());
    const folders = (data.items || []).filter(entry =>
      entry.item_type === "folder" &&
      entry.id !== item.id &&
      entry.permissions?.canEdit !== false);
    foldersBox.replaceChildren();
    if (stack.length) {
      const up = node("button", "drive-folder-option", "↑ Naik satu level");
      up.type = "button";
      up.addEventListener("click", () => { stack.pop(); loadFolders().catch(showError); });
      foldersBox.append(up);
    }
    if (!folders.length) {
      foldersBox.append(node("p", "drive-toolbar-hint", "Tidak ada subfolder di lokasi ini. Kamu tetap dapat memindahkan item ke lokasi ini."));
      return;
    }
    for (const folder of folders) {
      const option = node("button", "drive-folder-option");
      option.type = "button";
      const icon = node("i", "ti ti-folder");
      icon.setAttribute("aria-hidden", "true");
      option.append(icon, document.createTextNode(folder.name));
      option.addEventListener("click", () => { stack.push({ id: folder.id, name: folder.name }); loadFolders().catch(showError); });
      foldersBox.append(option);
    }
  }

  function showError(error) {
    errorBox.textContent = error.message || "Folder tujuan belum dapat dimuat.";
    errorBox.hidden = false;
  }

  confirmButton.addEventListener("click", async () => {
    const target = currentLocation()?.id ?? null;
    if (target === (item.parent_id ?? null)) {
      showToast("Item sudah berada di lokasi itu.");
      return;
    }
    confirmButton.disabled = true;
    try {
      await requestJson("/api/clouven-drive/items", {
        method: "PATCH", idempotent: true,
        body: { id: item.id, parentId: target },
      });
      close();
      await refreshAfterMutation("Item dipindahkan.");
    } catch (error) {
      showError(error);
    } finally {
      confirmButton.disabled = false;
    }
  });

  loadFolders().catch(showError);
}

const ACCESS_LABELS = { viewer: "Lihat", editor: "Ubah", manager: "Pengelola" };

function memberLabel(member) {
  if (!member) return "Anggota";
  return member.name ? member.name + (member.username ? " (@" + member.username + ")" : "") : member.username || "Anggota";
}

async function openShareDialog(item, trigger) {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `<section class="modal action-modal drive-dialog drive-share-dialog"><button class="modal-close" type="button" data-close>×</button><p class="eyebrow">berbagi</p><h2></h2><p class="muted dialog-description">Atur akses anggota atau bagikan ke email eksternal. Berbagi eksternal memerlukan konfirmasi.</p><div class="drive-share-section"><h3>Akses anggota</h3><div data-grants></div><div class="drive-share-form"><select data-member aria-label="Pilih anggota"></select><select data-access aria-label="Level akses"></select><button class="button button-light drive-action-button" type="button" data-add-grant>Tambah</button></div></div><div class="drive-share-section"><h3>Berbagi eksternal</h3><div data-external></div><div class="drive-share-form"><input data-email type="email" maxlength="254" placeholder="email@contoh.com" aria-label="Email tujuan"><select data-role aria-label="Peran eksternal"><option value="reader">Lihat</option><option value="writer">Ubah</option></select><label class="drive-share-confirm"><input data-confirm type="checkbox"> Saya yakin</label><button class="button button-light drive-action-button" type="button" data-add-external>Bagikan</button></div></div><p class="notice error" role="alert" data-error hidden></p></section>`;
  wrap.querySelector("h2").textContent = 'Bagikan "' + item.name + '"';
  const close = openModal(wrap, trigger);
  const grantsBox = wrap.querySelector("[data-grants]");
  const externalBox = wrap.querySelector("[data-external]");
  const memberSelect = wrap.querySelector("[data-member]");
  const accessSelect = wrap.querySelector("[data-access]");
  const errorBox = wrap.querySelector("[data-error]");
  const emailInput = wrap.querySelector("[data-email]");
  const roleSelect = wrap.querySelector("[data-role]");
  const confirmCheck = wrap.querySelector("[data-confirm]");
  const addGrant = wrap.querySelector("[data-add-grant]");
  const addExternal = wrap.querySelector("[data-add-external]");

  for (const [value, label] of Object.entries(ACCESS_LABELS)) {
    if (value === "manager" && item.item_type !== "folder") continue;
    const option = node("option", "", label);
    option.value = value;
    accessSelect.append(option);
  }

  let members = [];
  try {
    const { data, error } = await supabase.from("members").select("id,name,username,role").order("name");
    if (error) throw error;
    members = (data || []).filter(member => member.id !== session.user.id);
    for (const member of members) {
      const option = node("option", "", memberLabel(member));
      option.value = member.id;
      memberSelect.append(option);
    }
    if (!members.length) {
      const option = node("option", "", "Tidak ada anggota lain");
      option.value = "";
      memberSelect.append(option);
      addGrant.disabled = true;
    }
  } catch {
    const option = node("option", "", "Daftar anggota gagal dimuat");
    option.value = "";
    memberSelect.append(option);
    addGrant.disabled = true;
  }
  const memberMap = new Map(members.map(member => [member.id, member]));

  function showError(error) {
    errorBox.textContent = error.message || "Akses berbagi belum dapat diperbarui.";
    errorBox.hidden = false;
  }

  function shareRow(label, detail, onRemove) {
    const row = node("div", "drive-share-row");
    const text = node("span", "", label + (detail ? " · " + detail : ""));
    const remove = node("button", "drive-icon-button", "");
    remove.type = "button";
    remove.title = "Cabut akses";
    remove.setAttribute("aria-label", "Cabut akses " + label);
    remove.dataset.danger = "true";
    const icon = node("i", "ti ti-x");
    icon.setAttribute("aria-hidden", "true");
    remove.append(icon);
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        await onRemove();
      } catch (error) {
        showError(error);
      } finally {
        remove.disabled = false;
      }
    });
    row.append(text, remove);
    return row;
  }

  async function refreshInternal() {
    const data = await requestJson("/api/clouven-drive/permissions?itemId=" + encodeURIComponent(item.id));
    grantsBox.replaceChildren();
    const grants = data.grants || [];
    const managers = data.managers || [];
    if (!grants.length && !managers.length) {
      grantsBox.append(node("p", "drive-toolbar-hint", "Belum ada anggota lain yang memiliki akses eksplisit."));
    }
    for (const grant of grants) {
      const member = memberMap.get(grant.user_id);
      grantsBox.append(shareRow(memberLabel(member), ACCESS_LABELS[grant.access_level] || grant.access_level, async () => {
        await requestJson(
          "/api/clouven-drive/permissions?itemId=" + encodeURIComponent(item.id) +
          "&userId=" + encodeURIComponent(grant.user_id) +
          "&access=" + encodeURIComponent(grant.access_level),
          { method: "DELETE", idempotent: true },
        );
        showToast("Akses dicabut.");
        await refreshInternal();
      }));
    }
    for (const manager of managers) {
      const member = memberMap.get(manager.user_id);
      grantsBox.append(shareRow(memberLabel(member), "Pengelola", async () => {
        await requestJson(
          "/api/clouven-drive/permissions?itemId=" + encodeURIComponent(item.id) +
          "&userId=" + encodeURIComponent(manager.user_id) + "&access=manager",
          { method: "DELETE", idempotent: true },
        );
        showToast("Pengelola dicabut.");
        await refreshInternal();
      }));
    }
  }

  async function refreshExternal() {
    externalBox.replaceChildren();
    if (!item.drive_file_id) {
      externalBox.append(node("p", "drive-toolbar-hint", "Item belum tersinkron dengan Google Drive."));
      return;
    }
    try {
      const data = await requestJson("/api/clouven-drive/share?itemId=" + encodeURIComponent(item.id));
      const permissions = (data.permissions || []).filter(permission =>
        permission.type === "user" && permission.role !== "owner" && !permission.deleted);
      if (!permissions.length) {
        externalBox.append(node("p", "drive-toolbar-hint", "Belum ada berbagi eksternal."));
      }
      for (const permission of permissions) {
        const email = permission.emailAddress || permission.displayName || "Pengguna eksternal";
        externalBox.append(shareRow(email, ACCESS_LABELS[permission.role] || permission.role, async () => {
          await requestJson(
            "/api/clouven-drive/share?itemId=" + encodeURIComponent(item.id) +
            "&permissionId=" + encodeURIComponent(permission.id),
            { method: "DELETE", idempotent: true },
          );
          showToast("Akses eksternal dicabut.");
          await refreshExternal();
        }));
      }
    } catch (error) {
      externalBox.append(node("p", "drive-toolbar-hint", error.message || "Akses eksternal belum dapat dibaca."));
      addExternal.disabled = true;
    }
  }

  addGrant.addEventListener("click", async () => {
    const userId = memberSelect.value;
    if (!userId) return;
    addGrant.disabled = true;
    errorBox.hidden = true;
    try {
      await requestJson("/api/clouven-drive/permissions", {
        method: "POST", idempotent: true,
        body: { itemId: item.id, userId, access: accessSelect.value },
      });
      showToast("Akses anggota ditambahkan.");
      await refreshInternal();
    } catch (error) {
      showError(error);
    } finally {
      addGrant.disabled = false;
    }
  });

  addExternal.addEventListener("click", async () => {
    if (!confirmCheck.checked) {
      showError(new Error("Centang konfirmasi sebelum berbagi eksternal."));
      return;
    }
    addExternal.disabled = true;
    errorBox.hidden = true;
    try {
      await requestJson("/api/clouven-drive/share", {
        method: "POST", idempotent: true,
        body: { itemId: item.id, email: emailInput.value.trim(), role: roleSelect.value, confirm: true },
      });
      emailInput.value = "";
      confirmCheck.checked = false;
      showToast("Akses eksternal ditambahkan.");
      await refreshExternal();
    } catch (error) {
      showError(error);
    } finally {
      addExternal.disabled = false;
    }
  });

  await Promise.all([refreshInternal().catch(showError), refreshExternal()]);
}

function setView(nextView) {
  view = nextView;
  parentId = null;
  currentFolderName = "";
  if (search) search.value = "";
  if (trashButton) {
    trashButton.setAttribute("aria-pressed", String(view === "trash"));
    trashButton.classList.toggle("is-active", view === "trash");
  }
  if (folderButton) folderButton.hidden = view === "trash";
  if (uploadButton) uploadButton.hidden = view === "trash";
  loadItems();
}

if (search) {
  search.addEventListener("input", () => {
    if (view !== "active") return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadItems, 250);
  });
}

if (folderButton) {
  folderButton.addEventListener("click", async () => {
    const rawName = window.prompt("Nama folder baru (maksimal 120 karakter):");
    if (rawName === null) return;
    const name = rawName.trim().replace(/\s+/g, " ");
    if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name) || name === "." || name === "..") {
      showToast("Nama folder tidak valid. Gunakan 1–120 karakter.");
      return;
    }
    folderButton.disabled = true;
    try {
      const response = await fetch("/api/clouven-drive/folders", {
        method: "POST",
        headers: {
          ...(await authHeader()),
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ name, parentId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Folder belum dapat dibuat.");
      await refreshAfterMutation("Folder berhasil dibuat.");
    } catch (error) {
      showToast(error.message || "Folder belum dapat dibuat.");
    } finally {
      folderButton.disabled = false;
    }
  });
}

if (uploadButton) {
  uploadButton.addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (!file.size) {
    showToast("File ini kosong (0 B). Pilih file yang memiliki isi.");
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    showToast("File terlalu besar. Maksimal 3 MiB per file.");
    return;
  }
  const previous = uploadButton.innerHTML;
  uploadButton.disabled = true;
  uploadButton.textContent = "Mengunggah…";
  try {
    const headers = {
      ...(await authHeader()),
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
      "Idempotency-Key": crypto.randomUUID(),
    };
    if (parentId) headers["X-Parent-Id"] = parentId;
    const response = await fetch("/api/clouven-drive/files", { method: "POST", headers, body: file });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "File belum dapat diunggah.");
    await refreshAfterMutation("File berhasil diunggah.");
  } catch (error) {
    showToast(error.message || "File belum dapat diunggah.");
  } finally {
    uploadButton.disabled = false;
    uploadButton.innerHTML = previous;
  }
});

if (trashButton) {
  trashButton.addEventListener("click", () => setView(view === "trash" ? "active" : "trash"));
}

loadItems();
loadOverview();
