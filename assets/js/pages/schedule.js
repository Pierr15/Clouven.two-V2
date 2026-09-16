import { referencedName, legacyMemberName } from "../styled-name.js";
import { createLoadState, showLoadState } from "../load-state.js";
import { bootShell } from "../bootstrap.js";
import { subscribeSchedule, subscribeApelQueue } from "../data.js";
import { DAYS, todayKey, dayInfo, nextSchoolDates, escapeHTML, SUBJECT_COLORS } from "../utils.js";

const session = await bootShell("schedule");
let selectedDay = todayKey() || "monday";
let activeTab = new URLSearchParams(location.search).get("tab") || "lesson";
if (!["lesson","piket","apel"].includes(activeTab)) activeTab = "lesson";
let schedule = { lessons: [], piket: [] }, queue = [];
const lessonBlocks = [
  { key: "A", title: "Blok A", subtitle: "Teori" },
  { key: "B", title: "Blok B", subtitle: "Bengkel" },
];
let unsubscribeSchedule = null;
const scheduleState = createLoadState("schedule", "Jadwal", renderContent);
const queueState = createLoadState("queue", "Urutan apel", renderContent);

function bindDay() {
  unsubscribeSchedule?.();
  schedule = { lessons: [], piket: [] };
  scheduleState.label = `Jadwal ${dayInfo(selectedDay).label}`;
  unsubscribeSchedule = subscribeSchedule(selectedDay, (value) => { schedule = value; }, scheduleState.update);
}
function renderTabs() {
  document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === activeTab));
  document.querySelector("#dayTabs").hidden = activeTab === "apel";
  document.querySelector("#dayTabs").innerHTML = DAYS.map((d) => `<button class="day-tab ${d.key === selectedDay ? "is-active" : ""}" data-day="${d.key}">${d.short}</button>`).join("");
}
function renderContent() {
  renderTabs();
  const host = document.querySelector("#scheduleContent");
  if (showLoadState(host, activeTab === "apel" ? queueState : scheduleState)) return;
  const info = dayInfo(selectedDay);
  if (activeTab === "lesson") {
    const lessons = schedule.lessons || [];
    host.innerHTML = `<div class="schedule-block-grid">${lessonBlocks.map(block=>{
      const rows=lessons.filter(lesson=>(lesson.block === "B" ? "B" : "A")===block.key);
      return `<section class="card schedule-panel schedule-block" tabindex="0" role="region" aria-label="${block.title} ${block.subtitle}; geser untuk melihat semua kolom"><div class="schedule-heading"><div><p class="eyebrow">${block.title}</p><h3>${block.subtitle}</h3><p class="muted">${info.label}</p></div><span class="schedule-block-badge">${rows.length} sesi</span></div>${rows.length ? `<table class="schedule-table"><thead><tr><th>Waktu</th><th>Mata pelajaran</th><th>Pengajar</th><th>Ruang</th></tr></thead><tbody>${rows.map((x,i)=>`<tr><td>${escapeHTML(x.time)}</td><td><span class="subject-mark" style="--mark-color:${x.color || SUBJECT_COLORS[i%SUBJECT_COLORS.length]}"></span>${escapeHTML(x.subject)}</td><td class="muted">${escapeHTML(x.teacher || "—")}</td><td class="muted">${escapeHTML(x.room || "—")}</td></tr>`).join("")}</tbody></table>` : `<div class="empty-state"><strong>Belum ada pelajaran.</strong>Tambahkan jadwal ${block.title} dari panel pengelola.</div>`}</section>`;
    }).join("")}</div>`;
  } else if (activeTab === "piket") {
    const names = schedule.piket || [];
    const me = session?.profile?.name || "";
    host.innerHTML = `<div class="card"><div class="schedule-heading"><div><p class="eyebrow">jadwal piket</p><h3>${info.label}</h3></div><span class="muted">${names.length} anggota</span></div>${names.length ? `<div class="piket-grid">${names.map((name)=>`<div class="piket-person">${legacyMemberName(name)}${me && name.toLowerCase() === me.toLowerCase() ? `<span class="me-badge">✦ kamu</span>` : ""}</div>`).join("")}</div>` : `<div class="empty-state"><strong>Belum ada petugas piket.</strong>Pengurus dapat mengisi daftar ini.</div>`}</div>`;
  } else {
    const dates = nextSchoolDates(Math.max(queue.length,1));
    host.innerHTML = `<div class="card"><div class="schedule-heading"><div><p class="eyebrow">urutan dinamis</p><h3>Pemimpin Apel</h3></div><span class="muted">Bisa berubah sewaktu-waktu</span></div>${queue.length ? `<div class="queue-list">${queue.map((item,index)=>`<div class="queue-item"><span class="queue-number">${String(index+1).padStart(2,"0")}</span><div><strong>${referencedName(item.memberId,item.name)}</strong><div class="queue-date">${index === 0 ? "Berikutnya · " : ""}${new Intl.DateTimeFormat("id-ID",{weekday:"long",day:"numeric",month:"short"}).format(dates[index])}</div></div>${index===0?`<span class="task-status">berikutnya</span>`:""}</div>`).join("")}</div>` : `<div class="empty-state"><strong>Urutan apel belum dibuat.</strong>Developer atau pengurus dapat menyusunnya di panel admin.</div>`}</div>`;
  }
}

document.querySelector("#scheduleTabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]"); if (!button) return;
  activeTab = button.dataset.tab; history.replaceState(null,"",`?tab=${activeTab}`); renderContent();
});
document.querySelector("#dayTabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-day]"); if (!button) return;
  selectedDay = button.dataset.day; bindDay(); renderTabs();
});
subscribeApelQueue((value) => { queue = value; }, queueState.update);
bindDay(); renderContent();
