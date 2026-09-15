import { adminSupabase } from "./supabaseAdmin.js";

export async function registeredResource(id, byDriveId = false) {
  if (!id || typeof id !== "string") throw Object.assign(new Error("File tidak valid."), {status:400});
  const {data, error} = await adminSupabase.from("resources").select("*").eq(byDriveId ? "drive_file_id" : "id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("File tidak terdaftar di kelas."), {status:404});
  return data;
}

export async function driveMeta(token, id) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,parents,trashed`, {headers:{Authorization:`Bearer ${token}`}});
  const meta = await response.json();
  if (!response.ok) throw Object.assign(new Error("File Drive tidak dapat dibaca."), {status:response.status===404?404:502});
  return meta;
}

// A client-written resource row alone must never authorize access to arbitrary Drive files.
export async function validateClassFile(token, fileId, {allowTrashed = false} = {}) {
  const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!root) throw new Error("Folder kelas belum dikonfigurasi.");
  const meta = await driveMeta(token, fileId);
  if (meta.mimeType === "application/vnd.google-apps.folder" || (meta.trashed && !allowTrashed)) throw Object.assign(new Error("File tidak tersedia."), {status:409});
  let parents = meta.parents || [];
  const seen = new Set([fileId]);
  for (let level=0; level<8 && parents.length; level++) {
    if (parents.includes(root)) return meta;
    const next = [];
    for (const parent of parents) {
      if (seen.has(parent)) continue;
      seen.add(parent);
      const folder = await driveMeta(token, parent);
      next.push(...(folder.parents || []));
    }
    parents = next;
  }
  throw Object.assign(new Error("File berada di luar folder kelas."), {status:403});
}
