import { referencedName, legacyMemberName } from "../styled-name.js";
import { can } from "../permissions.js";
import { createTypewriter } from "../typewriter.js";
import { bootShell } from "../bootstrap.js";
import { subscribeProfile, subscribeSchedule, subscribeApelQueue, subscribeTaskSummaries, subscribeProgress, listCalendarEvents } from "../data.js";
import { todayKey, formatLongDate, escapeHTML } from "../utils.js";
import { deadlineInstant, deadlineLabel, startDeadlineClock } from "../deadline.js";
import {supabase} from "../supabase.js";

import { createLoadState, loadStateMarkup, showLoadState } from "../load-state.js";

const titleElement = document.querySelector("#heroTitle");
const titleWriter = createTypewriter(titleElement);
titleWriter.setText(titleElement.firstChild.textContent, titleElement.querySelector("em")?.textContent || "");
const session = await bootShell("home");
const signedIn = Boolean(session?.user);
document.querySelector("#heroLogin").hidden = signedIn;
document.querySelector(".hero-actions").classList.toggle("is-signed-in", signedIn);
const key = todayKey();
let profile, schedule = { lessons: [], piket: [] }, queue = [], tasks = [], progress = {}, events = [];

const states = {
  profile: createLoadState("home-profile", "Informasi kelas", render),
  schedule: createLoadState("home-schedule", "Jadwal hari ini", render),
  queue: createLoadState("home-queue", "Urutan apel", render),
  tasks: createLoadState("home-tasks", "Ringkasan tugas", render),
  events: createLoadState("home-events", "Agenda hari ini", render),
};
if (!key) states.schedule.status = "ready";
if (!signedIn) states.events.status = "ready";
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
  const hour=new Date().getHours();
  const greeting=hour<11?"pagi":hour<15?"siang":hour<18?"sore":"malam";
  const firstName=(session.profile?.name||session.user?.user_metadata?.name||"teman").trim().split(/\s+/)[0];
  document.querySelector("#todayGreeting").innerHTML=`Selamat ${greeting}, <span>${escapeHTML(firstName)}</span>`;
  const activeTasks=tasks.filter(task=>!progress[task.id]?.done).sort((a,b)=>{
    const now=Date.now(),ad=deadlineInstant(a.due_at||a.due)?.getTime(),bd=deadlineInstant(b.due_at||b.due)?.getTime();
    const af=ad>=now,bf=bd>=now;
    if(af!==bf)return af?-1:1;
    if(!ad)return 1;if(!bd)return -1;
    return af?ad-bd:bd-ad;
  }).slice(0,3);
  const now=new Date(), start=new Date(now.getFullYear(),now.getMonth(),now.getDate()), end=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
  const todaysEvents=events.filter(event=>new Date(event.start_at)<end&&new Date(event.end_at)>start);
  const upcoming=events.filter(event=>new Date(event.start_at)>=end).slice(0,2);
  document.querySelector("#summaryGrid").innerHTML = `
    <article class="summary-card"><p class="mini-label">pelajaran hari ini</p>${loadStateMarkup(states.schedule) || (key&&schedule.lessons?.length?`<ul class="today-list">${schedule.lessons.map(x=>`<li><strong>${escapeHTML(x.subject||"Pelajaran")}</strong><span>${escapeHTML(x.time||"Waktu belum diisi")} · ${escapeHTML(x.teacher||"Guru belum diisi")}${x.room?` · ${escapeHTML(x.room)}`:""}</span></li>`).join("")}</ul>`:'<p class="today-empty">Tidak ada pelajaran hari ini.</p>')}<a class="text-button" href="/jadwal/">Jadwal lengkap →</a></article>
    <article class="summary-card"><p class="mini-label">piket hari ini</p>${loadStateMarkup(states.schedule) || (key&&schedule.piket?.length?`<h3>${schedule.piket.slice(0,3).map(legacyMemberName).join(", ")}</h3><p>${schedule.piket.length>3?`+${schedule.piket.length-3} anggota lainnya`:"Jaga kelas tetap nyaman."}</p>`:'<p class="today-empty">Belum ada jadwal piket hari ini.</p>')}<a class="text-button" href="/jadwal/?tab=piket">Lihat piket →</a></article>
    <article class="summary-card"><p class="mini-label">tugas terdekat</p>${!can(session.role,"task_summary")?'<p class="today-empty">Login untuk melihat tugas kelas.</p><a class="text-button" href="/login/?next=%2Ftugas%2F">Login →</a>':loadStateMarkup(states.tasks)||(activeTasks.length?`<ul class="today-list">${activeTasks.map(t=>`<li><strong>${escapeHTML(t.title)}</strong><span>${escapeHTML(t.subject||"Umum")} · <span class="deadline-label" data-deadline="${escapeHTML(t.due_at||t.due||"")}" data-task-id="${escapeHTML(t.id)}">${deadlineLabel(t.due_at||t.due)}</span></span></li>`).join("")}</ul>`:'<p class="today-empty">Tidak ada tugas yang perlu dikerjakan.</p>')}<a class="text-button" href="/tugas/">Lihat tugas →</a></article>
    <article class="summary-card"><p class="mini-label">agenda hari ini</p>${!signedIn?'<p class="today-empty">Login untuk melihat agenda kelas.</p>':loadStateMarkup(states.events)||(todaysEvents.length?`<ul class="today-list">${todaysEvents.map(e=>`<li><strong>${escapeHTML(e.title)}</strong><span>${escapeHTML(e.location||"Kegiatan kelas")}</span></li>`).join("")}</ul>`:'<p class="today-empty">Tidak ada kegiatan hari ini.</p>')}<a class="text-button" href="/kalender/">Buka kalender →</a></article>
    <article class="summary-card"><p class="mini-label">kegiatan berikutnya</p>${!signedIn?'<p class="today-empty">Agenda untuk anggota kelas.</p>':loadStateMarkup(states.events)||(upcoming.length?`<ul class="today-list">${upcoming.map(e=>`<li><strong>${escapeHTML(e.title)}</strong><span>${escapeHTML(formatLongDate(new Date(e.start_at)))}</span></li>`).join("")}</ul>`:'<p class="today-empty">Belum ada kegiatan mendatang.</p>')}<a class="text-button" href="/kalender/">Lihat agenda →</a></article>
    <article class="summary-card"><p class="mini-label">pemimpin apel berikutnya</p>${loadStateMarkup(states.queue) || `<h3>${referencedName(queue[0]?.memberId,queue[0]?.name || "Belum ditentukan")}</h3><p>Urutan dapat berubah sewaktu-waktu oleh pengurus.</p><a class="text-button" href="/jadwal/?tab=apel">Lihat urutan →</a>`}</article>`;
}

