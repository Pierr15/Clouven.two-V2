import {instagramUsername} from "../../assets/js/instagram.js";
export function profilePatch(input) {
  const fields = {name:120, number:30, classRole:80, quote:500, photo:1000};
  const patch = {};
  if("instagram" in input) {
    try {patch.instagram=instagramUsername(input.instagram);}
    catch(error){throw Object.assign(error,{status:400});}
  }
  for (const [key, limit] of Object.entries(fields)) {
    if (!(key in input)) continue;
    if (typeof input[key] !== "string" || input[key].trim().length > limit) throw Object.assign(new Error(`Isian ${key} tidak valid.`), {status:400});
    patch[key === "classRole" ? "class_role" : key] = input[key].trim();
  }
  if (patch.name === "") throw Object.assign(new Error("Nama wajib diisi."), {status:400});
  if (patch.photo && !patch.photo.startsWith("/assets/images/")) {
    try { if (new URL(patch.photo).protocol !== "https:") throw new Error(); }
    catch { throw Object.assign(new Error("Foto harus menggunakan URL HTTPS atau aset website."), {status:400}); }
  }
  return patch;
}
export function rejectFields(input, allowed) {
  if (Object.keys(input).some(key => !allowed.includes(key))) throw Object.assign(new Error("Ada kolom yang tidak diizinkan."), {status:400});
}
