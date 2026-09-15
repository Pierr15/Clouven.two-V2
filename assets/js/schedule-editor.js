import { styledName } from "./styled-name.js";
import {DAYS,escapeHTML,SUBJECT_COLORS} from "./utils.js";
import {bindSubjectTeacher} from "./subject-catalog.js";
import {supabase} from "./supabase.js";
export function scheduleMarkup(day) {
 return '<div class="card form-card"><p class="eyebrow">jadwal rutin</p><h2>Pelajaran & Piket</h2><div class="form-field day-selector"><label for="adminDay">Hari yang diedit</label><select id="adminDay">'+DAYS.map(d=>'<option value="'+d.key+'" '+(d.key===day?'selected':'')+'>'+d.label+'</option>').join("")+'</select></div><form id="scheduleForm" data-day="'+day+'"><div class="schedule-copy"><div class="form-field"><label for="copyDay">Salin pelajaran dari</label><select id="copyDay"><option value="">Pilih hari sumber</option>'+DAYS.filter(d=>d.key!==day).map(d=>'<option value="'+d.key+'">'+d.label+'</option>').join("")+'</select></div><button class="button button-light" id="copySchedule" type="button">Salin pelajaran</button></div><p class="form-help">Salinan ditambahkan ke daftar di bawah. Periksa jam agar tidak bertabrakan sebelum menyimpan.</p><div id="lessonRows" class="lesson-rows"></div><button class="button button-light" id="addLesson" type="button"><i class="ti ti-plus" aria-hidden="true"></i> Tambah pelajaran</button><fieldset class="piket-editor"><legend>Petugas piket</legend><div id="piketChoices"></div><p class="form-help">Pilih anggota yang bertugas pada hari ini.</p></fieldset><p class="notice error" role="alert" id="scheduleError" hidden></p><p class="form-help" role="status" id="scheduleStatus"></p><div class="form-actions"><button class="button button-coral" type="submit">Simpan jadwal</button></div></form></div>';
}
export function mountScheduleEditor(form,schedule,catalog,members) {
 const rows=form.querySelector("#lessonRows"),error=form.querySelector("#scheduleError");
 let copying=false,disposed=false;
 const clock=value=>{const m=String(value||"").trim().match(/^(\d{1,2})[.:](\d{2})$/);return m?m[1].padStart(2,"0")+":"+m[2]:"";};
 function renumber(){[...rows.children].forEach((row,i)=>{row.querySelector("legend").textContent="Pelajaran "+(i+1);row.querySelector("[data-remove-lesson]").setAttribute("aria-label","Hapus pelajaran "+(i+1));});}
 function append(lesson={}) {
  const row=document.createElement("fieldset");row.className="lesson-row";const id=crypto.randomUUID();
  const times=String(lesson.time||"").split(/\s*[–—-]\s*/);
  row.innerHTML='<legend>Pelajaran</legend><div class="form-grid"><div class="form-field"><label for="start-'+id+'">Jam mulai</label><input type="text" inputmode="numeric" placeholder="07:00" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" maxlength="5" data-start id="start-'+id+'" value="'+escapeHTML(clock(times[0]))+'" required></div><div class="form-field"><label for="end-'+id+'">Jam selesai</label><input type="text" inputmode="numeric" placeholder="08:30" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" maxlength="5" data-end id="end-'+id+'" value="'+escapeHTML(clock(times[1]))+'" required></div><div class="form-field"><label for="subject-'+id+'">Mata pelajaran</label><select id="subject-'+id+'" data-subject required></select></div><div class="form-field"><label for="teacher-'+id+'">Guru</label><select id="teacher-'+id+'" data-teacher required></select></div><div class="form-field full"><label for="room-'+id+'">Ruangan</label><input id="room-'+id+'" data-room maxlength="100" value="'+escapeHTML(lesson.room||"")+'" placeholder="Contoh: Lab TKJ"></div></div><button class="mini-action danger-action" data-remove-lesson type="button">Hapus baris</button>';
  row.dataset.color=lesson.color||SUBJECT_COLORS[rows.children.length%SUBJECT_COLORS.length];rows.append(row);
  bindSubjectTeacher(row.querySelector("[data-subject]"),row.querySelector("[data-teacher]"),catalog,lesson);renumber();return row;
 }
 (schedule.lessons||[]).forEach(append);
 const pickerName=name=>{const matches=members.filter(m=>m.name===name);return matches.length===1?styledName(matches[0]):escapeHTML(name);};
 const names=[...new Set([...members.map(m=>m.name).filter(Boolean),...(schedule.piket||[])])];
 form.querySelector("#piketChoices").innerHTML=names.map(name=>'<label class="choice-label"><input type="checkbox" data-piket value="'+escapeHTML(name)+'" '+((schedule.piket||[]).includes(name)?"checked":"")+'><span>'+pickerName(name)+'</span></label>').join("")||'<p class="muted">Belum ada anggota untuk dipilih.</p>';
 form.addEventListener("input",event=>{
  form.dataset.dirty="true";
  if(event.target.matches("[data-start],[data-end]") && /^\d{3,4}$/.test(event.target.value)) {
    const digits=event.target.value;event.target.value=digits.slice(0,2)+":"+digits.slice(2);
  }
 });
 form.addEventListener("change",()=>form.dataset.dirty="true");
 form.querySelector("#addLesson").addEventListener("click",()=>{const row=append();form.dataset.dirty="true";row.querySelector("input").focus();});
 rows.addEventListener("click",event=>{const button=event.target.closest("[data-remove-lesson]");if(button){const row=button.closest(".lesson-row"),next=row.nextElementSibling||row.previousElementSibling;row.remove();renumber();form.dataset.dirty="true";(next?.querySelector("input")||form.querySelector("#addLesson")).focus();}});
 form.querySelector("#copySchedule").addEventListener("click",async()=>{
  const day=form.querySelector("#copyDay").value,button=form.querySelector("#copySchedule");
  if(copying)return;if(!day){error.textContent="Pilih hari sumber terlebih dahulu.";error.hidden=false;return;}
  copying=true;button.disabled=true;button.textContent="Menyalin…";error.hidden=true;
  try{const {data,error:failure}=await supabase.from("schedules").select("lessons").eq("day",day).maybeSingle();if(failure)throw failure;if(disposed)return;
   const lessons=data?.lessons||[];lessons.forEach(append);form.dataset.dirty="true";form.querySelector("#scheduleStatus").textContent=lessons.length?lessons.length+" pelajaran ditambahkan. Periksa jam lalu simpan.":"Hari sumber belum memiliki pelajaran.";
  }catch(e){if(!disposed){error.textContent="Jadwal belum dapat disalin. Coba lagi.";error.hidden=false;}}
  finally{copying=false;button.disabled=false;button.textContent="Salin pelajaran";}
 });
 return {destroy(){disposed=true;},read(){
  if(copying)throw new Error("Tunggu proses penyalinan selesai.");
  const lessons=[...rows.children].map((row,i)=>{
   const start=row.querySelector("[data-start]").value,end=row.querySelector("[data-end]").value,subject=row.querySelector("[data-subject]").value,teacher=row.querySelector("[data-teacher]").value;
   if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end)throw new Error("Periksa jam pelajaran "+(i+1)+": jam selesai harus setelah jam mulai.");
   if(!subject||!teacher)throw new Error("Pilih mapel dan guru untuk pelajaran "+(i+1)+".");
   return {time:start.replace(":",".")+"–"+end.replace(":","."),subject,teacher,room:row.querySelector("[data-room]").value.trim(),color:row.dataset.color};
  });
  const sorted=lessons.map((lesson,i)=>({i,...lesson})).sort((a,b)=>a.time.localeCompare(b.time));
  for(let i=1;i<sorted.length;i++)if(sorted[i].time.split("–")[0]<sorted[i-1].time.split("–")[1])throw new Error("Jam pelajaran "+(sorted[i-1].i+1)+" dan "+(sorted[i].i+1)+" bertabrakan.");
  return {lessons:sorted.map(({i,...lesson})=>lesson),piket:[...form.querySelectorAll("[data-piket]:checked")].map(el=>el.value)};
 }};
}
