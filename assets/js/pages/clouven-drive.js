import { requireAuth, authHeader } from "../auth.js";
import { bootShell } from "../bootstrap.js";
import { showToast } from "../utils.js";

const session = await requireAuth();
if (!session) throw new Error("redirect");
await bootShell("drive");

const notice = document.querySelector(".drive-foundation-notice");
const search = document.querySelector("#driveSearch");
const help = document.querySelector("#driveSearchHelp");
const list = document.querySelector(".drive-empty-state");
const folderButton = document.querySelector(".drive-primary-actions button");
const uploadButton = document.querySelector(".drive-primary-actions button:nth-child(2)");
const breadcrumb = document.querySelector(".drive-breadcrumb-current");
const breadcrumbNote = document.querySelector(".drive-breadcrumb-note");
const statValues = document.querySelectorAll(".drive-stat-value");
const statDescriptions = document.querySelectorAll(".drive-stat-card p");
const quotaBar = document.querySelector(".drive-stat-track span");
let parentId = null;
let searchTimer = null;
let activeController = null;
let loading = false;

if (notice) {
  notice.dataset.role = session.role;
  const description = notice.querySelector("p");
  if (description) description.textContent =
    "Daftar dan pencarian memakai metadata serta pemeriksaan akses server. Upload, unduh, perubahan file, Sampah, dan berbagi tetap dinonaktifkan sampai alur aman masing-masing tersedia.";
  const pill = notice.querySelector(".drive-stage-pill");
  if (pill) pill.textContent = "Metadata · bertahap";
}
if (folderButton) {
  folderButton.disabled = false;
  folderButton.title = "Buat folder pada lokasi saat ini";
}
if (uploadButton) {
  uploadButton.disabled = true;
  uploadButton.title = "Upload belum aktif sampai alur metadata dan rekonsiliasi siap";
}

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

function renderItems(items, query, truncated) {
  list.replaceChildren();
  list.classList.remove("drive-empty-state");
  if (!items.length) {
    list.classList.add("drive-empty-state");
    list.append(
      node("h3", "", query ? "Tidak ada hasil yang cocok" : "Folder ini masih kosong"),
      node("p", "", query
        ? "Coba kata kunci lain atau periksa ejaan nama file."
        : "Item yang dapat kamu akses akan muncul di lokasi ini.")
    );
    return;
  }

  const heading = node("h3", "drive-list-heading", query ? "Hasil pencarian" : "Isi folder");
  list.append(heading);
  const rows = node("div", "drive-item-list");
  for (const item of items) {
    const row = node("article", "drive-item-row");
    const icon = node("span", "drive-item-icon");
    const iconElement = node("i", item.item_type === "folder" ? "ti ti-folder" : "ti ti-file-description");
    iconElement.setAttribute("aria-hidden", "true");
    icon.append(iconElement);

    const details = node("div", "drive-item-details");
    const name = node(item.item_type === "folder" ? "button" : "strong", "drive-item-name", item.name);
    if (item.item_type === "folder") {
      name.type = "button";
      name.addEventListener("click", () => {
        parentId = item.id;
        if (search) search.value = "";
        loadItems();
      });
    }
    const metaParts = [item.item_type === "folder" ? "Folder" : bytesLabel(item.size_bytes)];
    if (item.updated_at) metaParts.push("Diperbarui " + new Date(item.updated_at).toLocaleDateString("id-ID"));
    details.append(name, node("p", "", metaParts.join(" · ")));
    row.append(icon, details);

    if (item.item_type === "folder") {
      const open = node("button", "drive-item-open");
      open.type = "button";
      open.title = "Buka folder";
      open.setAttribute("aria-label", "Buka folder " + item.name);
      const arrow = node("i", "ti ti-chevron-right");
      arrow.setAttribute("aria-hidden", "true");
      open.append(arrow);
      open.addEventListener("click", () => {
        parentId = item.id;
        if (search) search.value = "";
        loadItems();
      });
      row.append(open);
    } else {
      row.append(node("span", "drive-toolbar-hint", "Unduh belum aktif"));
    }
    rows.append(row);
  }
  list.append(rows);
  if (truncated) list.append(node("p", "drive-toolbar-hint", "Daftar dibatasi untuk menjaga respons tetap ringan."));
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

async function loadItems() {
  if (loading && activeController) activeController.abort();
  const controller = new AbortController();
  activeController = controller;
  loading = true;
  const query = (search?.value || "").trim();
  list.setAttribute("aria-busy", "true");
  if (help) help.textContent = "Memuat daftar…";
  if (breadcrumb) {
    breadcrumb.replaceChildren();
    const icon = node("i", "ti ti-cloud");
    icon.setAttribute("aria-hidden", "true");
    if (parentId) {
      const home = node("button", "drive-breadcrumb-home", "Drive saya");
      home.type = "button";
      home.addEventListener("click", () => {
        parentId = null;
        if (search) search.value = "";
        loadItems();
      });
      const separator = node("i", "ti ti-chevron-right");
      separator.setAttribute("aria-hidden", "true");
      const current = node("span", "drive-breadcrumb-current-label", "Folder terpilih");
      breadcrumb.append(icon, home, separator, current);
    } else {
      breadcrumb.append(icon, document.createTextNode("Drive saya"));
    }
  }
  if (breadcrumbNote) breadcrumbNote.textContent = parentId ? "Isi folder yang dipilih" : "Lokasi utama";
  try {
    const params = new URLSearchParams({ page: "1", limit: "50" });
    if (parentId) params.set("parentId", parentId);
    if (query) params.set("q", query);
    const response = await fetch("/api/clouven-drive/items?" + params.toString(), {
      headers: await authHeader(),
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Daftar Clouven Drive belum dapat dibaca.");
    renderItems(Array.isArray(data.items) ? data.items : [], query, Boolean(data.truncated || data.hasMore));
    if (help) help.textContent = query ? "Pencarian selesai." : "Hanya item yang diizinkan untuk akunmu yang ditampilkan.";
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

if (search) {
  search.addEventListener("input", () => {
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
      showToast("Folder berhasil dibuat.");
      await Promise.all([loadItems(), loadOverview()]);
    } catch (error) {
      showToast(error.message || "Folder belum dapat dibuat.");
    } finally {
      folderButton.disabled = false;
    }
  });
}

loadItems();
loadOverview();
