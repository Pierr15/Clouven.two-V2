import { adminSupabase, verifyRequest } from "../_lib/supabaseAdmin.js";

const ROLES = new Set(["student", "class_officer", "teacher", "developer"]);
function normalizeUsername(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  let createdUser = null;
  try {
    const actor = await verifyRequest(req, "developer");
    const {
      name,
      username: raw,
      password,
      role = "student",
      number = "",
      classRole = "Anggota",
    } = req.body || {};
    const username = normalizeUsername(raw);
    if (
      !name?.trim() ||
      username.length < 2 ||
      String(password || "").length < 6
    ) {
      return res.status(400).json({
        error:
          "Nama, username/NIS, dan password minimal 6 karakter wajib diisi.",
      });
    }
    if (!ROLES.has(role))
      return res.status(400).json({ error: "Role tidak valid." });

    const email = `${username}@clouven.local`;
    const { data: created, error: createError } =
      await adminSupabase.auth.admin.createUser({
        email,
        password: String(password),
        email_confirm: true,
        user_metadata: { name: String(name).trim(), username },
      });
    if (createError) throw createError;
    createdUser = created.user;

    const { error: memberError } = await adminSupabase.from("members").insert({
      id: createdUser.id,
      name: String(name).trim(),
      username,
      number: String(number).trim(),
      role,
      class_role: String(classRole || "Anggota").trim(),
      created_by: actor.uid,
    });
    if (memberError) throw memberError;

    return res.status(201).json({ uid: createdUser.id, username, role });
  } catch (error) {
    if (createdUser?.id)
      await adminSupabase.auth.admin.deleteUser(createdUser.id).catch(() => {});
    console.error(error);
    const duplicate =
      error.code === "23505" ||
      /already|registered|exists/i.test(error.message || "");
    return res.status(error.status || 500).json({
      error: duplicate
        ? "Username/NIS sudah digunakan."
        : error.message || "Internal server error",
    });
  }
}
