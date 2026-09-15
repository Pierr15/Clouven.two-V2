import { createClient } from "@supabase/supabase-js";
import { can } from "../../assets/js/permissions.js";

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secretKey) throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY belum lengkap.");

export const adminSupabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const ranks = { guest: 0, student: 1, class_officer: 2, teacher: 3, developer: 4 };

export async function verifyRequest(req, minimum = "student") {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) throw Object.assign(new Error("Unauthorized"), { status: 401 });

  const { data, error } = await adminSupabase.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error("Unauthorized"), { status: 401 });

  const { data: profile, error: profileError } = await adminSupabase
    .from("members")
    .select("id,name,username,role,class_role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw Object.assign(new Error("Akun tidak terdaftar sebagai anggota kelas."), {status:403});
  const role = profile.role;
  if ((ranks[role] ?? 0) < (ranks[minimum] ?? 0)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  return { uid: data.user.id, user: data.user, role, profile };
}

export async function verifyPermission(req, permission) {
  const actor = await verifyRequest(req);
  if (!can(actor.role, permission)) throw Object.assign(new Error("Akses tidak diizinkan."), {status:403});
  return actor;
}
