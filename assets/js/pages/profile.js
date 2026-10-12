import { withButtonLoading } from "../loading-ui.js";
import { styledName, publishNameProfiles } from "../styled-name.js";
import { mountNameSettings } from "../name-settings.js";
import { can } from "../permissions.js";
import {instagramUrl} from "../instagram.js";
import { editBiodata, editInstagram } from "../dialogs.js";
import { createLoadState, showLoadState } from "../load-state.js";
import { supabase } from "../supabase.js";
import { requireAuth, logout, ROLE_LABEL } from "../auth.js";
import { bootShell } from "../bootstrap.js";
import { subscribeMember, subscribeProgress } from "../data.js";
import { escapeHTML, showToast } from "../utils.js";
import {browserPermission,browserEnabled,setBrowserEnabled,readPreferences,savePreferences} from "../notifications.js";

const session = await requireAuth(); if (!session) throw new Error("redirect");
await bootShell("profile");
let member = session.profile, progress = {};
const memberState = createLoadState("profile-member", "Profil", render);
const progressState = createLoadState("profile-progress", "Ringkasan tugas", render);
const nameSettings = mountNameSettings(document.querySelector("#nameSettings"), member, () => memberState.retry?.());
const shortcut = document.querySelector("#adminShortcut");
shortcut.hidden = !can(session.role, "manage_class");
shortcut.href = can(session.role, "admin") ? "/admin/" : "/kelola/";
shortcut.textContent = can(session.role, "admin") ? "Admin Panel →" : "Kelola Kelas →";
const developerAvatar = session.role === "developer";
const avatarInput = document.createElement("input");
avatarInput.type = "file";
avatarInput.accept = "image/gif,image/webp,image/png,image/jpeg";
avatarInput.hidden = true;
avatarInput.id = "developerAvatarInput";
document.body.appendChild(avatarInput);
let avatarBusy = false;
function avatarControls() {
  if (!developerAvatar) return "";
  const current = session.user?.user_metadata?.avatar_url || "";
  return `<section class="developer-avatar-settings" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:18px 0;padding:16px;border:1px solid var(--line,rgba(120,120,120,.25));border-radius:16px">
    <div style="width:72px;height:72px;flex:0 0 72px;border-radius:50%;overflow:hidden;background:var(--surface,rgba(120,120,120,.1));display:grid;place-items:center">
      ${current ? `<img src="${escapeHTML(current)}" alt="Avatar developer" style="width:100%;height:100%;object-fit:cover">` : '<i class="ti ti-user-code" aria-hidden="true" style="font-size:30px"></i>'}
    </div>
    <div style="flex:1;min-width:180px"><strong>Foto profil developer</strong><p class="muted" style="margin:5px 0 10px">GIF, WebP animasi, PNG, atau JPG · maksimal 2 MB.</p>
      <div class="form-actions"><button class="button button-light" type="button" id="chooseDeveloperAvatar">${current ? "Ganti avatar" : "Pilih avatar"}</button>${current ? '<button class="button button-light" type="button" id="removeDeveloperAvatar">Hapus</button>' : ""}</div>
      <p class="form-help" id="developerAvatarStatus" role="status" aria-live="polite"></p>
    </div>
  </section>`;
}
function render() {
  const host = document.querySelector("#profileCard");
  if (showLoadState(host, memberState, progressState)) return;
  if (!member) { host.innerHTML = '<div class="empty-state"><strong>Profil belum tersedia.</strong>Hubungi pengurus untuk melengkapi data akunmu.</div>'; return; }
  const done = Object.values(progress).filter((x) => x.done).length;
  document.querySelector("#profileCard").innerHTML = `<div class="card form-card"><p class="eyebrow">akun saya</p><h2>${styledName(member)}</h2><p class="muted">${ROLE_LABEL[member.role]} · ${escapeHTML(member?.classRole || "Anggota kelas")}</p><div class="grid grid-3" style="margin-top:22px"><div class="result-cell"><span>Nomor absen</span><strong>${escapeHTML(member?.number || "—")}</strong></div><div class="result-cell"><span>Username / NIS</span><strong>${escapeHTML(member?.username || "—")}</strong></div><div class="result-cell"><span>Tugas selesai</span><strong>${done}</strong></div></div>${member.instagram ? `<p class="member-instagram"><a href="${escapeHTML(instagramUrl(member.instagram))}" target="_blank" rel="noopener noreferrer"><i class="ti ti-brand-instagram" aria-hidden="true"></i> @${escapeHTML(member.instagram)}</a></p>` : ""}${avatarControls()}<div class="form-actions"><button class="button button-light" id="editMyInstagram" type="button"><i class="ti ti-brand-instagram" aria-hidden="true"></i> Edit Instagram</button></div>${can(member?.role, "edit_self") ? '<div class="form-actions"><button class="button button-light" id="editMyProfile" type="button"><i class="ti ti-edit" aria-hidden="true"></i> Edit biodata</button></div>' : ""}</div>`;
  
}
subscribeMember(session.user.id, (value) => { member = value; nameSettings.update(value); }, memberState.update);
subscribeProgress(session.user.id, (value) => { progress = value; }, progressState.update);

