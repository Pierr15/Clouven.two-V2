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
function render() {
  const host = document.querySelector("#profileCard");
  if (showLoadState(host, memberState, progressState)) return;
  if (!member) { host.innerHTML = '<div class="empty-state"><strong>Profil belum tersedia.</strong>Hubungi pengurus untuk melengkapi data akunmu.</div>'; return; }
  const done = Object.values(progress).filter((x) => x.done).length;
  document.querySelector("#profileCard").innerHTML = `<div class="card form-card"><p class="eyebrow">akun saya</p><h2>${styledName(member)}</h2><p class="muted">${ROLE_LABEL[member.role]} · ${escapeHTML(member?.classRole || "Anggota kelas")}</p><div class="grid grid-3" style="margin-top:22px"><div class="result-cell"><span>Nomor absen</span><strong>${escapeHTML(member?.number || "—")}</strong></div><div class="result-cell"><span>Username / NIS</span><strong>${escapeHTML(member?.username || "—")}</strong></div><div class="result-cell"><span>Tugas selesai</span><strong>${done}</strong></div></div>${member.instagram ? `<p class="member-instagram"><a href="${escapeHTML(instagramUrl(member.instagram))}" target="_blank" rel="noopener noreferrer"><i class="ti ti-brand-instagram" aria-hidden="true"></i> @${escapeHTML(member.instagram)}</a></p>` : ""}<div class="form-actions"><button class="button button-light" id="editMyInstagram" type="button"><i class="ti ti-brand-instagram" aria-hidden="true"></i> Edit Instagram</button></div>${can(member?.role, "edit_self") ? '<div class="form-actions"><button class="button button-light" id="editMyProfile" type="button"><i class="ti ti-edit" aria-hidden="true"></i> Edit biodata</button></div>' : ""}</div>`;
  
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
