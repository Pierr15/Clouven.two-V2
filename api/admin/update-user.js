import { adminSupabase, verifyPermission } from "../_lib/supabaseAdmin.js";
import { profilePatch, rejectFields } from "../_lib/profiles.js";

const ROLES = new Set(["student", "class_officer", "teacher", "developer"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const actor = await verifyPermission(req, "edit_user"), input = req.body || {};
    rejectFields(input, ["uid", "role", "name", "number", "classRole", "quote", "photo", "instagram"]);
    if (!input.uid || ("role" in input && !ROLES.has(input.role))) return res.status(400).json({ error: "UID atau role tidak valid." });
    if (input.uid === actor.uid && input.role && input.role !== actor.role) return res.status(400).json({ error: "Role akun yang sedang digunakan tidak dapat diturunkan." });
    const { data: target, error: readError } = await adminSupabase.from("members").select("id,role").eq("id", input.uid).maybeSingle();
    if (readError) throw readError;
    if (!target) return res.status(404).json({ error: "Akun tidak ditemukan." });
    const patch = { ...profilePatch(input), updated_at: new Date().toISOString(), updated_by: actor.uid };
    if (input.role) patch.role = input.role;
    const { error } = await adminSupabase.from("members").update(patch).eq("id", input.uid);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Perubahan akun gagal disimpan. Pastikan masih ada Developer aktif." });
  }
}
