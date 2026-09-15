import { styledName } from "../styled-name.js";
import { can } from "../permissions.js";
import { subscribeAllProgress, subscribeMembers } from "../data.js";
import { createLoadState, showLoadState } from "../load-state.js";
import { bootShell } from "../bootstrap.js";
import { requireAuth } from "../auth.js";
import { subscribeTasks, subscribeProgress, setTaskProgress } from "../data.js";
import { escapeHTML, subjectColor, taskState, formatShortDate, showToast } from "../utils.js";

const authSession = await requireAuth();
if (!authSession) throw new Error("redirect");
await bootShell("tasks");
let tasks = [], progress = {}, filter = "all";

const tasksState = createLoadState("tasks", "Daftar tugas", () => { render(); renderClassProgress(); });
const progressState = createLoadState("progress", "Status penyelesaian tugas", render);

function render() {
  document.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("is-active", b.dataset.filter === filter));
  if (showLoadState(document.querySelector("#tasksGrid"), tasksState, progressState)) return;
  let visible = tasks;
  if (filter === "open") visible = tasks.filter((t) => !progress[t.id]?.done);
  if (filter === "done") visible = tasks.filter((t) => progress[t.id]?.done);
  document.querySelector("#tasksGrid").innerHTML = visible.length ? visible.map((task) => {
    const done = Boolean(progress[task.id]?.done), state = taskState(task, done);
    return `<article class="task-card" style="--task-color:${subjectColor(task.subject)}"><div class="task-card-head"><p class="task-subject">${escapeHTML(task.subject || "Umum")}</p><span class="task-status ${state.cls}">${state.label}</span></div><h3>${escapeHTML(task.title)}</h3><p class="task-description">${escapeHTML(task.description || "Tidak ada deskripsi tambahan.")}</p><div class="task-footer"><span><strong>${formatShortDate(task.due)}</strong> · ${escapeHTML(task.teacher || "Kelas")}</span><button class="complete-button" data-toggle="${escapeHTML(task.id)}">${done ? "Buka lagi" : "Tandai selesai"}</button></div></article>`;
  }).join("") : `<div class="empty-state"><strong>${tasks.length ? "Tidak ada tugas di filter ini." : "Belum ada tugas."}</strong>${tasks.length ? "Coba kategori lain." : "Tugas baru akan muncul setelah ditambahkan oleh pengurus."}</div>`;
}

document.querySelector("#taskFilters").addEventListener("click", (event) => { const b=event.target.closest("[data-filter]"); if(!b)return; filter=b.dataset.filter; render(); });
document.querySelector("#tasksGrid").addEventListener("click", async (event) => {
  const b=event.target.closest("[data-toggle]"); if(!b)return;
  const id=b.dataset.toggle; const next=!progress[id]?.done;
  try { await setTaskProgress(authSession.user.id,id,next); showToast(next?"Tugas ditandai selesai.":"Tugas dibuka kembali."); } catch(e){ showToast(`Gagal: ${e.message}`); }
});


let roster = [], classProgress = [], selectedTask = "";
const progressHost = document.querySelector("#classProgress");
const rosterState = createLoadState("progress-roster", "Anggota kelas", renderClassProgress);
const classProgressState = createLoadState("class-progress", "Progres kelas", renderClassProgress);
function renderClassProgress() {
  const host = document.querySelector("#classProgress");
  if (!host || !can(authSession.role, "view_progress")) return;
  host.hidden = false;
  if (showLoadState(host, tasksState, rosterState, classProgressState)) return;
  if (!tasks.length) { host.innerHTML = '<div class="empty-state"><strong>Belum ada progres kelas.</strong>Tambahkan tugas melalui halaman pengelolaan kelas.</div>'; return; }
  if (!tasks.some(t => t.id === selectedTask)) selectedTask = tasks[0].id;
  const rows = roster.filter(m => m.id !== authSession.user.id);
  const done = new Set(classProgress.filter(p => p.task_id === selectedTask && p.done).map(p => p.user_id));
  host.innerHTML = `<div class="card form-card"><p class="eyebrow">pantau bersama</p><h2>Progres kelas</h2><p class="muted">${can(authSession.role,"edit_progress") ? "Lihat dan perbarui penyelesaian tugas anggota." : "Pantau penyelesaian tugas anggota. Perubahan progres pengguna lain dilakukan oleh Teacher atau Developer."}</p><div class="form-field progress-selector"><label for="progressTask">Pilih tugas</label><select id="progressTask">${tasks.map(t=>`<option value="${escapeHTML(t.id)}" ${t.id===selectedTask?"selected":""}>${escapeHTML(t.title)} · ${escapeHTML(t.subject)}</option>`).join("")}</select></div><p class="form-help">${rows.filter(m=>done.has(m.id)).length} dari ${rows.length} anggota lain sudah selesai.</p><div class="admin-list">${rows.map(m=>`<div class="admin-list-item"><div><strong>${styledName(m)}</strong><p class="muted">${escapeHTML(m.classRole)} · ${escapeHTML(m.number || "—")}</p></div><div class="row-actions"><span class="task-status ${done.has(m.id)?"is-done":""}">${done.has(m.id)?"Selesai":"Belum selesai"}</span>${can(authSession.role,"edit_progress")?`<button class="mini-action" data-progress-user="${m.id}" aria-label="${done.has(m.id)?"Buka lagi":"Tandai selesai"} untuk ${escapeHTML(m.name)}">${done.has(m.id)?"Buka lagi":"Tandai selesai"}</button>`:""}</div></div>`).join("") || '<div class="empty-state"><strong>Belum ada anggota lain.</strong>Akun baru akan muncul di daftar ini.</div>'}</div></div>`;
}
progressHost.addEventListener("change", event => { if(event.target.id==="progressTask"){ selectedTask=event.target.value;renderClassProgress(); } });
progressHost.addEventListener("click", async event => {
  const button=event.target.closest("[data-progress-user]");
  if(!button || !can(authSession.role,"edit_progress"))return;
  const userId=button.dataset.progressUser, taskId=selectedTask;
  const next=!classProgress.some(p=>p.user_id===userId&&p.task_id===taskId&&p.done);
  button.disabled=true;
  try {
    await setTaskProgress(userId,taskId,next);
    classProgress=classProgress.filter(p=>!(p.user_id===userId&&p.task_id===taskId));
    classProgress.push({user_id:userId,task_id:taskId,done:next});
    renderClassProgress();classProgressState.retry?.();showToast("Progres anggota diperbarui.");
  }catch(error){showToast("Progres belum berubah: "+error.message);}
  finally{button.disabled=false;}
});
if(can(authSession.role,"view_progress")){
  progressHost.hidden=false;
  subscribeMembers(value=>{roster=value;},rosterState.update);
  subscribeAllProgress(value=>{classProgress=value;},classProgressState.update);
}

subscribeTasks((value)=>{tasks=value;}, tasksState.update);
subscribeProgress(authSession.user.id,(value)=>{progress=value;}, progressState.update);
