import { verifyRequest } from "../_lib/supabaseAdmin.js";
import { destinationFolder, getDriveAccessToken } from "../_lib/drive.js";

export const config = { api: { bodyParser: false } };
const MAX_BYTES = 3 * 1024 * 1024;

async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BYTES) throw Object.assign(new Error("File melebihi batas 3 MB."), { status: 413 }); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    await verifyRequest(req, "class_officer");
    const content = await readBody(req);
    if (!content.length) return res.status(400).json({ error: "File kosong." });
    const name = decodeURIComponent(String(req.headers["x-file-name"] || "file")).replace(/[\\/]/g, "-").slice(0, 180);
    const subject = decodeURIComponent(String(req.headers["x-subject"] || "Umum")).slice(0, 80);
    const kind = req.headers["x-kind"] === "tugas" ? "tugas" : "materi";
    const mimeType = String(req.headers["content-type"] || "application/octet-stream");
    const token = await getDriveAccessToken();
    const folderId = await destinationFolder(token, kind, subject);
    const create = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,size", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, parents: [folderId] }) });
    const file = await create.json();
    if (!create.ok) throw new Error(file.error?.message || "Gagal membuat file di Drive.");
    const upload = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.id)}?uploadType=media&fields=id,name,mimeType,size`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": mimeType }, body: content });
    const uploaded = await upload.json();
    if (!upload.ok) throw new Error(uploaded.error?.message || "Gagal mengunggah isi file ke Drive.");
    return res.status(201).json(uploaded);
  } catch (error) {
    console.error(error);
    return res.status(error.status || 500).json({ error: error.message || "Internal server error", code:error.code || undefined });
  }
}
