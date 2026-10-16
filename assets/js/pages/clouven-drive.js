import { requireAuth } from "../auth.js";
import { bootShell } from "../bootstrap.js";

const session = await requireAuth();
if (!session) throw new Error("redirect");
await bootShell("drive");

// This page intentionally ships as a UI foundation only. No file operation is
// simulated as successful until the metadata model and server-side ACL API exist.
const notice = document.querySelector(".drive-foundation-notice");
if (notice) {
  notice.dataset.role = session.role;
  const description = notice.querySelector("p");
  if (session.role === "student") {
    description.textContent = "Daftar file, upload, izin, kuota, dan Sampah belum dihubungkan ke API Clouven Drive. Kontrol yang belum aktif sengaja dinonaktifkan agar tidak memberi kesan bahwa operasi file sudah berjalan.";
  }
}
