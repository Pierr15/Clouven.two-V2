import { adminSupabase } from "../../../api/_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { data, error } = await adminSupabase
      .from("members")
      .select("id,name,photo,role,role_label,class_role")
      .order("number", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return res.status(200).json((data || []).map((member) => ({
      id: member.id,
      name: member.name,
      photo: member.photo || "",
      role: member.role,
      roleLabel: member.role_label || "",
      classRole: member.class_role || "Anggota",
    })));
  } catch (error) {
    console.error("Gagal membaca foto profil publik:", error);
    return res.status(503).json({ error: "Daftar foto profil belum tersedia." });
  }
}
