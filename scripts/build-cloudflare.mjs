import { cp, copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const routes = [
  "",
  "jadwal",
  "kalender",
  "tugas",
  "tools",
  "tools/spinning-wheel",
  "penyimpanan",
  "anggota",
  "profile",
  "login",
  "admin",
  "admin/login",
  "kelola",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const route of routes) {
  const source = path.join(root, route, "index.html");
  const destination = path.join(output, route, "index.html");
  try {
    if (!(await stat(source)).isFile()) {
      throw new Error("not a file");
    }
  } catch {
    throw new Error(`Halaman publik wajib tidak ditemukan: ${route || "/"} (index.html)`);
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

await cp(path.join(root, "assets"), path.join(output, "assets"), { recursive: true });

console.log(`Cloudflare static build selesai: ${routes.length} halaman dan direktori assets/ disalin ke dist/.`);
console.log("Hanya halaman publik dan assets/ yang dimasukkan. API, skrip, migrasi database, dan file konfigurasi internal tidak disalin.");
