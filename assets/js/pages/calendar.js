import { bootShell } from "../bootstrap.js";
import { requireAuth } from "../auth.js";
import { can } from "../permissions.js";
import {
  listCalendarEvents,
  getCalendarEvent,
  saveCalendarEvent,
  deleteCalendarEvent,
  subscribeTaskSummaries,
} from "../data.js";
import { escapeHTML, showToast, formatLongDate, openModal } from "../utils.js";
import { deadlineLabel } from "../deadline.js";
import { formDialog } from "../dialogs.js";
import { supabase } from "../supabase.js";

const session = await requireAuth();
if (!session) throw new Error("redirect");
await bootShell("calendar");
const canEdit = can(session.role, "edit_calendar");
document.querySelector("#calendarAdd").hidden = !canEdit;
const today = new Date();

let month = new Date(today.getFullYear(), today.getMonth(), 1);
let selected = new Date(today.getFullYear(), today.getMonth(), today.getDate());

let events = [];
let tasks = [];
let loading = true;
let error = null;
let taskReady = false;
let monthTransitioning = false;

const PRELOAD_RADIUS = 2;

const monthCache = new Map();

const grid = document.querySelector("#calendarGrid");
const details = document.querySelector("#calendarDetails");
const monthLabel = document.querySelector("#calendarMonth");
const prevButton = document.querySelector("#calendarPrev");
const nextButton = document.querySelector("#calendarNext");
const todayButton = document.querySelector("#calendarToday");

const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

const sameDay = (a, b) => dateKey(a) === dateKey(b);

/* =========================================================
   MONTH CACHE / PRELOADING
   ========================================================= */

const monthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const monthAt = (date, offset = 0) =>
  new Date(date.getFullYear(), date.getMonth() + offset, 1);

const monthIndex = (date) => date.getFullYear() * 12 + date.getMonth();

const monthsAround = (center) =>
  Array.from({ length: PRELOAD_RADIUS * 2 + 1 }, (_, index) =>
    monthAt(center, index - PRELOAD_RADIUS),
  );

function eventOverlapsMonth(event, targetMonth) {
  const start = monthAt(targetMonth);
  const end = monthAt(targetMonth, 1);

  return new Date(event.start_at) < end && new Date(event.end_at) > start;
}

function writeRangeToCache(rows, rangeStart, rangeEnd) {
  for (
    let cursor = new Date(rangeStart);
    cursor < rangeEnd;
    cursor = monthAt(cursor, 1)
  ) {
    const currentMonth = new Date(cursor);

    monthCache.set(
      monthKey(currentMonth),
      rows.filter((event) => eventOverlapsMonth(event, currentMonth)),
    );
  }
}

function syncEventsFromCache(center = month) {
  const deduplicated = new Map();

  for (const cachedMonth of monthsAround(center)) {
    const cachedEvents = monthCache.get(monthKey(cachedMonth)) ?? [];

    for (const event of cachedEvents) {
      deduplicated.set(event.id, event);
    }
  }

  events = [...deduplicated.values()].sort(
    (a, b) => new Date(a.start_at) - new Date(b.start_at),
  );
}

/*
 * Mengambil 2 bulan sebelum + bulan aktif + 2 bulan setelah.
 *
 * Initial September:
 * Juli, Agustus, September, Oktober, November
 *
 * Saat pindah ke Oktober, hanya Desember yang belum ada sehingga
 * request berikutnya cukup mengambil Desember.
 */
async function preloadCalendarWindow(center, { force = false } = {}) {
  const wantedMonths = monthsAround(center);

  const monthsToFetch = force
    ? wantedMonths
    : wantedMonths.filter(
        (targetMonth) => !monthCache.has(monthKey(targetMonth)),
      );

  if (!monthsToFetch.length) {
    return;
  }

  const rangeStart = monthAt(monthsToFetch[0]);

  const rangeEnd = monthAt(monthsToFetch[monthsToFetch.length - 1], 1);

  const rows = await listCalendarEvents(
    rangeStart.toISOString(),
    rangeEnd.toISOString(),
  );

  /*
   * Jika range berisi lebih dari satu bulan, pecah hasil query ke
   * cache masing-masing bulan.
   */
  writeRangeToCache(rows, rangeStart, rangeEnd);
}

/*
 * Dipakai hanya ketika user berpindah terlalu cepat ke bulan yang
 * belum sempat masuk cache.
 */
async function ensureMonthLoaded(targetMonth) {
  const key = monthKey(targetMonth);

  if (monthCache.has(key)) {
    return;
  }

  const start = monthAt(targetMonth);
  const end = monthAt(targetMonth, 1);

  const rows = await listCalendarEvents(start.toISOString(), end.toISOString());

  monthCache.set(key, rows);
}

