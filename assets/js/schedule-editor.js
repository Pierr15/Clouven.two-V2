import { styledName } from "./styled-name.js";
import { DAYS, escapeHTML, SUBJECT_COLORS } from "./utils.js";
import { bindSubjectTeacher } from "./subject-catalog.js";
import { supabase } from "./supabase.js";

const BLOCKS = [
  { key: "A", title: "Blok A", subtitle: "Teori" },
  { key: "B", title: "Blok B", subtitle: "Bengkel" },
];

function blockEditor(block) {
  const suffix = block.key === "A" ? "" : block.key;
  return `<section class="lesson-block-editor" data-lesson-block="${block.key}">
    <div class="lesson-block-editor-heading"><div><p class="eyebrow">${block.title}</p><h3>${block.subtitle}</h3></div><span class="schedule-block-badge" data-block-count="${block.key}">0 sesi</span></div>
    <div id="lessonRows${suffix}" class="lesson-rows" data-block-rows="${block.key}"></div>
    <button class="button button-light" id="addLesson${suffix}" data-add-lesson="${block.key}" type="button"><i class="ti ti-plus" aria-hidden="true"></i> Tambah pelajaran ${block.title}</button>
  </section>`;
}

export function scheduleMarkup(day) {
  return `<div class="card form-card"><p class="eyebrow">jadwal rutin</p><h2>Pelajaran & Piket</h2><p class="form-help">Blok A digunakan untuk teori dan Blok B untuk kegiatan bengkel. Jam pada dua blok boleh berjalan bersamaan.</p><div class="form-field day-selector"><label for="adminDay">Hari yang diedit</label><select id="adminDay">${DAYS.map(d=>`<option value="${d.key}" ${d.key===day?"selected":""}>${d.label}</option>`).join("")}</select></div><form id="scheduleForm" data-day="${day}"><div class="schedule-copy"><div class="form-field"><label for="copyDay">Salin pelajaran dari</label><select id="copyDay"><option value="">Pilih hari sumber</option>${DAYS.filter(d=>d.key!==day).map(d=>`<option value="${d.key}">${d.label}</option>`).join("")}</select></div><button class="button button-light" id="copySchedule" type="button">Salin kedua blok</button></div><p class="form-help">Salinan mempertahankan pembagian Blok A dan B. Periksa jam sebelum menyimpan.</p><div class="lesson-block-editor-grid">${BLOCKS.map(blockEditor).join("")}</div><fieldset class="piket-editor"><legend>Petugas piket</legend><div id="piketChoices"></div><p class="form-help">Pilih anggota yang bertugas pada hari ini.</p></fieldset><p class="notice error" role="alert" id="scheduleError" hidden></p><p class="form-help" role="status" id="scheduleStatus"></p><div class="form-actions"><button class="button button-coral" type="submit">Simpan jadwal</button></div></form></div>`;
}

