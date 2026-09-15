import { startButtonLoading } from "./loading-ui.js";
import {validateCatalog,saveCatalog} from "./subject-catalog.js";
import {escapeHTML,showToast} from "./utils.js";
export function mountCatalogEditor(host,catalog,onSaved) {
 host.innerHTML='<div class="card form-card"><p class="eyebrow">referensi pelajaran</p><h2>Mapel & Guru</h2><p class="muted">Isi file JSON, pilih file, lalu periksa daftar sebelum menyimpan. Daftar baru akan menggantikan pilihan mapel dan guru; tugas serta jadwal yang sudah tersimpan tetap utuh.</p><a class="button button-light" href="/assets/data/mapel-guru.json" download="mapel-guru.json">Unduh template JSON</a><div class="form-field" style="margin-top:20px"><label for="catalogFile">File daftar mapel–guru</label><input id="catalogFile" type="file" accept=".json,application/json"></div><p class="form-help">Format: {"schemaVersion":1,"subjects":[{"subject":"Nama mapel","teachers":["Nama guru"]}]}. Maksimal 100 mapel, ukuran file 100 KB.</p><p role="alert" class="notice error" id="catalogError" hidden></p><div id="catalogPreview" class="admin-list"></div><p class="form-help" id="catalogStatus" role="status"></p><button class="button button-coral" id="saveCatalog" type="button" disabled>Simpan daftar baru</button></div>';
 const preview=host.querySelector("#catalogPreview"),status=host.querySelector("#catalogStatus"),error=host.querySelector("#catalogError"),button=host.querySelector("#saveCatalog"),file=host.querySelector("#catalogFile");
 let pending=null,version=0;
 function paint(rows){preview.innerHTML=rows.map(row=>'<div class="admin-list-item"><strong>'+escapeHTML(row.subject)+'</strong><span>'+row.teachers.map(escapeHTML).join(", ")+'</span></div>').join("")||'<div class="empty-state"><strong>Daftar mapel belum diisi.</strong>Isi template dan impor untuk mengaktifkan pilihan mapel–guru.</div>';}
 paint(catalog);
 file.addEventListener("change",async()=>{
  const current=++version;pending=null;button.disabled=true;error.hidden=true;
  const selected=file.files[0];if(!selected){paint(catalog);status.textContent="";return;}
  try{if(selected.size>102400)throw new Error("Ukuran JSON maksimal 100 KB.");const value=validateCatalog(JSON.parse(await selected.text()));if(current!==version)return;
   if(!value.length)throw new Error("Isi setidaknya satu mapel sebelum mengimpor.");
   pending=value;paint(pending);status.textContent=pending.length+" mapel siap disimpan. Daftar belum diterapkan.";button.disabled=false;
  }catch(e){if(current!==version)return;error.textContent=e instanceof SyntaxError?"Format JSON belum valid. Periksa tanda kutip, koma, dan kurung.":e.message;error.hidden=false;paint(catalog);status.textContent="";}
 });
 button.addEventListener("click",async()=>{
  if(!pending||button.disabled)return;const loading=startButtonLoading(button);file.disabled=true;error.hidden=true;
  try{await saveCatalog(pending);catalog=pending;pending=null;status.textContent="Daftar mapel dan guru berhasil disimpan.";showToast(status.textContent);onSaved(catalog);}
  catch(e){error.textContent="Daftar belum tersimpan. "+e.message;error.hidden=false;}
  finally{loading.finish();button.disabled=!pending;file.disabled=false;}
 });
}