/* =========================================================
   MONTH TRANSITION
   ========================================================= */

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function setMonthTransition(value = null) {
  for (const element of [grid, monthLabel]) {
    if (!element) continue;

    if (value) {
      element.dataset.monthTransition = value;
    } else {
      delete element.dataset.monthTransition;
    }
  }
}

function waitForMonthAnimation() {
  if (reducedMotion.matches) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let finished = false;

    const done = () => {
      if (finished) return;

      finished = true;
      clearTimeout(fallback);
      grid.removeEventListener("animationend", done);

      resolve();
    };

    const fallback = setTimeout(done, 320);

    grid.addEventListener("animationend", done, {
      once: true,
    });
  });
}

async function animateMonthChange(direction, update) {
  if (reducedMotion.matches) {
    update();
    return;
  }

  setMonthTransition(`out-${direction}`);
  await waitForMonthAnimation();

  update();

  /*
   * Pastikan browser menganggap fase masuk sebagai animation baru.
   */
  setMonthTransition(null);
  void grid.offsetWidth;

  setMonthTransition(`in-${direction}`);
  await waitForMonthAnimation();

  setMonthTransition(null);
}

function setCalendarNavigationDisabled(disabled) {
  prevButton.disabled = disabled;
  nextButton.disabled = disabled;
  todayButton.disabled = disabled;
}

