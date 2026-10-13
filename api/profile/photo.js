import { adminSupabase, verifyRequest } from "../_lib/supabaseAdmin.js";

const BUCKET = "profile-photos";
const LEGACY_BUCKET = "developer-avatars";
const MAX_BYTES = 1 * 1024 * 1024;
const MIME_TYPES = new Set(["image/gif", "image/webp", "image/png", "image/jpeg"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(gif|webp|png|jpg)$/i;

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

function photoObjectFromUrl(value, targetId) {
  if (!value || typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const base = new URL(process.env.SUPABASE_URL);
    if (url.origin !== base.origin) return null;
    const marker = "/storage/v1/object/public/";
    const index = url.pathname.indexOf(marker);
    if (index < 0) return null;
    const tail = url.pathname.slice(index + marker.length).split("/").map((part) => decodeURIComponent(part));
    const bucket = tail.shift();
    const path = tail.join("/");
    if (![BUCKET, LEGACY_BUCKET].includes(bucket)) return null;
    if (!path.startsWith(`${targetId}/`) || path.includes("..")) return null;
    const parts = path.split("/");
    if (parts.length !== 2 || parts[0] !== targetId) return null;
    const filename = parts[1];
    if (bucket === BUCKET && !OBJECT_NAME.test(filename)) return null;
    if (bucket === LEGACY_BUCKET && !/^avatar-\d+\.(gif|webp|png|jpg)$/i.test(filename)) return null;
    return { bucket, path };
  } catch {
    return null;
  }
}

async function removePreviousPhoto(url, targetId) {
  const object = photoObjectFromUrl(url, targetId);
  if (!object) return;
  const { error } = await adminSupabase.storage.from(object.bucket).remove([object.path]);
  if (error) console.warn("Profil foto metadata sudah diperbarui, tetapi objek lama gagal dibersihkan.", error.message);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const actor = await verifyRequest(req);
    const input = req.body || {};
    const action = input.action;
    const targetId = String(input.targetId || actor.uid);

    if (!UUID.test(targetId)) throw httpError("Target akun tidak valid.", 400);
    if (targetId !== actor.uid && actor.role !== "developer") {
      throw httpError("Kamu hanya dapat mengelola foto profil sendiri.", 403);
    }
    if (!["set", "remove"].includes(action)) throw httpError("Aksi foto tidak valid.", 400);

    const { data: target, error: targetError } = await adminSupabase
      .from("members")
      .select("id,photo,role")
      .eq("id", targetId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw httpError("Akun anggota tidak ditemukan.", 404);

    let legacyAvatar = "";
    if (target.role === "developer") {
      const { data: authRecord, error: authReadError } = await adminSupabase.auth.admin.getUserById(targetId);
      if (authReadError) throw authReadError;
      legacyAvatar = authRecord.user?.user_metadata?.avatar_url || "";
    }
    const previousPhotos = [...new Set([target.photo, legacyAvatar].filter(Boolean))];
    let nextPhoto = "";
    if (action === "set") {
      const path = String(input.path || "");
      const [folder, filename, ...extra] = path.split("/");
      if (folder !== targetId || extra.length || !OBJECT_NAME.test(filename || "")) {
        throw httpError("Path foto tidak valid.", 400);
      }

      const { data: objects, error: listError } = await adminSupabase.storage
        .from(BUCKET)
        .list(targetId, { search: filename, limit: 10 });
      if (listError) throw listError;
      const object = (objects || []).find((item) => item.name === filename);
      if (!object) throw httpError("File foto tidak ditemukan. Coba unggah ulang.", 400);
      const size = Number(object.metadata?.size ?? object.metadata?.contentLength);
      const mime = String(object.metadata?.mimetype || object.metadata?.contentType || "");
      if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
        throw httpError("Ukuran foto harus antara 1 byte dan 1 MB.", 400);
      }
      if (mime && !MIME_TYPES.has(mime)) throw httpError("Format foto tidak didukung.", 400);

      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      nextPhoto = `${process.env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${encodedPath}`;
    }

    const { data: updated, error: updateError } = await adminSupabase
      .from("members")
      .update({ photo: nextPhoto, updated_at: new Date().toISOString(), updated_by: actor.uid })
      .eq("id", targetId)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw httpError("Foto profil tidak dapat disimpan.", 404);

    if (target.role === "developer") {
      const { data: authRecord, error: authReadError } = await adminSupabase.auth.admin.getUserById(targetId);
      if (authReadError) console.warn("Metadata avatar Developer gagal dibaca setelah pembaruan foto.", authReadError.message);
      else {
        const metadata = { ...(authRecord.user?.user_metadata || {}), avatar_url: nextPhoto || null };
        const { error: metadataError } = await adminSupabase.auth.admin.updateUserById(targetId, { user_metadata: metadata });
        if (metadataError) console.warn("Metadata avatar Developer gagal disinkronkan.", metadataError.message);
      }
    }
    for (const previousPhoto of previousPhotos) {
      if (previousPhoto !== nextPhoto) await removePreviousPhoto(previousPhoto, targetId);
    }
    return res.status(200).json({ ok: true, targetId, photo: nextPhoto });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("Profile photo operation failed:", error);
    return res.status(status).json({
      error: status < 500 ? error.message : "Foto profil belum dapat disimpan. Coba lagi.",
    });
  }
}
