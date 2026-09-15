export function instagramUsername(value = "") {
  if (typeof value !== "string") throw new Error("Akun Instagram harus berupa username atau tautan profil.");
  let name = value.trim();
  if (!name) return "";
  if (/^https?:\/\//i.test(name)) {
    let url;
    try { url = new URL(name); } catch { throw new Error("Tautan Instagram tidak valid."); }
    if (!["instagram.com","www.instagram.com"].includes(url.hostname) || url.username || url.password || url.port) throw new Error("Gunakan tautan profil instagram.com.");
    name = url.pathname.replace(/^\/|\/$/g, "");
  }
  name = name.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_](?:[a-z0-9_.]{0,28}[a-z0-9_])?$/.test(name) || name.includes("..")) throw new Error("Username Instagram maksimal 30 karakter: huruf, angka, titik, atau garis bawah.");
  return name;
}
export function instagramUrl(value) {
  try { const name = instagramUsername(value); return name ? "https://www.instagram.com/" + name + "/" : ""; } catch { return ""; }
}
