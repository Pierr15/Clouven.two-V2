import { referencedName, legacyMemberName } from "../styled-name.js";
import { can } from "../permissions.js";
import { createTypewriter } from "../typewriter.js";
import { bootShell } from "../bootstrap.js";
import { subscribeProfile, subscribeSchedule, subscribeApelQueue, subscribeTaskSummaries } from "../data.js";
import { todayKey, formatLongDate, relativeDue, escapeHTML } from "../utils.js";

import { createLoadState, loadStateMarkup, showLoadState } from "../load-state.js";

const titleElement = document.querySelector("#heroTitle");
const titleWriter = createTypewriter(titleElement);
titleWriter.setText(titleElement.firstChild.textContent, titleElement.querySelector("em")?.textContent || "");
const session = await bootShell("home");
const signedIn = Boolean(session?.user);
document.querySelector("#heroLogin").hidden = signedIn;
document.querySelector(".hero-actions").classList.toggle("is-signed-in", signedIn);
const key = todayKey();
let profile, schedule = { lessons: [], piket: [] }, queue = [], tasks = [];

const states = {
  profile: createLoadState("home-profile", "Informasi kelas", render),
  schedule: createLoadState("home-schedule", "Jadwal hari ini", render),
  queue: createLoadState("home-queue", "Urutan apel", render),
  tasks: createLoadState("home-tasks", "Ringkasan tugas", render),
};
if (!key) states.schedule.status = "ready";
function render() {
  const profilePending = showLoadState(document.querySelector("#classFacts"), states.profile);
  if (profile && !profilePending) {
    titleWriter.setText(profile.headline, profile.emphasis, profile.titleAnimation);
    document.querySelector("#heroDescription").textContent = profile.description;
    const photo = document.querySelector("#classPhoto");
    photo.src = profile.classPhoto || "/assets/images/class-placeholder.svg";
    photo.alt = `Foto kelas ${profile.className}`;
    document.querySelector("#photoCaption").textContent = profile.photoCaption || profile.className;
    document.querySelector("#classFacts").innerHTML = `
      <div class="fact"><strong>${escapeHTML(profile.className)}</strong><span>kelas kita</span></div>
      <div class="fact"><strong>${escapeHTML(profile.advisor)}</strong><span>wali kelas</span></div>
      <div class="fact"><strong>${escapeHTML(profile.schoolYear)}</strong><span>${escapeHTML(profile.school)}</span></div>`;
  }
  document.querySelector("#liveDate").textContent = new Intl.DateTimeFormat("id-ID", { day:"numeric", month:"short", year:"numeric" }).format(new Date());
  document.querySelector("#todayText").textContent = `Hari ini, ${formatLongDate()}.`;
  const first = schedule.lessons?.[0];
  document.querySelector("#summaryGrid").innerHTML = `
    <article class="summary-card"><p class="mini-label">pelajaran pertama</p>${loadStateMarkup(states.schedule) || `<h3>${escapeHTML(first?.subject || (key ? "Belum ada jadwal" : "Hari libur"))}</h3><p>${escapeHTML(first?.time || "—")} ${first?.teacher ? `· ${escapeHTML(first.teacher)}` : ""}</p><a class="text-button" href="/jadwal/">Jadwal lengkap →</a>`}</article>
    <article class="summary-card"><p class="mini-label">piket hari ini</p>${loadStateMarkup(states.schedule) || `<h3>${schedule.piket?.length ? schedule.piket.slice(0,3).map(legacyMemberName).join(", ") : key ? "Belum ditentukan" : "Hari libur"}</h3><p>${schedule.piket?.length > 3 ? `+${schedule.piket.length - 3} anggota lainnya` : "Jaga kelas tetap nyaman."}</p><a class="text-button" href="/jadwal/?tab=piket">Lihat piket →</a>`}</article>
    <article class="summary-card"><p class="mini-label">pemimpin apel berikutnya</p>${loadStateMarkup(states.queue) || `<h3>${referencedName(queue[0]?.memberId,queue[0]?.name || "Belum ditentukan")}</h3><p>Urutan dapat berubah sewaktu-waktu oleh pengurus.</p><a class="text-button" href="/jadwal/?tab=apel">Lihat urutan →</a>`}</article>
    <article class="summary-card"><p class="mini-label">tugas terdekat</p>${!can(session.role, "task_summary") ? '<h3>Tugas untuk anggota</h3><p>Login untuk melihat tugas kelas.</p><a class="text-button" href="/login/?next=%2Ftugas%2F">Login →</a>' : loadStateMarkup(states.tasks) || `<h3>${escapeHTML(tasks[0]?.title || "Tidak ada tugas")}</h3><p>${tasks[0] ? `${escapeHTML(tasks[0].subject || "Umum")} · ${relativeDue(tasks[0].due)}` : "Nikmati ruang kosong ini ✦"}</p><a class="text-button" href="/tugas/">Lihat tugas →</a>`}</article>`;
}

subscribeProfile((v) => { profile = v; }, states.profile.update);
if (key) subscribeSchedule(key, (v) => { schedule = v; }, states.schedule.update); else render();
subscribeApelQueue((v) => { queue = v; }, states.queue.update);
if (can(session.role, "task_summary")) subscribeTaskSummaries((v) => { tasks = v.filter((t) => t.status !== "archived").slice(0,3); }, states.tasks.update);
