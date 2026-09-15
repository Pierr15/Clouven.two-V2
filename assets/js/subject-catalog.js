import {supabase} from "./supabase.js";
import {escapeHTML} from "./utils.js";
export function validateCatalog(value) {
  if(value?.schemaVersion!==1 || !Array.isArray(value.subjects) || value.subjects.length>100)throw new Error("Gunakan format JSON schemaVersion 1, dengan daftar subjects maksimal 100 mapel.");
  const seen=new Set();
  return value.subjects.map(row=>{
    if(typeof row.subject!=="string" || !row.subject.trim() || row.subject.trim().length>100)throw new Error("Setiap mapel wajib memiliki nama, maksimal 100 karakter.");
    const subject=row.subject.trim(), key=subject.toLocaleLowerCase("id");
    if(seen.has(key))throw new Error("Mapel duplikat: "+subject);seen.add(key);
    if(!Array.isArray(row.teachers) || !row.teachers.length || row.teachers.length>20 || row.teachers.some(t=>typeof t!=="string" || !t.trim() || t.trim().length>100))throw new Error("Isi 1–20 nama guru untuk "+subject+".");
    const teachers=row.teachers.map(t=>t.trim());
    if(new Set(teachers.map(t=>t.toLocaleLowerCase("id"))).size!==teachers.length)throw new Error("Nama guru duplikat pada "+subject+".");
    return {subject,teachers};
  });
}
export async function readCatalog() {
  const {data,error}=await supabase.from("subject_teachers").select("subject,teachers").order("subject");
  if(error)throw error;return data||[];
}
export async function saveCatalog(subjects) {
  const clean=validateCatalog({schemaVersion:1,subjects});
  const {error}=await supabase.rpc("replace_subject_teachers",{entries:clean});
  if(error)throw error;
}
export function bindSubjectTeacher(subject,teacher,catalog,initial={}) {
  const oldSubject=initial.subject||"",oldTeacher=initial.teacher||"";
  subject.innerHTML='<option value="">Pilih mata pelajaran</option>'+catalog.map(row=>'<option value="'+escapeHTML(row.subject)+'">'+escapeHTML(row.subject)+'</option>').join("");
  if(oldSubject&&!catalog.some(row=>row.subject===oldSubject))subject.add(new Option(oldSubject+" (data lama)",oldSubject));
  subject.value=oldSubject;
  function sync(preserve=false) {
    const row=catalog.find(row=>row.subject===subject.value),previous=preserve?(teacher.value||oldTeacher):"";
    const teachers=row?.teachers||[];
    teacher.innerHTML='<option value="">'+(teachers.length?"Pilih guru":"Pilih mapel terlebih dahulu")+'</option>'+teachers.map(name=>'<option value="'+escapeHTML(name)+'">'+escapeHTML(name)+'</option>').join("");
    if(preserve && previous && !teachers.includes(previous))teacher.add(new Option(previous+" (data lama)",previous));
    teacher.value=preserve&&previous?previous:teachers.length===1?teachers[0]:"";
    teacher.disabled=!subject.value;
    teacher.dispatchEvent(new Event("change",{bubbles:true}));
  }
  subject.addEventListener("change",()=>sync(false));sync(true);
  return {set(value){subject.value=value.subject||""; if(value.subject && ![...subject.options].some(o=>o.value===value.subject)){subject.add(new Option(value.subject+" (data lama)",value.subject));subject.value=value.subject;}teacher.value="";initial=value;sync(false);if(value.teacher && ![...teacher.options].some(o=>o.value===value.teacher))teacher.add(new Option(value.teacher+" (data lama)",value.teacher));teacher.value=value.teacher||teacher.value;teacher.dispatchEvent(new Event("change",{bubbles:true}));subject.dispatchEvent(new Event("clouven:sync"));},reset(){subject.value="";sync();subject.dispatchEvent(new Event("clouven:sync"));}};
}
