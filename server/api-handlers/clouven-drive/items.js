import { verifyRequest } from "../../../api/_lib/supabaseAdmin.js";
import { listVisibleDriveItems } from "../../../api/_lib/clouvenDriveAccess.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const actor = await verifyRequest(req, "student");
    const page = req.query?.page === undefined ? 1 : Number(req.query.page);
    const pageSize = req.query?.limit === undefined ? 25 : Number(req.query.limit);
    if (!Number.isInteger(page) || page < 1 || page > 10) return res.status(400).json({ error: "Parameter page harus berupa bilangan 1–10." });
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return res.status(400).json({ error: "Parameter limit harus berupa bilangan 1–50." });
    const query = typeof req.query?.q === "string" ? req.query.q : "";
    if (query.length > 100) return res.status(400).json({ error: "Pencarian maksimal 100 karakter." });
    const parentId = req.query?.parentId || null;
    if (req.query?.parentId && !parentId) return res.status(400).json({ error: "ID folder tidak valid." });
    const result = await listVisibleDriveItems(actor, { parentId, query, page, pageSize });
    res.setHeader?.("Cache-Control", "private, no-store");
    res.setHeader?.("X-Content-Type-Options", "nosniff");
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Daftar Clouven Drive belum dapat dibaca." });
  }
}