document.querySelector("#passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = event.target.password.value;
  if (password.length < 6) { showToast("Password minimal 6 karakter."); return; }
  await withButtonLoading(event.target.querySelector('button[type="submit"], button:not([type])'), async () => {
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    event.target.reset();
    showToast("Password berhasil diperbarui.");
  } catch (error) { showToast(error.message); }
  });
});
document.querySelector("#logoutBtn").addEventListener("click", async () => { await logout(); location.href = "/"; });

avatarInput.addEventListener("change", async () => {
  const file = avatarInput.files?.[0];
  if (!file) return;
  const allowed = new Set(["image/gif", "image/webp", "image/png", "image/jpeg"]);
  const status = document.querySelector("#developerAvatarStatus");
  if (!developerAvatar) { avatarInput.value = ""; return; }
  if (!allowed.has(file.type)) { if(status) status.textContent = "Format tidak didukung. Pilih GIF, WebP, PNG, atau JPG."; avatarInput.value = ""; return; }
  if (file.size > 2 * 1024 * 1024) { if(status) status.textContent = "Ukuran file maksimal 2 MB."; avatarInput.value = ""; return; }
  if (avatarBusy) return;
  avatarBusy = true;
  const button = document.querySelector("#chooseDeveloperAvatar");
  if (button) { button.disabled = true; button.textContent = "Mengunggah…"; }
  if(status) status.textContent = "Mengunggah avatar…";
  try {
    const ext = ({ "image/gif":"gif", "image/webp":"webp", "image/png":"png", "image/jpeg":"jpg" })[file.type];
    const path = `${session.user.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("developer-avatars").upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("developer-avatars").getPublicUrl(path);
    const avatarUrl = `${data.publicUrl}${data.publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
    const { error: updateError } = await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
    if (updateError) throw updateError;
    const { error: memberPhotoError } = await supabase.from("members").update({ photo: avatarUrl }).eq("id", session.user.id);
    if (memberPhotoError) throw memberPhotoError;
    showToast("Avatar developer berhasil diperbarui.");
    location.reload();
  } catch (error) {
    console.error("Gagal mengunggah avatar developer:", error);
    if(status) status.textContent = error.message || "Upload gagal. Pastikan bucket developer-avatars sudah disiapkan.";
    showToast("Avatar gagal disimpan. Periksa konfigurasi Supabase Storage.");
  } finally {
    avatarBusy = false;
    avatarInput.value = "";
    const nextButton = document.querySelector("#chooseDeveloperAvatar");
    if (nextButton) { nextButton.disabled = false; nextButton.textContent = "Pilih avatar"; }
  }
});
document.querySelector("#profileCard").addEventListener("click", async event => {
  if (!developerAvatar) return;
  if (event.target.closest("#chooseDeveloperAvatar")) { avatarInput.click(); return; }
  if (event.target.closest("#removeDeveloperAvatar")) {
    const status = document.querySelector("#developerAvatarStatus");
    if (!confirm("Hapus foto profil developer?")) return;
    try {
      const currentUrl = session.user?.user_metadata?.avatar_url || "";
      const marker = "/storage/v1/object/public/developer-avatars/";
      if (currentUrl.includes(marker)) {
        const objectPath = decodeURIComponent(new URL(currentUrl).pathname.split(marker)[1] || "");
        if (objectPath) {
          const { error: removeError } = await supabase.storage.from("developer-avatars").remove([objectPath]);
          if (removeError) throw removeError;
        }
      }
      const { error } = await supabase.auth.updateUser({ data: { avatar_url: null } });
      if (error) throw error;
      const { error: memberPhotoError } = await supabase.from("members").update({ photo: "" }).eq("id", session.user.id);
      if (memberPhotoError) throw memberPhotoError;
      showToast("Foto profil dihapus.");
      location.reload();
    } catch (error) {
      if(status) status.textContent = error.message || "Gagal menghapus avatar.";
      showToast("Foto profil gagal dihapus.");
    }
    return;
  }
});
document.querySelector("#profileCard").addEventListener("click", event => {
  const instagramButton=event.target.closest("#editMyInstagram");
  if(instagramButton && member)return editInstagram(member,{trigger:instagramButton,onSaved:payload=>{member={...member,...payload};render();memberState.retry?.();}});
  const trigger = event.target.closest("#editMyProfile");
  if (!trigger || !can(member?.role, "edit_self") || !member) return;
  editBiodata(member, { self: true, trigger, onSaved: payload => {
    member = { ...member, ...payload };
    publishNameProfiles([{id:member.id,name:member.name}]);
    render(); memberState.retry?.();
  } });
});

const notificationHost=document.querySelector("#notificationSettingsContent");
let notificationPrefs=null;
function renderNotifications(){
  const permission=browserPermission();
  const browserText=permission==="unsupported"?"Browser ini tidak mendukung notifikasi atau koneksi belum aman.":permission==="denied"?"Izin ditolak di browser. Ubah melalui pengaturan situs browser.":permission==="granted"?"Izin browser diberikan. Notifikasi muncul saat halaman terbuka.":"Izin browser belum diminta.";
  notificationHost.innerHTML=`<div class="notification-settings-list"><label><input type="checkbox" data-pref="assignment_reminders" ${notificationPrefs.assignment_reminders?"checked":""}> Pengingat tenggat tugas di aplikasi</label><label><input type="checkbox" data-pref="calendar_reminders" ${notificationPrefs.calendar_reminders?"checked":""}> Pengingat kegiatan di aplikasi</label><label><input type="checkbox" data-browser-toggle ${browserEnabled(session.user.id)?"checked":""} ${permission==="unsupported"||permission==="denied"?"disabled":""}> Notifikasi browser di perangkat ini</label><p class="form-help">${browserText}</p></div>`;
}
async function loadNotifications(){notificationHost.textContent="Memuat pengaturan…";try{notificationPrefs=await readPreferences(session.user.id);renderNotifications();}catch(error){notificationHost.innerHTML='<div class="data-state is-error">Pengaturan gagal dimuat. <button type="button" data-retry-prefs>Coba lagi</button></div>';}}
notificationHost.addEventListener("click",event=>{if(event.target.closest("[data-retry-prefs]"))loadNotifications();});
notificationHost.addEventListener("change",async event=>{
  const target=event.target;
  if(target.matches("[data-browser-toggle]")){
    try{const permission=await setBrowserEnabled(session.user.id,target.checked);renderNotifications();showToast(permission==="granted"?"Pengaturan notifikasi browser diperbarui.":permission==="denied"?"Izin browser ditolak.":"Notifikasi browser tidak tersedia.");}catch(error){renderNotifications();showToast("Pengaturan browser gagal: "+error.message);}
    return;
  }
  if(!target.matches("[data-pref]"))return;
  const next={...notificationPrefs,[target.dataset.pref]:target.checked};target.disabled=true;
  try{await savePreferences(session.user.id,next);notificationPrefs={...next,exists:true};showToast("Pengaturan pengingat disimpan.");}catch(error){showToast("Gagal menyimpan: "+error.message);}finally{renderNotifications();}
});
loadNotifications();