subscribeProfile((v) => { profile = v; }, states.profile.update);
if (key) subscribeSchedule(key, (v) => { schedule = v; }, states.schedule.update); else render();
subscribeApelQueue((v) => { queue = v; }, states.queue.update);
if (can(session.role, "task_summary")) {
  subscribeTaskSummaries((v) => { tasks = v.filter((t) => t.status !== "archived"); }, states.tasks.update);
  subscribeProgress(session.user.id,(v)=>{progress=v;render();});
}
if(signedIn){
  const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+45);
  const loadEvents=async()=>{states.events.update({status:"loading",hasData:Boolean(events.length)});try{events=await listCalendarEvents(start.toISOString(),end.toISOString());states.events.update({status:"ready",hasData:true,retry:loadEvents});}catch(error){states.events.update({status:"error",hasData:false,retry:loadEvents});}};
  loadEvents();
  const live=supabase.channel("calendar-events-home").on("postgres_changes",{event:"*",schema:"public",table:"calendar_events"},loadEvents).subscribe();
  addEventListener("pagehide",()=>supabase.removeChannel(live),{once:true});
}
startDeadlineClock(document,()=>progress);
const nextDay=new Date();nextDay.setHours(24,0,3,0);setTimeout(()=>location.reload(),nextDay-Date.now());
