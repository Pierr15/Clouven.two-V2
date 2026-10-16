import { verifyRequest } from "../../../api/_lib/supabaseAdmin.js";
import { getVisibleDriveOverview } from "../../../api/_lib/clouvenDriveAccess.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const actor = await verifyRequest(req, "student");
    const overview = await getVisibleDriveOverview(actor);
    res.setHeader?.("Cache-Control", "private, no-store");
    res.setHeader?.("X-Content-Type-Options", "nosniff");
    return res.status(200).json({ ok: true, ...overview });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Ringkasan Clouven Drive belum dapat dibaca." });
  }
}
