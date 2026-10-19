import { verifyRequest } from "../../../api/_lib/supabaseAdmin.js";
import { resolveDriveItemAccess } from "../../../api/_lib/clouvenDriveAccess.js";
import { getDriveAccessToken } from "../../../api/_lib/drive.js";
import { downloadDriveFileBytes } from "../../../api/_lib/clouvenDriveGoogle.js";
import { apiError } from "../../../api/_lib/clouvenDriveJournal.js";

function attachmentName(name) {
  const safe = String(name || "file").replace(/[\r\n"\\/]/g, "_").slice(0, 180);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export function createDownloadHandler({
  authenticate = verifyRequest,
  resolveAccess = resolveDriveItemAccess,
  getToken = getDriveAccessToken,
  downloadBytes = downloadDriveFileBytes,
} = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    res.setHeader?.("Cache-Control", "private, no-store");
    res.setHeader?.("X-Content-Type-Options", "nosniff");
    try {
      const actor = await authenticate(req, "student");
      const rawId = req.query?.itemId || req.query?.id;
      const itemId = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!itemId) throw apiError(400, "Parameter itemId wajib diisi.", "ITEM_ID_REQUIRED");

      const { item } = await resolveAccess(actor, String(itemId));
      if (item.item_type !== "file" || !item.drive_file_id) {
        throw apiError(400, "Item yang dipilih bukan file yang dapat diunduh.", "ITEM_NOT_DOWNLOADABLE");
      }

      const token = await getToken();
      const bytes = await downloadBytes({ token, driveFileId: item.drive_file_id });
      res.setHeader?.("Content-Type", item.mime_type || "application/octet-stream");
      res.setHeader?.("Content-Length", String(bytes.length));
      res.setHeader?.("Content-Disposition", attachmentName(item.name));
      return res.status(200).send(bytes);
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) console.error("[clouven-drive/download]", error.code || "INTERNAL_ERROR");
      return res.status(status).json({
        error: status >= 500 && !error.code ? "File belum dapat diunduh." : error.message,
        code: error.code || undefined,
      });
    }
  };
}

export default createDownloadHandler();