async function navigateToMonth(
  targetMonth,
  {
    selectedDate = new Date(
      targetMonth.getFullYear(),
      targetMonth.getMonth(),
      1,
    ),
  } = {},
) {
  if (monthTransitioning) return;

  const target = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);

  const currentIndex = monthIndex(month);
  const targetIndex = monthIndex(target);

  /*
   * Bulan sama: tidak perlu animasi.
   * Contohnya tombol "Hari ini" ketika masih berada di bulan aktif.
   */
  if (targetIndex === currentIndex) {
    selected = new Date(selectedDate);
    syncEventsFromCache(month);
    render();
    return;
  }

  const direction = targetIndex > currentIndex ? "next" : "prev";

  monthTransitioning = true;
  setCalendarNavigationDisabled(true);

  try {
    /*
     * Normalnya bulan tujuan sudah tersedia karena kita preload ±2 bulan.
     * ensureMonthLoaded hanya menjadi fallback kalau user berpindah cepat.
     */
    await ensureMonthLoaded(target);

    await animateMonthChange(direction, () => {
      month = target;
      selected = new Date(selectedDate);

      error = null;
      loading = false;

      syncEventsFromCache(month);
      render();
    });

    /*
     * Tidak ditunggu supaya UI tetap instan.
     * Setelah pindah bulan, cache otomatis diperpanjang lagi ±2 bulan.
     */
    void preloadCalendarWindow(month).catch((preloadError) => {
      console.error("Calendar background preload failed:", preloadError);
    });
  } catch (navigationError) {
    console.error(navigationError);
    showToast("Bulan tersebut belum dapat dimuat.");
  } finally {
    setMonthTransition(null);
    setCalendarNavigationDisabled(false);
    monthTransitioning = false;
  }
}
const dateTimeLocal = (value) => {
  const d = new Date(value);
  return `${dateKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const category = {
  exam: "Ujian",
  event: "Kegiatan",
  holiday: "Libur",
  meeting: "Rapat",
  practice: "Praktik",
  other: "Lainnya",
};
function combined() {
  return [
    ...events.map((e) => ({
      ...e,
      kind: e.event_type,
      date: new Date(e.start_at),
    })),
    ...tasks
      .filter((t) => t.due && t.status !== "archived")
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.subject,
        kind: "assignment",
        date: new Date(t.due_at || `${t.due}T12:00:00`),
        due: t.due_at || t.due,
      })),
  ];
}
function itemsOn(day) {
  return combined().filter((item) =>
    item.kind === "assignment"
      ? sameDay(item.date, day)
      : new Date(item.start_at) <
          new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1) &&
        new Date(item.end_at) >
          new Date(day.getFullYear(), day.getMonth(), day.getDate()),
  );
}
function render() {
  document.querySelector("#calendarMonth").textContent =
    new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
      month,
    );
  if (loading) {
    grid.innerHTML =
      '<div class="data-state is-loading">Kalender sedang dimuat…</div>';
    details.innerHTML =
      '<div class="data-state is-loading">Agenda sedang dimuat…</div>';
    return;
  }
  if (error) {
    grid.innerHTML =
      '<div class="data-state is-error">Kalender gagal dimuat. <button class="button button-light button-small" data-retry>Coba lagi</button></div>';
    details.innerHTML = "";
    return;
  }
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const length = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  grid.innerHTML = Array.from({ length: offset + length }, (_, i) => {
    if (i < offset)
      return '<span class="calendar-spacer" aria-hidden="true"></span>';
    const d = new Date(month.getFullYear(), month.getMonth(), i - offset + 1),
      items = itemsOn(d);
    return `<button type="button" class="calendar-day ${sameDay(d, selected) ? "is-selected" : ""} ${sameDay(d, today) ? "is-today" : ""}" data-date="${dateKey(d)}" aria-label="${escapeHTML(formatLongDate(d))}, ${items.length} agenda" aria-selected="${sameDay(d, selected)}"><strong>${d.getDate()}</strong><span class="calendar-dots">${items
      .slice(0, 3)
      .map(
        (item) =>
          `<i class="calendar-dot ${item.kind}" aria-hidden="true"></i>`,
      )
      .join(
        "",
      )}</span><small>${items.length ? `${items.length} agenda` : ""}</small></button>`;
  }).join("");
  const items = itemsOn(selected).sort((a, b) => a.date - b.date);
  details.innerHTML = `<p class="eyebrow">tanggal dipilih</p><h3>${escapeHTML(formatLongDate(selected))}</h3>${items.length ? items.map((item) => `<article class="calendar-event ${item.kind}"><span class="notification-type">${item.kind === "assignment" ? "Tugas" : category[item.kind]}</span><h4>${escapeHTML(item.title)}</h4><p>${escapeHTML(item.description || "Tanpa keterangan.")}</p>${item.kind === "assignment" ? `<span>${deadlineLabel(item.due)}</span><a class="text-button" href="/tugas/?task=${encodeURIComponent(item.id)}">Lihat tugas →</a>` : `<p>${item.all_day ? "Sepanjang hari" : new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(item.date)}${item.location ? ` · ${escapeHTML(item.location)}` : ""}</p>${canEdit ? `<div class="row-actions"><button class="mini-action" data-edit="${item.id}">Ubah</button><button class="mini-action danger-action" data-delete="${item.id}">Hapus</button></div>` : ""}`}</article>`).join("") : '<div class="empty-state"><strong>Belum ada agenda.</strong>Pilih tanggal lain atau tambahkan kegiatan kelas.</div>'}`;
}
async function load({ force = false, showLoading = true } = {}) {
  const alreadyCached = monthCache.has(monthKey(month));

  /*
   * Loading screen hanya muncul ketika belum ada data sama sekali.
   * Refresh background tidak membuat kalender berkedip.
   */
  if (showLoading && !alreadyCached) {
    loading = true;
    error = null;
    render();
  }

  try {
    await preloadCalendarWindow(month, {
      force,
    });

    syncEventsFromCache(month);

    error = null;
  } catch (loadError) {
    console.error(loadError);

    /*
     * Jika cache lama masih tersedia, tetap tampilkan kalender
     * daripada menggantinya dengan error screen.
     */
    if (!monthCache.has(monthKey(month))) {
      error = loadError;
    }
  } finally {
    loading = false;
    render();
  }
}
function eventDialog(item = null) {
  if (!canEdit) return;
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  const start = item
      ? dateTimeLocal(item.start_at)
      : `${dateKey(selected)}T08:00`,
    end = item
      ? dateTimeLocal(
          item.all_day
            ? new Date(new Date(item.end_at).getTime() - 1)
            : item.end_at,
        )
      : `${dateKey(selected)}T09:00`;
  wrap.innerHTML = `<div class="modal calendar-modal"><div class="modal-head"><div><p class="eyebrow">agenda kelas</p><h2>${item ? "Ubah kegiatan" : "Kegiatan baru"}</h2></div><button type="button" class="icon-button" data-close>×</button></div><form id="eventForm" class="form-grid"><div class="form-field full"><label>Judul<input name="title" maxlength="160" required value="${escapeHTML(item?.title || "")}"></label></div><div class="form-field"><label>Kategori<select name="event_type">${Object.entries(
    category,
  )
    .map(
      ([v, label]) =>
        `<option value="${v}" ${item?.event_type === v ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label></div><div class="form-field"><label>Lokasi<input name="location" maxlength="160" value="${escapeHTML(item?.location || "")}"></label></div><div class="form-field"><label>Mulai<input name="start_at" type="datetime-local" required value="${start}"></label></div><div class="form-field"><label>Selesai<input name="end_at" type="datetime-local" required value="${end}"></label></div><div class="form-field full"><label>Deskripsi<textarea name="description" maxlength="4000">${escapeHTML(item?.description || "")}</textarea></label></div><div class="form-field"><label><input type="checkbox" name="all_day" ${item?.all_day ? "checked" : ""}> Sepanjang hari</label></div><div class="form-field"><label><input type="checkbox" name="notification_enabled" ${item?.notification_enabled ? "checked" : ""}> Ingatkan anggota</label></div><div class="form-field"><label>Waktu pengingat<select name="notification_offset">${[
    [0, "Saat mulai"],
    [10, "10 menit sebelumnya"],
    [30, "30 menit sebelumnya"],
    [60, "1 jam sebelumnya"],
    [1440, "1 hari sebelumnya"],
  ]
    .map(
      ([n, s]) =>
        `<option value="${n}" ${Number(item?.notification_offset ?? 60) === n ? "selected" : ""}>${s}</option>`,
    )
    .join(
      "",
    )}</select></label></div><div class="form-actions full"><button class="button button-coral" type="submit">Simpan kegiatan</button></div></form></div>`;
  const close = openModal(wrap, document.activeElement);
  wrap.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      button = f.querySelector('[type="submit"]'),
      values = Object.fromEntries(new FormData(f));
    let startAt = new Date(values.start_at),
      endAt = new Date(values.end_at);
    if (f.elements.all_day.checked) {
      const [sy, sm, sd] = values.start_at.slice(0, 10).split("-").map(Number),
        [ey, em, ed] = values.end_at.slice(0, 10).split("-").map(Number);
      startAt = new Date(sy, sm - 1, sd);
      endAt = new Date(ey, em - 1, ed + 1);
    }
    if (!(endAt > startAt)) {
      showToast("Waktu selesai harus setelah mulai.");
      return;
    }
    button.disabled = true;
    wrap.dataset.busy = "true";
    try {
      await saveCalendarEvent({
        id: item?.id,
        title: values.title.trim(),
        description: values.description.trim(),
        event_type: values.event_type,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        location: values.location.trim(),
        all_day: f.elements.all_day.checked,
        notification_enabled: f.elements.notification_enabled.checked,
        notification_offset: Number(values.notification_offset),
        ...(!item ? { created_by: session.user.id } : {}),
      });
      wrap.dataset.busy = "false";
      close();
      showToast("Kegiatan tersimpan.");
      await load({
        force: true,
        showLoading: false,
      });
    } catch (err) {
      wrap.dataset.busy = "false";
      button.disabled = false;
      showToast("Gagal menyimpan: " + err.message);
    }
  });
}
prevButton.onclick = () => {
  const target = monthAt(month, -1);

  navigateToMonth(target);
};

