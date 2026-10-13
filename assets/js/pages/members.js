import { styledName } from "../styled-name.js";
import { instagramUrl } from "../instagram.js";
import { editInstagram, editBiodata } from "../dialogs.js";
import { createLoadState, showLoadState } from "../load-state.js";
import { bootShell } from "../bootstrap.js";\nimport { can } from "../permissions.js";
import { subscribeMembers } from "../data.js?v=member-sort-1";
import { escapeHTML, initials, openModal, showToast } from "../utils.js";
import { uploadProfilePhoto, removeProfilePhoto } from "../profile-photo.js";

const session = await bootShell("members");
const signedIn = Boolean(session?.user);
const guestMode = !signedIn;
let members = [];
let photoTargetId = "";
let photoTargetClose = null;
const listState = createLoadState("members", "Daftar anggota", render);
const photoInput = document.createElement("input");
photoInput.type = "file";
photoInput.accept = "image/gif,image/webp,image/png,image/jpeg";
photoInput.hidden = true;
photoInput.setAttribute("aria-label", "Pilih foto profil anggota");
document.body.appendChild(photoInput);

function avatar(member) {
  return member.photo || `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 250"><rect width="300" height="250" fill="#d8e5d1"/><circle cx="150" cy="105" r="52" fill="#f3c69f"/><path d="M70 250q15-92 80-92t80 92" fill="#284b3d"/><text x="150" y="225" text-anchor="middle" fill="#fff" font-family="Arial" font-size="30" font-weight="700">${escapeHTML(initials(member.name))}</text></svg>`)}`;
}
function memberCard(m) {
  return `<button class="member-card" data-member="${escapeHTML(m.id)}"><span class="member-photo${m.role === "developer" ? " is-developer" : ""}"><img src="${escapeHTML(avatar(m))}" alt="Foto ${escapeHTML(m.name)}"></span><span class="member-card-copy"><h3>${styledName(m)}</h3><p>${escapeHTML(m.roleLabel || m.classRole || "Anggota")}</p>${!guestMode && m.instagram ? `<span class="member-instagram"><i class="ti ti-brand-instagram" aria-hidden="true"></i> @${escapeHTML(m.instagram)}</span>` : ""}</span></button>`;
}
function isHomeroomTeacher(member) {
  return String(member.classRole || "").replace(/\s+/g, "").toLowerCase() === "walikelas";
}
function render() {
  const grid = document.querySelector("#memberGrid");
  const homeroom = document.querySelector("#homeroomCard");
  if (showLoadState(grid, listState)) {
    homeroom.hidden = true;
    homeroom.replaceChildren();
    return;
  }
  const teachers = members.filter(isHomeroomTeacher);
  const classmates = members.filter(member => !isHomeroomTeacher(member));
  homeroom.innerHTML = teachers.map(memberCard).join("");
  homeroom.hidden = teachers.length === 0;
  grid.innerHTML = classmates.length ? classmates.map(memberCard).join("") :
    '<div class="empty-state"><strong>Belum ada anggota.</strong>Daftar akan muncul setelah Developer membuat akun.</div>';
}
async function loadPublicMembers() {
  listState.update({ status: "loading", hasData: members.length > 0, retry: loadPublicMembers });
  try {
    const response = await fetch("/api/public/member-photos", { headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data.error || "Daftar foto profil belum tersedia.");
    members = Array.isArray(data) ? data : [];
    listState.update({ status: "ready", hasData: true, retry: loadPublicMembers });
  } catch (error) {
    console.error("Gagal memuat direktori foto publik:", error);
    listState.update({ status: "error", hasData: false, retry: loadPublicMembers });
  }
}
if (signedIn) subscribeMembers(v => { members = v; }, listState.update);
else loadPublicMembers();

photoInput.addEventListener("change", async () => {
  const file = photoInput.files?.[0];
  if (!file || !can(session.role, "manage_member_photos") || !photoTargetId) return;
  try {
    await uploadProfilePhoto(photoTargetId, file);
    showToast("Foto profil anggota berhasil diperbarui.");
    photoTargetClose?.();
    await listState.retry?.();
  } catch (error) {
    showToast(error.message || "Foto profil gagal diperbarui.");
  } finally {
    photoInput.value = "";
    photoTargetId = "";
    photoTargetClose = null;
  }
});

document.querySelector(".page-section").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-member]");
  if (!button) return;
  const m = members.find(x => x.id === button.dataset.member);
  if (!m) return;
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  const photoAdminControls = can(session.role, "manage_member_photos") ? `<div class="form-actions" style="margin-top:16px"><button class="button button-light" type="button" data-photo-change="${escapeHTML(m.id)}">Ganti foto profil</button>${m.photo ? '<button class="button button-light" type="button" data-photo-remove>Hapus foto profil</button>' : ""}</div>` : "";
  const details = guestMode
    ? `<p class="muted">${escapeHTML(m.roleLabel || m.classRole || "Anggota kelas")}</p>`
    : `<p class="muted">${escapeHTML(m.classRole || "Anggota")} · ${escapeHTML(m.role || "student")}</p><div class="grid grid-2"><div class="card form-card"><strong>Nomor absen</strong><p class="muted">${escapeHTML(m.number || "—")}</p></div><div class="card form-card"><strong>Username / NIS</strong><p class="muted">${escapeHTML(m.username || "—")}</p></div></div>${m.instagram ? `<p class="member-instagram"><a href="${escapeHTML(instagramUrl(m.instagram))}" target="_blank" rel="noopener noreferrer"><i class="ti ti-brand-instagram" aria-hidden="true"></i> @${escapeHTML(m.instagram)}</a></p>` : ""}${m.id === session.user?.id || session.role === "developer" ? '<button class="button button-light" type="button" data-edit-instagram>Edit Instagram</button>' : ""}${m.quote ? `<p style="margin-top:18px;font-family:var(--font-serif);font-style:italic">“${escapeHTML(m.quote)}”</p>` : ""}${photoAdminControls}`;
  wrap.innerHTML = `<div class="modal"><div class="modal-head"><div><p class="eyebrow">${guestMode ? "profil publik" : "anggota kelas"}</p><h2>${styledName(m)}</h2></div><button class="icon-button" type="button" data-close aria-label="Tutup">×</button></div><div style="display:flex;justify-content:center;margin:14px 0 20px"><img src="${escapeHTML(avatar(m))}" alt="Foto ${escapeHTML(m.name)}" style="width:112px;height:112px;object-fit:cover;border-radius:50%"></div>${details}</div>`;
  const close = openModal(wrap, button);
  wrap.querySelector("[data-edit-instagram]")?.addEventListener("click", () => {
    close();
    if (m.id === session.user.id) editInstagram(m, { trigger: button, onSaved: () => listState.retry?.() });
    else editBiodata(m, { trigger: button, onSaved: () => listState.retry?.() });
  });
  wrap.querySelector("[data-photo-change]")?.addEventListener("click", () => {
    photoTargetId = m.id;
    photoTargetClose = close;
    photoInput.click();
  });
  wrap.querySelector("[data-photo-remove]")?.addEventListener("click", async () => {
    if (!confirm(`Hapus foto profil ${m.name}?`)) return;
    const removeButton = wrap.querySelector("[data-photo-remove]");
    if (removeButton) removeButton.disabled = true;
    try {
      await removeProfilePhoto(m.id);
      showToast("Foto profil anggota berhasil dihapus.");
      close();
      await listState.retry?.();
    } catch (error) {
      showToast(error.message || "Foto profil gagal dihapus.");
      if (removeButton) removeButton.disabled = false;
    }
  });
});
