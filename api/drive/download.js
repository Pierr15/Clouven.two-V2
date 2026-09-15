import { verifyPermission } from "../_lib/supabaseAdmin.js";
import { getDriveAccessToken } from "../_lib/drive.js";

import { registeredResource, validateClassFile } from "../_lib/driveResource.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    await verifyPermission(req, "files");
    const id = String(req.query.id || "");
    if (!/^[A-Za-z0-9_-]{8,}$/.test(id)) return res.status(400).json({ error: "File ID tidak valid." });
    await registeredResource(id, true);
    const token = await getDriveAccessToken();
    const meta = await validateClassFile(token, id);
    const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
    if (!fileRes.ok) throw Object.assign(new Error("Gagal membaca file dari Drive."), { status: fileRes.status });
    const body = Buffer.from(await fileRes.arrayBuffer());
    res.setHeader("Content-Type", meta.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", body.length);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(meta.name || "file")}`);
    return res.status(200).send(body);
  } catch (error) {
    console.error(error);
    return res.status(error.status || 500).json({ error: error.message || "Internal server error" });
  }
}
