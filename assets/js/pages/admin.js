import { startButtonLoading, withButtonLoading } from "../loading-ui.js";
import { styledName, referencedName } from "../styled-name.js";
import {
  editBiodata,
  resetPassword,
  deleteAccount,
  formDialog,
} from "../dialogs.js";
import { readCatalog, bindSubjectTeacher } from "../subject-catalog.js";
import { mountCatalogEditor } from "../catalog-editor.js";
import { scheduleMarkup, mountScheduleEditor } from "../schedule-editor.js";
import { mountTitleEditor } from "../title-editor.js";
import { createLoadState, showLoadState } from "../load-state.js";
import { requirePermission, hasRole, authHeader } from "../auth.js";
import { bootShell } from "../bootstrap.js";
import {
  DEFAULT_PROFILE,
  subscribeProfile,
  saveProfile,
  subscribeSchedule,
  saveSchedule,
  subscribeApelQueue,
  saveApelQueue,
  subscribeTasks,
  saveTask,
  deleteTask,
  subscribeMembers,
} from "../data.js";
import { DAYS, escapeHTML, showToast, uid } from "../utils.js";

const classMode = document.body.dataset.panelMode === "class";
const session = await requirePermission(classMode ? "manage_class" : "admin");
if (!session) throw new Error("redirect");
await bootShell(classMode ? "manage" : "admin");
let active = "profile",
  profile = { ...DEFAULT_PROFILE },
  day = "monday",
  schedule = { lessons: [], piket: [] },
  queue = [],
  tasks = [],
  members = [];
let offSchedule = null,
  titleEditor = null,
  scheduleEditor = null,
  taskBinding = null,
  catalog = [];
const panel = document.querySelector("#adminPanel");
let deferredRender = false;
panel.addEventListener("clouven:button-ready", () => {
  if (deferredRender && !panel.querySelector(".is-button-loading")) {
    deferredRender = false;
    render();
  }
});
const states = Object.fromEntries(
  [
    ["profile", "Informasi kelas"],
    ["schedule", "Jadwal"],
    ["apel", "Urutan apel"],
    ["tasks", "Daftar tugas"],
    ["users", "Daftar akun"],
    ["catalog", "Daftar mapel dan guru"],
  ].map(([key, label]) => [
    key,
    createLoadState("admin-" + key, label, () => {
      if (
        active === key ||
        (key === "users" && active === "apel") ||
        (key === "catalog" && ["tasks", "schedule"].includes(active))
      )
        render();
    }),
  ]),
);

