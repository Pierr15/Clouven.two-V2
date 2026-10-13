import { supabase } from "./supabase.js";
import { authHeader } from "./auth.js";

const BUCKET = "profile-photos";
const MAX_BYTES = 2 * 1024 * 1024;
const MIME_EXT = Object.freeze({
  "image/gif": "gif",
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
});

async function validateImage(file) {
  if (!file || !MIME_EXT[file.type]) {
    throw new Error("Format tidak didukung. Pilih GIF, WebP, PNG, atau JPG.");
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    throw new Error("Ukuran foto harus lebih dari 0 byte dan maksimal 2 MB.");
  }
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  let valid = false;
  if (file.type === "image/png") valid = starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (file.type === "image/jpeg") valid = starts(0xff, 0xd8, 0xff);
  if (file.type === "image/gif") valid = String.fromCharCode(...bytes.slice(0, 4)) === "GIF8";
  if (file.type === "image/webp") valid = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!valid) throw new Error("Isi file tidak cocok dengan format gambar yang dipilih.");
}

async function requestPhoto(payload) {
  const response = await fetch("/api/profile/photo", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Foto profil gagal disimpan.");
  return result;
}

export async function uploadProfilePhoto(targetId, file) {
  await validateImage(file);
  const path = `${targetId}/${crypto.randomUUID()}.${MIME_EXT[file.type]}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type,
    cacheControl: "3600",
  });
  if (error) throw error;
  try {
    const result = await requestPhoto({ action: "set", targetId, path });
    return result.photo;
  } catch (error) {
    const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([path]);
    if (cleanupError) console.warn("Gagal membersihkan upload profil yang tidak terpakai.", cleanupError);
    throw error;
  }
}

export async function removeProfilePhoto(targetId) {
  return requestPhoto({ action: "remove", targetId });
}
