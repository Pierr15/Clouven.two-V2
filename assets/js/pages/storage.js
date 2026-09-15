import { startButtonLoading } from "../loading-ui.js";
import { can } from "../permissions.js";
import { formDialog, field, postAction } from "../dialogs.js";
import { MAX_UPLOAD_BYTES, uploadFile } from "../upload.js?v=drive-local-1";
import { createLoadState, showLoadState, readWithTimeout as withTimeout } from "../load-state.js";
import { requireAuth, authHeader, hasRole } from "../auth.js";
import { bootShell } from "../bootstrap.js";
import { subscribeResources, saveResource } from "../data.js";
import { escapeHTML, showToast } from "../utils.js";

const session=await requireAuth();if(!session)throw new Error("redirect");
await bootShell("storage");
const canUpload=can(session.role,"upload");
document.querySelector("#uploadCard").hidden=!canUpload;
let resources=[];
const listState = createLoadState("resources", "Daftar file", render);
function sizeText(bytes=0){const n=Number(bytes)||0;if(n<1024)return `${n} B`;if(n<1024**2)return `${(n/1024).toFixed(1)} KB`;return `${(n/1024**2).toFixed(1)} MB`;}
function render(){if(showLoadState(document.querySelector("#resourceList"), listState))return;document.querySelector("#resourceList").innerHTML=resources.length?resources.map(r=>`<div class="resource-row"><span class="file-icon">${r.kind==="materi"?"▤":"✓"}</span><div><h3>${escapeHTML(r.name)}</h3><p>${escapeHTML(r.subject||"Umum")} · ${escapeHTML(r.kind||"file")} · ${sizeText(r.size)}</p></div><div class="row-actions"><button class="button button-light button-small" data-download="${r.driveFileId}" data-name="${escapeHTML(r.name)}">Unduh</button>${can(session.role,"manage_files") ? `<button class="mini-action" data-edit-file="${r.id}">Ubah</button><button class="mini-action danger-action" data-trash-file="${r.id}">Hapus</button>` : ""}</div></div>`).join(""):`<div class="empty-state"><strong>Belum ada file.</strong>Materi dan lampiran tugas akan muncul di sini.</div>`;}
subscribeResources(v=>{resources=v;}, listState.update);

document.querySelector("#resourceList").addEventListener("click",async e=>{const b=e.target.closest("[data-download]");if(!b)return;b.disabled=true;b.textContent="Mengambil…";try{const res=await fetch(`/api/drive/download?id=${encodeURIComponent(b.dataset.download)}`,{headers:await authHeader()});if(!res.ok)throw new Error((await res.json().catch(()=>({}))).error||"Download gagal");const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=b.dataset.name||"file";a.click();URL.revokeObjectURL(url);}catch(err){showToast(err.message);}finally{b.disabled=false;b.textContent="Unduh";}});

const form = document.querySelector("#uploadForm");
const fileInput = form.elements.file;
const submit = document.querySelector("#uploadSubmit");
const selection = document.querySelector("#uploadSelection");
const fileError = document.querySelector("#uploadFileError");
const status = document.querySelector("#uploadStatus");
const statusTitle = document.querySelector("#uploadStatusTitle");
const statusDetail = document.querySelector("#uploadStatusDetail");
const progress = document.querySelector("#uploadProgress");
const bar = progress.querySelector("span");
const percentText = document.querySelector("#uploadPercent");
let busy = false, pendingResource = null, uploadedPercent = 0;

function selectedFileError(file) {
  if (!file) return "Pilih file terlebih dahulu.";
  if (!file.size) return "File ini kosong (0 B). Pilih file yang memiliki isi.";
  if (file.size > MAX_UPLOAD_BYTES) return "File terlalu besar. Maksimal 3 MB per file.";
  return "";
}

function setLocked(locked) {
  for (const control of [fileInput, form.elements.subject, form.elements.kind]) control.disabled = locked;
}

function setStatus(phase, title, detail, percent = null) {
  status.hidden = false;
  status.dataset.phase = phase;
  if (statusTitle.textContent !== title) statusTitle.textContent = title;
  if (statusDetail.textContent !== detail) statusDetail.textContent = detail;
  const processing = ["preparing", "sending", "drive", "listing"].includes(phase);
  progress.hidden = !processing;
  const measured = Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : null;
  if (measured !== null) uploadedPercent = measured;
  const visiblePercent = processing ? uploadedPercent : null;
  progress.classList.remove("is-indeterminate");
  progress.setAttribute("aria-label", phase === "sending" ? "Progres pengiriman file" : title);
  if (visiblePercent === null) {
    progress.removeAttribute("aria-valuenow");
    progress.removeAttribute("aria-valuetext");
    bar.style.width = "";
    percentText.textContent = "";
  } else {
    progress.setAttribute("aria-valuenow", String(visiblePercent));
    progress.setAttribute("aria-valuetext", visiblePercent + "%");
    bar.style.width = visiblePercent + "%";
    percentText.textContent = visiblePercent + "%";
  }
}

