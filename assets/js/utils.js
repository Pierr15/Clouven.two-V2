export const DAYS = [
  { key: "monday", label: "Senin", short: "Sen", jsDay: 1 },
  { key: "tuesday", label: "Selasa", short: "Sel", jsDay: 2 },
  { key: "wednesday", label: "Rabu", short: "Rab", jsDay: 3 },
  { key: "thursday", label: "Kamis", short: "Kam", jsDay: 4 },
  { key: "friday", label: "Jumat", short: "Jum", jsDay: 5 },
];
export const SUBJECT_COLORS = ["#ffc857", "#9dc8d7", "#f2685e", "#b5c8ad", "#c5b4df", "#f3a86d"];

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export function escapeHTML(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export function escapeAttr(value = "") { return escapeHTML(value).replace(/`/g, "&#96;"); }
export function todayKey(date = new Date()) { return DAYS.find((day) => day.jsDay === date.getDay())?.key || null; }
export function dayInfo(key) { return DAYS.find((day) => day.key === key) || DAYS[0]; }
export function formatLongDate(date = new Date()) {
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}
export function formatShortDate(value) {
  if (!value) return "Belum ditentukan";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(date);
}
export function dateDiff(value) {
  const due = new Date(`${value}T12:00:00`);
  const today = new Date(); today.setHours(12,0,0,0);
  return Math.round((due - today) / 86400000);
}
export function relativeDue(value) {
  const diff = dateDiff(value);
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Besok";
  if (diff === -1) return "Lewat 1 hari";
  if (diff < 0) return `Lewat ${Math.abs(diff)} hari`;
  return `${diff} hari lagi`;
}
export function taskState(task, done = false) {
  if (done) return { label: "Selesai", cls: "is-done" };
  if (dateDiff(task.due) < 0) return { label: "Terlambat", cls: "is-late" };
  return { label: "Berjalan", cls: "" };
}
export function subjectColor(subject = "") {
  const sum = [...String(subject)].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return SUBJECT_COLORS[Math.abs(sum) % SUBJECT_COLORS.length];
}
export function uid(prefix = "id") { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }
export function showToast(message) {
  let toast = $("#toast");
  if (!toast) {
    toast = document.createElement("div"); toast.id = "toast"; toast.className = "toast";
    toast.setAttribute("role", "status"); toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.textContent = message; toast.classList.add("is-visible");
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 3000);
}
export function nextSchoolDates(count, from = new Date()) {
  const result = [];
  const cursor = new Date(from); cursor.setHours(12,0,0,0);
  while (result.length < count) {
    const day = cursor.getDay();
    if (day >= 1 && day <= 5) result.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}
export function initials(name = "Guest") {
  return String(name).split(/\s+/).filter(Boolean).slice(0,2).map((x) => x[0]).join("").toUpperCase() || "G";
}

export function openModal(wrap, trigger) {
  const dialog = wrap.querySelector(".modal");
  const closeButton = wrap.querySelector("[data-close]");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.tabIndex = -1;
  const heading = dialog.querySelector("h2");
  heading.id = "dialog-" + crypto.randomUUID();
  dialog.setAttribute("aria-labelledby", heading.id);
  closeButton.setAttribute("aria-label", "Tutup dialog");
  const background = [...document.querySelectorAll(".app-main, #sidebar")];
  const previous = background.map(el => el.inert);
  background.forEach(el => { el.inert = true; });
  document.body.classList.add("modal-open");
  function close() {
    if (wrap.dataset.busy === "true") return;
    document.removeEventListener("keydown", onKey);
    wrap.remove();
    background.forEach((el, i) => { el.inert = previous[i]; });
    document.body.classList.remove("modal-open");
    if (trigger?.isConnected) trigger.focus();
    else (document.querySelector('#taskForm input[name="title"]') || document.querySelector('.member-card, .app-main button'))?.focus();
  }
  function onKey(event) {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab") {
      const items = [...dialog.querySelectorAll("button, a[href], input, select, textarea, [tabindex='0']")].filter(el => !el.disabled && el.getAttribute("aria-hidden") !== "true" && el.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  wrap.addEventListener("click", event => {
    if (event.target === wrap || event.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(wrap);
  closeButton.focus();
  return close;
}