export function mountScheduleEditor(form, schedule, catalog, members) {
  const blockRows = Object.fromEntries(BLOCKS.map(block => [block.key, form.querySelector(`[data-block-rows="${block.key}"]`)]));
  const error = form.querySelector("#scheduleError");
  let copying = false, disposed = false;
  const clock=value=>{const match=String(value||"").trim().match(/^(\d{1,2})[.:](\d{2})$/);return match?match[1].padStart(2,"0")+":"+match[2]:"";};
  const normalizedBlock = value => value === "B" ? "B" : "A";
  const allRows = () => [...form.querySelectorAll(".lesson-row")];

  function renumber() {
    for (const block of BLOCKS) {
      [...blockRows[block.key].children].forEach((row,index)=>{
        row.querySelector("legend").textContent=`${block.title} · Pelajaran ${index+1}`;
        row.querySelector("[data-remove-lesson]").setAttribute("aria-label",`Hapus ${block.title} pelajaran ${index+1}`);
      });
      form.querySelector(`[data-block-count="${block.key}"]`).textContent=`${blockRows[block.key].children.length} sesi`;
    }
  }

  function append(lesson={}, requestedBlock=null) {
    const block = normalizedBlock(requestedBlock || lesson.block);
    const rows = blockRows[block];
    const row=document.createElement("fieldset"),id=crypto.randomUUID();
    row.className="lesson-row";row.dataset.block=block;
    const times=String(lesson.time||"").split(/\s*[–—-]\s*/);
    row.innerHTML=`<legend>Pelajaran</legend><div class="form-grid"><div class="form-field"><label for="start-${id}">Jam mulai</label><input type="text" inputmode="numeric" placeholder="07:00" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" maxlength="5" data-start id="start-${id}" value="${escapeHTML(clock(times[0]))}" required></div><div class="form-field"><label for="end-${id}">Jam selesai</label><input type="text" inputmode="numeric" placeholder="08:30" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" maxlength="5" data-end id="end-${id}" value="${escapeHTML(clock(times[1]))}" required></div><div class="form-field"><label for="subject-${id}">Mata pelajaran</label><select id="subject-${id}" data-subject required></select></div><div class="form-field"><label for="teacher-${id}">Guru</label><select id="teacher-${id}" data-teacher required></select></div><div class="form-field full"><label for="room-${id}">Ruangan</label><input id="room-${id}" data-room maxlength="100" value="${escapeHTML(lesson.room||"")}" placeholder="Contoh: Lab TKJ"></div></div><button class="mini-action danger-action" data-remove-lesson type="button">Hapus baris</button>`;
    row.dataset.color=lesson.color||SUBJECT_COLORS[allRows().length%SUBJECT_COLORS.length];
    rows.append(row);bindSubjectTeacher(row.querySelector("[data-subject]"),row.querySelector("[data-teacher]"),catalog,lesson);renumber();return row;
  }

  (schedule.lessons||[]).forEach(lesson=>append(lesson));
  const pickerName=name=>{const matches=members.filter(member=>member.name===name);return matches.length===1?styledName(matches[0]):escapeHTML(name);};
  const names=[...new Set([...members.map(member=>member.name).filter(Boolean),...(schedule.piket||[])])];
  form.querySelector("#piketChoices").innerHTML=names.map(name=>`<label class="choice-label"><input type="checkbox" data-piket value="${escapeHTML(name)}" ${(schedule.piket||[]).includes(name)?"checked":""}><span>${pickerName(name)}</span></label>`).join("")||'<p class="muted">Belum ada anggota untuk dipilih.</p>';
  form.addEventListener("input",event=>{form.dataset.dirty="true";if(event.target.matches("[data-start],[data-end]")&&/^\d{3,4}$/.test(event.target.value)){const digits=event.target.value;event.target.value=digits.slice(0,2)+":"+digits.slice(2);}});
  form.addEventListener("change",()=>form.dataset.dirty="true");
  form.querySelectorAll("[data-add-lesson]").forEach(button=>button.addEventListener("click",()=>{const row=append({},button.dataset.addLesson);form.dataset.dirty="true";row.querySelector("input").focus();}));
  form.querySelector(".lesson-block-editor-grid").addEventListener("click",event=>{const button=event.target.closest("[data-remove-lesson]");if(!button)return;const row=button.closest(".lesson-row"),block=row.dataset.block,next=row.nextElementSibling||row.previousElementSibling;row.remove();renumber();form.dataset.dirty="true";(next?.querySelector("input")||form.querySelector(`[data-add-lesson="${block}"]`)).focus();});
  form.querySelector("#copySchedule").addEventListener("click",async()=>{
    const day=form.querySelector("#copyDay").value,button=form.querySelector("#copySchedule");
    if(copying)return;if(!day){error.textContent="Pilih hari sumber terlebih dahulu.";error.hidden=false;return;}
    copying=true;button.disabled=true;button.textContent="Menyalin…";error.hidden=true;
    try{const {data,error:failure}=await supabase.from("schedules").select("lessons").eq("day",day).maybeSingle();if(failure)throw failure;if(disposed)return;const lessons=data?.lessons||[];lessons.forEach(lesson=>append(lesson));form.dataset.dirty="true";form.querySelector("#scheduleStatus").textContent=lessons.length?`${lessons.length} pelajaran dari kedua blok ditambahkan. Periksa jam lalu simpan.`:"Hari sumber belum memiliki pelajaran.";}catch{if(!disposed){error.textContent="Jadwal belum dapat disalin. Coba lagi.";error.hidden=false;}}finally{copying=false;button.disabled=false;button.textContent="Salin kedua blok";}
  });

  return {destroy(){disposed=true;},read(){
    if(copying)throw new Error("Tunggu proses penyalinan selesai.");
    const lessons=allRows().map((row,index)=>{
      const start=row.querySelector("[data-start]").value,end=row.querySelector("[data-end]").value,subject=row.querySelector("[data-subject]").value,teacher=row.querySelector("[data-teacher]").value;
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end)throw new Error(`Periksa jam pelajaran ${index+1}: jam selesai harus setelah jam mulai.`);
      if(!subject||!teacher)throw new Error(`Pilih mapel dan guru untuk pelajaran ${index+1}.`);
      return {time:start.replace(":",".")+"–"+end.replace(":","."),subject,teacher,room:row.querySelector("[data-room]").value.trim(),color:row.dataset.color,block:normalizedBlock(row.dataset.block)};
    });
    const sorted=lessons.map((lesson,index)=>({index,...lesson})).sort((a,b)=>a.block.localeCompare(b.block)||a.time.localeCompare(b.time));
    for(const block of BLOCKS){const rows=sorted.filter(lesson=>lesson.block===block.key);for(let index=1;index<rows.length;index++)if(rows[index].time.split("–")[0]<rows[index-1].time.split("–")[1])throw new Error(`Jam ${block.title} pelajaran ${rows[index-1].index+1} dan ${rows[index].index+1} bertabrakan.`);}
    return {lessons:sorted.map(({index,...lesson})=>lesson),piket:[...form.querySelectorAll("[data-piket]:checked")].map(element=>element.value)};
  }};
}