fileInput.addEventListener("change", () => {
  if (busy || pendingResource) return;
  const file = fileInput.files?.[0];
  const error = file ? selectedFileError(file) : "";
  fileError.textContent = error;
  fileError.hidden = !error;
  fileInput.setAttribute("aria-invalid", String(Boolean(error)));
  selection.hidden = !file;
  document.querySelector("#uploadFileName").textContent = file?.name || "";
  document.querySelector("#uploadFileSize").textContent = file ? sizeText(file.size) : "";
  status.hidden = true;
  submit.textContent = "Unggah file";
  submit.disabled = !file || Boolean(error);
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || !canUpload) return;
  const file = fileInput.files?.[0];
  if (!pendingResource) {
    const error = selectedFileError(file);
    if (error) {
      fileError.textContent = error;
      fileError.hidden = false;
      fileInput.setAttribute("aria-invalid", "true");
      fileInput.focus();
      return;
    }
  }
  busy = true;
  setLocked(true);
  uploadedPercent = pendingResource ? 100 : 0;
  const loading = startButtonLoading(submit, pendingResource ? "Menyimpan…" : "Mengunggah 0%", {indicator:"none"});
  form.setAttribute("aria-busy", "true");
  try {
    if (!pendingResource) {
      const subject = form.elements.subject.value.trim() || "Umum";
      const kind = form.elements.kind.value;
      setStatus("preparing", "Menyiapkan unggahan…", "Jaga halaman ini tetap terbuka sampai selesai.", 0);
      const headers = {
        ...(await withTimeout(authHeader)),
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name),
        "X-Subject": encodeURIComponent(subject),
        "X-Kind": kind,
      };
      setStatus("sending", "Mengirim file…", "Persentase menunjukkan file yang terkirim dari perangkat.", 0);
      const uploaded = await uploadFile(file, headers,
        percent => {
          setStatus("sending", "Mengirim file…", "Persentase menunjukkan file yang terkirim dari perangkat.", percent);
          loading.update("Mengunggah " + uploadedPercent + "%");
        },
        () => {
          setStatus("drive", "Menyimpan ke Google Drive…", "100% terkirim. Tunggu konfirmasi penyimpanan file.", 100);
          loading.update("Mengunggah 100%");
        }
      );
      // Retain the confirmed Drive ID so a failed list save does not resend the file.
      pendingResource = {
        name: file.name, driveFileId: uploaded.id,
        mimeType: file.type || "application/octet-stream", size: file.size,
        subject, kind, uploadedBy: session.user.id,
        uploadedByName: session.profile?.name || "Pengguna",
      };
    }
    loading.update("Menyimpan…");
    setStatus("listing", "Menambahkan ke daftar file…", "File sudah tersimpan di Google Drive.", 100);
    await withTimeout(() => saveResource(pendingResource));
    const completedName = pendingResource.name;
    pendingResource = null;
    form.reset();
    selection.hidden = true;
    fileError.hidden = true;
    fileInput.removeAttribute("aria-invalid");
    setStatus("success", "File berhasil diunggah", completedName + " sudah tersedia di daftar file kelas.");
    listState.retry?.();
    showToast("File berhasil diunggah.");
  } catch (error) {
    setStatus("error", pendingResource ? "Daftar file belum terkonfirmasi" : "Unggahan belum selesai",
      pendingResource
        ? "File sudah ada di Google Drive. Klik Coba simpan lagi untuk menambahkannya ke daftar tanpa mengunggah ulang."
        : error.message || "Periksa koneksi lalu coba lagi.");
  } finally {
    busy = false;
    loading.finish();
    form.setAttribute("aria-busy", "false");
    // A confirmed upload's fields stay fixed until its list entry is saved.
    setLocked(Boolean(pendingResource));
    submit.textContent = pendingResource ? "Coba simpan lagi" : status.dataset.phase === "error" ? "Coba unggah lagi" : "Unggah file";
    submit.disabled = !pendingResource && Boolean(selectedFileError(fileInput.files?.[0]));
  }
});

document.querySelector("#resourceList").addEventListener("click", event => {
  const button=event.target.closest("[data-edit-file],[data-trash-file]");
  if(!button || !can(session.role,"manage_files"))return;
  const resource=resources.find(r=>r.id===(button.dataset.editFile || button.dataset.trashFile));
  if(!resource)return;
  const editing=Boolean(button.dataset.editFile);
  formDialog({
    title:editing?"Ubah file":"Hapus file kelas",
    description:editing?"Perbarui nama, mata pelajaran, dan kategori file.":"File "+resource.name+" akan dipindahkan ke Sampah Google Drive dan dihapus dari daftar kelas.",
    fields:editing?field("name","Nama file",resource.name,{max:200,required:true,full:true})+field("subject","Mata pelajaran",resource.subject,{max:80,required:true})+`<div class="form-field"><label for="editFileKind">Kategori</label><select id="editFileKind" name="kind"><option value="materi" ${resource.kind==="materi"?"selected":""}>Materi</option><option value="tugas" ${resource.kind==="tugas"?"selected":""}>Tugas</option></select></div>`:"",
    trigger:button,submitLabel:editing?"Simpan perubahan":"Pindahkan ke Sampah",busyLabel:editing?"Menyimpan…":"Menghapus…",
    onSubmit:async payload=>{
      await postAction("/api/drive/manage",{resourceId:resource.id,action:editing?"edit":"trash",...payload});
      listState.retry?.();
    },
    success:editing?"File berhasil diperbarui.":"File dipindahkan ke Sampah Google Drive.",
  });
});