function taskRows() {
  return (
    tasks
      .map(
        (t) =>
          `<div class="admin-list-item"><div><strong>${escapeHTML(t.title)}</strong><div class="muted" style="font-size:11px">${escapeHTML(t.subject || "Umum")} · ${escapeHTML(t.due || "—")}</div></div><div class="row-actions"><button class="mini-action" data-edit-task="${escapeHTML(t.id)}">Ubah</button><button class="mini-action" data-delete-task="${escapeHTML(t.id)}">Hapus</button></div></div>`,
      )
      .join("") ||
    `<div class="empty-state"><strong>Belum ada tugas.</strong>Buat tugas pertama di atas.</div>`
  );
}
function render() {
  if (panel.querySelector(".is-button-loading")) { deferredRender = true; return; }
  if (
    active === "schedule" &&
    panel.querySelector("#scheduleForm")?.dataset.day === day &&
    panel.querySelector("#scheduleForm")?.dataset.dirty === "true"
  )
    return;
  titleEditor?.destroy();
  titleEditor = null;
  scheduleEditor?.destroy();
  scheduleEditor = null;
  document
    .querySelectorAll("[data-admin-tab]")
    .forEach((b) =>
      b.classList.toggle("is-active", b.dataset.adminTab === active),
    );
  if (
    showLoadState(
      panel,
      states[active],
      ...(active === "apel"
        ? [states.users]
        : active === "schedule"
          ? [states.catalog, states.users]
          : active === "tasks"
            ? [states.catalog]
            : []),
    )
  )
    return;
  if (active === "catalog") {
    mountCatalogEditor(panel, catalog, (value) => {
      catalog = value;
    });
    return;
  }
  if (active === "tasks" && panel.querySelector("#taskForm")) {
    panel.querySelector(".admin-list").innerHTML = taskRows();
    return;
  }
  if (active === "profile")
    panel.innerHTML = `<div class="admin-section"><div class="card form-card"><p class="eyebrow">identitas kelas</p><h2>Info dasar kelas</h2><form id="profileForm"><div class="form-grid" style="margin-top:18px"><div class="form-field"><label for="admin-field-1">Nama kelas</label><input name="className" value="${escapeHTML(profile.className)}" id="admin-field-1"></div><div class="form-field"><label for="admin-field-2">Tahun ajaran</label><input name="schoolYear" value="${escapeHTML(profile.schoolYear)}" id="admin-field-2"></div><div class="form-field"><label for="admin-field-3">Sekolah</label><input name="school" value="${escapeHTML(profile.school)}" id="admin-field-3"></div><div class="form-field"><label for="admin-field-4">Wali kelas</label><input name="advisor" value="${escapeHTML(profile.advisor)}" id="admin-field-4"></div><div class="form-field"><label for="admin-field-5">Ketua kelas</label><input name="leader" value="${escapeHTML(profile.leader)}" id="admin-field-5"></div><div class="form-field"><label for="admin-field-6">Keterangan foto</label><input name="photoCaption" value="${escapeHTML(profile.photoCaption)}" id="admin-field-6"></div><div class="form-field"><label for="admin-field-7">Headline</label><input name="headline" value="${escapeHTML(profile.headline)}" id="admin-field-7"></div><div class="form-field"><label for="admin-field-8">Kata sorot</label><input name="emphasis" value="${escapeHTML(profile.emphasis)}" id="admin-field-8"></div><div class="form-field full"><label for="admin-field-9">Deskripsi</label><textarea name="description" id="admin-field-9">${escapeHTML(profile.description)}</textarea></div><div class="form-field full"><label for="admin-field-10">URL foto kelas</label><input name="classPhoto" value="${escapeHTML(profile.classPhoto || "")}" placeholder="https://..." id="admin-field-10"><p class="form-help">Foto kelas sebaiknya memakai link permanen atau file yang sudah diunggah ke Drive.</p></div></div><div class="form-actions"><button class="button button-coral" type="submit">Simpan info</button></div></form></div></div>`;
  if (active === "schedule") panel.innerHTML = scheduleMarkup(day);
  if (active === "apel")
    panel.innerHTML = `<div class="admin-section"><div class="card form-card"><p class="eyebrow">perubahan mendadak siap</p><h2>Urutan Pemimpin Apel</h2><p class="muted">Seret item atau gunakan tombol ↑ ↓. Item pertama selalu dianggap pemimpin berikutnya dan perubahan tersinkron realtime setelah disimpan.</p><form id="apelAdd" class="form-grid" style="margin-top:18px"><div class="form-field"><label for="admin-field-13">Tambah nama</label><input name="name" list="memberNames" placeholder="Nama siswa" id="admin-field-13"><datalist id="memberNames">${members.map((m) => `<option value="${escapeHTML(m.name)}">`).join("")}</datalist></div><div class="form-actions" style="align-items:end"><button class="button button-light" type="submit">+ Tambah ke urutan</button></div></form><div id="queueEditor" class="admin-list" style="margin-top:18px">${queue.map((x, i) => `<div class="admin-list-item queue-edit-item" draggable="true" data-queue-index="${i}"><span class="drag-handle">☰</span><span class="queue-number">${String(i + 1).padStart(2, "0")}</span><div><strong>${referencedName(x.memberId,x.name)}</strong>${i === 0 ? `<div class="queue-date">Pemimpin berikutnya</div>` : ""}</div><div class="row-actions"><button class="mini-action" data-q-up="${i}">↑</button><button class="mini-action" data-q-down="${i}">↓</button><button class="mini-action" data-q-next="${i}">Berikutnya</button><button class="mini-action" data-q-delete="${i}">×</button></div></div>`).join("") || `<div class="empty-state"><strong>Urutan masih kosong.</strong>Tambahkan nama di atas.</div>`}</div><div class="form-actions"><button class="button button-coral" id="saveQueue">Simpan urutan</button></div></div></div>`;
  if (active === "tasks")
    panel.innerHTML = `<div class="admin-section"><div class="card form-card"><p class="eyebrow">pusat tugas</p><h2>Kelola Tugas</h2><form id="taskForm"><input type="hidden" name="id"><div class="form-grid" style="margin-top:18px"><div class="form-field"><label for="admin-field-14">Judul</label><input name="title" required id="admin-field-14"></div><div class="form-field"><label for="admin-field-15">Mata pelajaran</label><select name="subject" required id="admin-field-15"></select></div><div class="form-field"><label for="admin-field-16">Deadline</label><input name="due" type="date" required id="admin-field-16"></div><div class="form-field"><label for="admin-field-17">Guru</label><select name="teacher" required id="admin-field-17"></select></div><div class="form-field full"><label for="admin-field-18">Deskripsi</label><textarea name="description" id="admin-field-18"></textarea></div></div><div class="form-actions"><button class="button button-coral" type="submit">Simpan tugas</button><button class="button button-light" type="reset">Kosongkan</button></div></form></div><div class="admin-list">${taskRows()}</div></div>`;
  if (active === "users" && !classMode)
    panel.innerHTML = hasRole(session.role, "developer")
      ? `<div class="admin-section"><div class="card form-card"><p class="eyebrow">developer only</p><h2>Buat Akun</h2><p class="muted">Buat akun untuk anggota kelas. Pengguna dapat masuk memakai username atau NIS.</p><form id="userForm"><div class="form-grid" style="margin-top:18px"><div class="form-field"><label for="admin-field-19">Nama</label><input name="name" required id="admin-field-19"></div><div class="form-field"><label for="admin-field-20">Username / NIS</label><input name="username" required id="admin-field-20"></div><div class="form-field"><label for="admin-field-21">Password awal</label><input name="password" type="password" minlength="6" required id="admin-field-21"></div><div class="form-field"><label for="admin-field-22">Role</label><select name="role" id="admin-field-22"><option value="student">Student</option><option value="class_officer">Class Officer</option><option value="teacher">Teacher</option><option value="developer">Developer</option></select></div><div class="form-field"><label for="admin-field-23">Nomor absen</label><input name="number" id="admin-field-23"></div><div class="form-field"><label for="admin-field-24">Peran kelas</label><input name="classRole" placeholder="Anggota / Ketua / ..." id="admin-field-24"></div></div><div class="form-actions"><button class="button button-dark" type="submit">Buat akun</button></div></form></div><div class="card form-card"><h3>Akun terdaftar</h3><div class="admin-list" style="margin-top:14px">${members.map((m) => `<div class="admin-list-item"><div><strong>${styledName(m)}</strong><div class="muted" style="font-size:11px">${escapeHTML(m.username || "—")} · ${escapeHTML(m.classRole || "Anggota")}</div></div><div class="row-actions"><button class="mini-action" data-biodata="${m.id}">Biodata</button>${m.id !== session.user.id ? `<button class="mini-action" data-reset-password="${m.id}">Reset password</button><button class="mini-action danger-action" data-delete-account="${m.id}">Hapus akun</button>` : ""}<select aria-label="Role ${escapeHTML(m.name)}" ${m.id === session.user.id ? "disabled" : ""} data-role-select="${m.id}" style="width:auto;padding:6px 8px;font-size:10px"><option value="student" ${m.role === "student" ? "selected" : ""}>Student</option><option value="class_officer" ${m.role === "class_officer" ? "selected" : ""}>Class Officer</option><option value="teacher" ${m.role === "teacher" ? "selected" : ""}>Teacher</option><option value="developer" ${m.role === "developer" ? "selected" : ""}>Developer</option></select>${m.id !== session.user.id ? `<button class="mini-action" data-update-user="${m.id}">Simpan role</button>` : ""}</div></div>`).join("") || `<div class="empty-state"><strong>Belum ada akun terdaftar.</strong>Buat akun pertama melalui formulir di atas.</div>`}</div><p class="form-help" style="margin-top:12px">Role disimpan di database dan langsung dipakai RLS. Hak akses baru berlaku pada request berikutnya.</p></div></div>`
      : `<div class="notice error">Hanya Developer yang dapat mengelola akun dan role.</div>`;
  if (active === "schedule")
    scheduleEditor = mountScheduleEditor(
      panel.querySelector("#scheduleForm"),
      schedule,
      catalog,
      members,
    );
  if (active === "tasks") {
    const form = panel.querySelector("#taskForm");
    taskBinding = bindSubjectTeacher(
      form.elements.subject,
      form.elements.teacher,
      catalog,
    );
    form.addEventListener("reset", () =>
      setTimeout(() => taskBinding?.reset(), 0),
    );
    if (!catalog.length) {
      const notice = document.createElement("p");
      notice.className = "notice";
      notice.textContent =
        "Isi daftar baru pada tab Mapel & Guru agar pilihan mapel dan guru tersedia.";
      form.prepend(notice);
    }
  }
  const profileForm = panel.querySelector("#profileForm");
  if (profileForm) titleEditor = mountTitleEditor(profileForm, profile);
}

