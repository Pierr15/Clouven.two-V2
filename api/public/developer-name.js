import { adminSupabase } from "../_lib/supabaseAdmin.js";

const publicFields = "id,name,role,name_style,name_color_1,name_color_2,name_color_3";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { data, error } = await adminSupabase
      .from("members")
      .select(publicFields)
      .eq("role", "developer");
    if (error) throw error;
    return res.status(200).json(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error("Gagal membaca tampilan nama Developer", error);
    return res.status(503).json({ error: "Tampilan nama Developer belum tersedia." });
  }
}