nextButton.onclick = () => {
  const target = monthAt(month, 1);

  navigateToMonth(target);
};

todayButton.onclick = () => {
  const target = new Date(today.getFullYear(), today.getMonth(), 1);

  const todayDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  navigateToMonth(target, {
    selectedDate: todayDate,
  });
};
document.querySelector("#calendarAdd").onclick = () => eventDialog();
grid.addEventListener("click", (e) => {
  if (e.target.closest("[data-retry]")) return load();
  const b = e.target.closest("[data-date]");
  if (!b) return;
  const [y, m, d] = b.dataset.date.split("-").map(Number);
  selected = new Date(y, m - 1, d);
  render();
});
details.addEventListener("click", (e) => {
  const edit = e.target.closest("[data-edit]");
  if (edit) return eventDialog(events.find((x) => x.id === edit.dataset.edit));
  const del = e.target.closest("[data-delete]");
  if (!del || !canEdit) return;
  const item = events.find((x) => x.id === del.dataset.delete);
  if (!item) return;
  formDialog({
    title: "Hapus kegiatan?",
    description: item.title,
    submitLabel: "Hapus kegiatan",
    busyLabel: "Menghapus…",
    trigger: del,
    success: "Kegiatan dihapus.",
    onSubmit: async () => {
      await deleteCalendarEvent(item.id);
      await load({
        force: true,
        showLoading: false,
      });
    },
  });
});
subscribeTaskSummaries(
  (value) => {
    tasks = value;
    taskReady = true;
    render();
  },
  (state) => {
    if (state.status === "error" && !taskReady)
      showToast("Tenggat tugas belum dapat dimuat.");
  },
);
await load({
  force: true,
  showLoading: false,
});
const live = supabase
  .channel("calendar-events-page")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "calendar_events",
    },
    () => {
      void load({
        force: true,
        showLoading: false,
      });
    },
  )
  .subscribe();
addEventListener("pagehide", () => supabase.removeChannel(live), {
  once: true,
});
const requested = new URLSearchParams(location.search).get("event");
if (requested && /^[0-9a-f-]{36}$/i.test(requested)) {
  try {
    const item =
      events.find((x) => x.id === requested) ||
      (await getCalendarEvent(requested));
    if (item) {
      const requestedDate = new Date(item.start_at);

      const requestedMonth = new Date(
        requestedDate.getFullYear(),
        requestedDate.getMonth(),
        1,
      );

      if (monthIndex(requestedMonth) !== monthIndex(month)) {
        await navigateToMonth(requestedMonth, {
          selectedDate: requestedDate,
        });
      } else {
        selected = requestedDate;
        render();
      }
    }
  } catch (error) {
    showToast("Kegiatan yang dituju belum dapat dimuat.");
  }
}