function switchDay(next) {
  day = next;
  offSchedule?.();
  schedule = { lessons: [], piket: [] };
  states.schedule.label = `Jadwal ${DAYS.find((d) => d.key === day)?.label || day}`;
  offSchedule = subscribeSchedule(
    day,
    (v) => {
      schedule = v;
    },
    states.schedule.update,
  );
}

const catalogTab = document.createElement("button");
catalogTab.type = "button";
catalogTab.dataset.adminTab = "catalog";
catalogTab.textContent = "Mapel & Guru";
document.querySelector("#adminNav").append(catalogTab);
async function refreshCatalog() {
  states.catalog.update({
    status: "loading",
    hasData: catalog.length > 0,
    retry: refreshCatalog,
  });
  try {
    catalog = await readCatalog();
    states.catalog.update({ status: "ready", hasData: true });
  } catch {
    states.catalog.update({
      status: "error",
      hasData: false,
      retry: refreshCatalog,
    });
  }
}
refreshCatalog();
document.querySelector("#adminNav").addEventListener("click", (e) => {
  const b = e.target.closest("[data-admin-tab]");
  if (!b) return;
  if (classMode && b.dataset.adminTab === "users") return;
  active = b.dataset.adminTab;
  render();
});
panel.addEventListener("change", (e) => {
  if (e.target.getAttribute("id") === "adminDay") switchDay(e.target.value);
});
panel.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    if (e.target.getAttribute("id") === "profileForm") {
      const form = e.target;
      if (form.dataset.saving === "true") return;
      const payload = {
        ...profile,
        ...Object.fromEntries(new FormData(form).entries()),
        titleAnimation: titleEditor.read(),
      };
      const controls = [
          ...form.querySelectorAll("input,textarea,select,button"),
        ],
        disabled = controls.map((el) => el.disabled);
      const status = form.querySelector("#profileSaveStatus");
      const submit = form.querySelector('[type="submit"]');
      form.dataset.saving = "true";
      form.setAttribute("aria-busy", "true");
      status.hidden = true;
      const loading = startButtonLoading(submit);
      controls.forEach((el) => (el.disabled = true));
      try {
        await saveProfile(payload);
        profile = payload;
        showToast("Info kelas dan pengaturan judul diperbarui.");
      } catch (error) {
        status.textContent = "Perubahan belum tersimpan. " + error.message;
        status.hidden = false;
      } finally {
        form.dataset.saving = "false";
        form.setAttribute("aria-busy", "false");
        loading.finish();
        controls.forEach((el, i) => (el.disabled = disabled[i]));
      }
    }
    if (e.target.id === "scheduleForm") {
      const form = e.target;
      if (form.dataset.saving === "true") return;
      const error = form.querySelector("#scheduleError"),
        button = form.querySelector('[type="submit"]');
      error.hidden = true;
      let controls, disabled, loading;
      try {
        const value = scheduleEditor.read();
        form.dataset.saving = "true";
        controls = [...form.querySelectorAll("input,select,button")];
        disabled = controls.map((el) => el.disabled);
        loading = startButtonLoading(button);
        controls.forEach((el) => (el.disabled = true));
        await saveSchedule(day, value);
        schedule = value;
        form.dataset.dirty = "false";
        showToast("Jadwal dan piket diperbarui.");
        form.querySelector("#scheduleStatus").textContent =
          "Jadwal berhasil disimpan.";
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      } finally {
        form.dataset.saving = "false";
        loading?.finish();
        controls?.forEach((el, i) => (el.disabled = disabled[i]));
      }
    }
    if (e.target.getAttribute("id") === "apelAdd") {
      const name = new FormData(e.target).get("name")?.trim();
      if (name) {
        const matches = members.filter(member => member.name === name);
        queue = [...queue, { id: uid("apel"), name, memberId: matches.length === 1 ? matches[0].id : "" }];
        render();
      }
    }
    if (e.target.getAttribute("id") === "taskForm") {
      const f = Object.fromEntries(new FormData(e.target).entries());
      await withButtonLoading(e.target.querySelector('[type="submit"]'), async () => {
      await saveTask({
        id: f.id || undefined,
        title: f.title,
        subject: f.subject,
        due: f.due,
        teacher: f.teacher,
        description: f.description,
        status: "open",
      });
      e.target.reset();
      showToast("Tugas disimpan.");
      });
    }
    if (e.target.getAttribute("id") === "userForm") {
      const payload = Object.fromEntries(new FormData(e.target).entries());
      await withButtonLoading(e.target.querySelector('[type="submit"]'), async () => {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeader()),
        },
        body: JSON.stringify(payload),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Gagal membuat akun");
      e.target.reset();
      showToast(`Akun ${out.username} dibuat.`);
      }, "Membuat akun…");
    }
  } catch (err) {
    showToast(err.message);
  }
});
panel.addEventListener("click", async (e) => {
  const t = e.target.closest("button") || e.target;
  if (!classMode && session.role === "developer") {
    const member = members.find(
      (m) =>
        m.id ===
        (t.dataset.biodata ||
          t.dataset.resetPassword ||
          t.dataset.deleteAccount),
    );
    if (member && t.dataset.biodata)
      return editBiodata(member, {
        trigger: t,
        onSaved: () => states.users.retry?.(),
      });
    if (member && t.dataset.resetPassword) return resetPassword(member, t);
    if (member && t.dataset.deleteAccount)
      return deleteAccount(member, t, () => states.users.retry?.());
  }
  if (t.id === "saveQueue") {
    await withButtonLoading(t, async () => {
    try {
      await saveApelQueue(queue);
      showToast("Urutan pemimpin apel tersinkron realtime.");
    } catch (err) {
      showToast(err.message);
    }
    });
    return;
  }
  const move = (from, to) => {
    if (to < 0 || to >= queue.length) return;
    const copy = [...queue],
      [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    queue = copy;
    render();
  };
  if (t.dataset.qUp !== undefined)
    return move(Number(t.dataset.qUp), Number(t.dataset.qUp) - 1);
  if (t.dataset.qDown !== undefined)
    return move(Number(t.dataset.qDown), Number(t.dataset.qDown) + 1);
  if (t.dataset.qNext !== undefined) return move(Number(t.dataset.qNext), 0);
  if (t.dataset.qDelete !== undefined) {
    queue = queue.filter((_, i) => i !== Number(t.dataset.qDelete));
    render();
    return;
  }
  if (t.dataset.updateUser) {
    const uid = t.dataset.updateUser,
      select = panel.querySelector(`[data-role-select="${uid}"]`);
    await withButtonLoading(t, async () => {
    try {
      const res = await fetch("/api/admin/update-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeader()),
        },
        body: JSON.stringify({ uid, role: select?.value || "student" }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Gagal mengubah role");
      showToast("Role diperbarui. User mungkin perlu login ulang.");
    } catch (err) {
      showToast(err.message);
    }
    });
    return;
  }
  if (t.dataset.editTask) {
    const task = tasks.find((x) => x.id === t.dataset.editTask),
      form = panel.querySelector("#taskForm");
    if (!task || !form) return;
    Object.entries(task).forEach(([k, v]) => {
      if (form.elements[k] && !["subject", "teacher"].includes(k))
        form.elements[k].value = v ?? "";
    });
    taskBinding.set(task);
    form.scrollIntoView({ behavior: "smooth" });
    return;
  }
  if (t.dataset.deleteTask) {
    const task = tasks.find((item) => item.id === t.dataset.deleteTask);
    if (!task) return;
    formDialog({
      title: "Hapus tugas?",
      description:
        "Tugas “" +
        task.title +
        "” (" +
        (task.subject || "Umum") +
        ") beserta progres penyelesaian seluruh anggota akan dihapus. Tindakan ini tidak dapat dibatalkan.",
      trigger: t,
      submitLabel: "Hapus tugas",
      busyLabel: "Menghapus…",
      onSubmit: async () => {
        await deleteTask(task.id);
        const form = panel.querySelector("#taskForm");
        if (form?.elements.id.value === task.id) form.reset();
        await states.tasks.retry?.();
      },
      success: "Tugas berhasil dihapus.",
    });
  }
});
let dragIndex = null;
panel.addEventListener("dragstart", (e) => {
  const row = e.target.closest("[data-queue-index]");
  if (row) dragIndex = Number(row.dataset.queueIndex);
});
panel.addEventListener("dragover", (e) => {
  if (e.target.closest("[data-queue-index]")) e.preventDefault();
});
panel.addEventListener("drop", (e) => {
  const row = e.target.closest("[data-queue-index]");
  if (!row || dragIndex === null) return;
  e.preventDefault();
  const to = Number(row.dataset.queueIndex),
    copy = [...queue],
    [item] = copy.splice(dragIndex, 1);
  copy.splice(to, 0, item);
  queue = copy;
  dragIndex = null;
  render();
});

subscribeProfile((v) => {
  profile = v;
}, states.profile.update);
subscribeApelQueue((v) => {
  queue = v;
}, states.apel.update);
subscribeTasks((v) => {
  tasks = v;
}, states.tasks.update);
subscribeMembers((v) => {
  members = v;
}, states.users.update);
switchDay(day);
render();
