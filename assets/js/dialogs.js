import { startButtonLoading } from "./loading-ui.js";
import { authHeader } from "./auth.js";
import { escapeHTML, openModal, showToast } from "./utils.js";
import { instagramUsername } from "./instagram.js";

export async function postAction(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(payload),
  });
  const out = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      out.error || "Perubahan belum tersimpan. Silakan coba lagi.",
    );
  return out;
}

export function formDialog({
  title,
  description = "",
  fields = "",
  submitLabel = "Simpan perubahan",
  busyLabel = "Menyimpan…",
  trigger,
  onSubmit,
  success = "Perubahan disimpan.",
}) {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `<section class="modal action-modal"><button class="modal-close" type="button" data-close>×</button><p class="eyebrow">ruang kelas</p><h2>${escapeHTML(title)}</h2>${description ? `<p class="muted dialog-description">${escapeHTML(description)}</p>` : ""}<form><div class="form-grid">${fields}</div><p class="notice error" role="alert" data-error hidden></p><div class="form-actions"><button class="button button-light" type="button" data-close>Batal</button><button class="button button-coral" type="submit">${escapeHTML(submitLabel)}</button></div></form></section>`;
  const close = openModal(wrap, trigger),
    form = wrap.querySelector("form"),
    error = wrap.querySelector("[data-error]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (wrap.dataset.busy === "true") return;
    const payload = Object.fromEntries(new FormData(form));
    wrap.dataset.busy = "true";
    error.hidden = true;
    const button = form.querySelector('[type="submit"]');
    const controls = [...wrap.querySelectorAll("input,textarea,select,button")];
    const disabled = controls.map((el) => el.disabled);
    const loading = startButtonLoading(button, busyLabel);
    controls.forEach((el) => (el.disabled = true));
    try {
      await onSubmit(payload);
      wrap.dataset.busy = "false";
      close();
      showToast(success);
    } catch (e) {
      error.textContent =
        e.message || "Perubahan belum tersimpan. Silakan coba lagi.";
      error.hidden = false;
    } finally {
      wrap.dataset.busy = "false";
      loading.finish();
      controls.forEach((el, index) => (el.disabled = disabled[index]));
    }
  });
  return wrap;
}

export function field(
  name,
  label,
  value = "",
  { type = "text", max = 120, required = false, full = false, min = "" } = {},
) {
  const id = "field-" + crypto.randomUUID();
  return `<div class="form-field ${full ? "full" : ""}"><label for="${id}">${escapeHTML(label)}</label><input id="${id}" name="${name}" type="${type}" value="${escapeHTML(value)}" maxlength="${max}" ${min ? `minlength="${min}"` : ""} ${required ? "required" : ""} ${type === "password" ? 'autocomplete="new-password"' : ""}></div>`;
}

export function editBiodata(
  member,
  { self = false, trigger, onSaved = () => {} } = {},
) {
  return formDialog({
    title: self ? "Edit biodata saya" : "Edit biodata",
    description: member.name + " · " + member.username,
    fields:
      field("name", "Nama lengkap", member.name, {
        required: true,
      }) +
      (!self
        ? field("nickname", "Nama panggilan", member.nickname || "", {
            max: 40,
          })
        : "") +
      field("number", "Nomor absen", member.number, {
        max: 30,
      }) +
      field("classRole", "Peran di kelas", member.classRole, {
        max: 80,
      }) +
      field("photo", "URL foto", member.photo, {
        max: 1000,
      }) +
      field("quote", "Kutipan / tentang saya", member.quote, {
        max: 500,
        full: true,
      }) +
      (!self
        ? field("instagram", "Instagram", member.instagram || "", {
            max: 200,
            full: true,
          })
        : ""),
    trigger,
    onSubmit: async (payload) => {
      await postAction(
        self ? "/api/profile/update" : "/api/admin/update-user",
        self ? payload : { uid: member.id, ...payload },
      );
      onSaved(payload);
    },
    success: "Biodata berhasil diperbarui.",
  });
}

export function editInstagram(member, { trigger, onSaved = () => {} } = {}) {
  return formDialog({
    title: "Instagram saya",
    description:
      "Masukkan @username atau tautan profil Instagram. Kosongkan untuk menghapus tautan dari kartu anggota.",
    fields: field("instagram", "Akun Instagram", member.instagram || "", {
      max: 200,
      full: true,
    }),
    trigger,
    onSubmit: async (payload) => {
      payload.instagram = instagramUsername(payload.instagram);
      await postAction("/api/profile/instagram", payload);
      onSaved(payload);
    },
    success: "Instagram berhasil diperbarui.",
  });
}

export function resetPassword(member, trigger) {
  return formDialog({
    title: "Reset password",
    description:
      "Tetapkan password baru untuk " +
      member.name +
      ". Pengguna memakai password baru pada login berikutnya.",
    fields:
      field("password", "Password baru", "", {
        type: "password",
        required: true,
        max: 128,
        min: 6,
        full: true,
      }) +
      field("confirmPassword", "Ulangi password baru", "", {
        type: "password",
        required: true,
        max: 128,
        min: 6,
        full: true,
      }),
    trigger,
    submitLabel: "Reset password",
    onSubmit: async (payload) => {
      if (payload.password !== payload.confirmPassword)
        throw new Error("Kedua password harus sama.");
      await postAction("/api/admin/reset-password", {
        uid: member.id,
        password: payload.password,
      });
    },
    success: "Password pengguna berhasil direset.",
  });
}

export function deleteAccount(member, trigger, onSaved) {
  return formDialog({
    title: "Hapus akun pengguna",
    description:
      "Akun " +
      member.name +
      " beserta progres tugasnya akan dihapus. Ketik username " +
      member.username +
      " untuk mengonfirmasi.",
    fields: field("confirmation", "Konfirmasi username", "", {
      required: true,
      full: true,
    }),
    trigger,
    submitLabel: "Hapus akun",
    onSubmit: async (payload) => {
      if (payload.confirmation !== member.username)
        throw new Error("Username konfirmasi belum sesuai.");
      await postAction("/api/admin/delete-user", {
        uid: member.id,
        confirmation: payload.confirmation,
      });
      onSaved?.();
    },
    success: "Akun pengguna berhasil dihapus.",
  });
}
