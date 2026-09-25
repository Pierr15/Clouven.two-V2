import { timingSafeEqual } from "node:crypto";
import { adminSupabase } from "../_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({error:"Method not allowed"});
  const expected = process.env.CRON_SECRET;
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(supplied), b = Buffer.from(expected || "");
  if (!expected || a.length !== b.length || !timingSafeEqual(a,b)) return res.status(401).json({error:"Unauthorized"});
  try {
    const {data,error} = await adminSupabase.rpc("generate_productivity_reminders");
    if (error) throw error;
    return res.status(200).json({created:data});
  } catch (error) {
    console.error("Reminder generation failed", error);
    return res.status(500).json({error:"Pengingat gagal diproses."});
  }
}
