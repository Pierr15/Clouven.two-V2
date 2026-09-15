export async function getDriveAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "",
    grant_type: "refresh_token",
  });
  if (![...body.values()].every(Boolean)) throw new Error("Google Drive environment variables belum lengkap.");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    if (data.error === "invalid_grant") throw Object.assign(
      new Error("Koneksi Google Drive kedaluwarsa atau dicabut. Jalankan ATUR-ULANG-GOOGLE-DRIVE.bat lalu login ulang ke Google."),
      {status:503,code:"GOOGLE_REAUTHORIZE"});
    throw Object.assign(new Error(data.error_description || "Gagal mengambil access token Google Drive."), {status:502,code:"GOOGLE_OAUTH_FAILED"});
  }
  return data.access_token;
}

function escapeDriveQuery(value) { return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
export async function findOrCreateFolder(token, name, parentId) {
  const q = `'${escapeDriveQuery(parentId)}' in parents and name = '${escapeDriveQuery(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const list = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`, { headers: { Authorization: `Bearer ${token}` } });
  const listed = await list.json();
  if (!list.ok) throw new Error(listed.error?.message || "Gagal membaca folder Google Drive.");
  if (listed.files?.[0]?.id) return listed.files[0].id;
  const create = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }) });
  const created = await create.json();
  if (!create.ok) throw new Error(created.error?.message || "Gagal membuat folder Google Drive.");
  return created.id;
}

export async function destinationFolder(token, kind, subject) {
  const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!root) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID belum diatur.");
  const category = kind === "tugas" ? "Tugas" : "Materi";
  const categoryId = await findOrCreateFolder(token, category, root);
  const safeSubject = String(subject || "Umum").trim().slice(0, 80) || "Umum";
  return findOrCreateFolder(token, safeSubject, categoryId);
}
