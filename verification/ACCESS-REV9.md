# Verifikasi akses dan UI — Revisi 9

## Acuan dan lokasi

- Sumber keputusan: workbook revisi pengguna, **Usulan Akses A7:H32**.
- **130 keputusan akses** (26 fitur × 5 role) cocok dengan matriks implementasi.
- Hasil terpisah: ClouvenTwo-V2-Access-Rev9.
- Project asli: 46 hash SHA-256 dibandingkan dengan baseline; **0 file berubah**.
- Hasil Revisi 8 dipertahankan.

## Pengujian lokal

| Kelompok | Hasil | Bukti |
| --- | --- | --- |
| Handler API dan matriks akses | 57 skenario lulus, termasuk pemeriksaan 130 keputusan | api-access-results.json |
| PostgreSQL / RLS | 92 skenario lulus pada PGlite 0.5.8 | rls-access-results.json |
| UI role, interaksi, dan responsivitas | 35 skenario unik lulus | ui-access-results.json |
| Tambahan pengelolaan tugas | Create, edit, delete diuji pada kedua role pengelola | ui-operational-results.json |
| Regresi kondisi data | 4 skenario pemulihan/penolakan akun tanpa anggota lulus | rev9-data-state-results.json |
| Regresi unggah | 5 skenario lulus, termasuk XHR asli ke endpoint lokal dan retry tanpa unggah ganda | rev9-upload-results.json |
| Regresi tema | 10 transisi avatar/rotasi + reduced motion lulus | rev9-avatar-rotation-results.json |

Seluruh file JavaScript diperiksa sintaksnya. UI memakai Microsoft Edge headless/Playwright. Lebar yang diperiksa: 320, 390, dan 1440 piksel, dalam light/dark mode. Tidak ditemukan overflow horizontal tak disengaja pada halaman dan dialog baru.

Pengujian mencakup:
- Admin khusus Developer; pengurus/guru diarahkan ke Kelola Kelas.
- Guest tidak mengambil ringkasan tugas.
- Progress milik sendiri dan milik orang lain sesuai role, termasuk insert/update/delete langsung di SQL.
- Penolakan upaya mengganti UID atau role lewat endpoint biodata sendiri.
- Penolakan perubahan akun/file oleh role yang tidak berhak.
- Konfirmasi username saat hapus akun dan pencocokan password baru.
- Perlindungan akun Developer terakhir pada SQL, termasuk cascade dari auth.users.
- File Drive wajib terdaftar dan berada dalam folder kelas.
- Hapus menggunakan Trash, pemulihan saat pembaruan metadata gagal, serta penolakan file di luar folder kelas.
- Isi formulir tidak hilang ketika simpan gagal; pesan error, retry, fokus keyboard, Escape.
- Nama/foto profil dan teks jadwal tidak dapat menyisipkan markup ke tampilan.

## Batas verifikasi

Tidak ada akun, tugas, atau file produksi yang diubah. API diuji dengan layanan Auth/Supabase/Drive simulasi. UI memakai akun serta data simulasi. SQL/RLS dijalankan oleh PostgreSQL lokal PGlite dengan fixture auth.uid; bukan Supabase produksi.

Belum diuji di sini: Google OAuth/Drive nyata, login/reset/delete akun produksi, delivery Realtime antarklien pada hosting, sesi database bersamaan, perangkat HP fisik, dan deployment Vercel. **Migrasi Revisi 9 belum diterapkan ke server produksi.**

Ubah file berarti ubah nama, mata pelajaran, dan kategori/folder; website tidak mengedit isi dokumen biner. Hapus file memakai Sampah Drive. Reset password menetapkan password baru melalui admin Auth API tanpa mengirim email.

## Mengulang tes

Gunakan Node.js 24 untuk seluruh rangkaian tes. Dari folder project:

~~~powershell
npm install --no-save --package-lock=false playwright @electric-sql/pglite@0.5.8
node tests/api-access.mjs
node tests/rls-access.mjs
node tests/ui-access.cjs
node tests/ui-upload.cjs
node tests/ui-data-states.cjs
node tests/ui-avatar-rotation.cjs
~~~

UI memakai Microsoft Edge. PLAYWRIGHT_MODULE, PGLITE_MODULE, dan PGLITE_PGCRYPTO dapat diarahkan ke runtime yang sudah tersedia; dua variabel PGlite memakai URL file module ESM.

Script baru tidak menggunakan credential produksi. Browser pengujian memblokir koneksi aplikasi ke backend asli; hanya font dan ikon eksternal yang dapat dimuat. Screenshot bukti memakai data simulasi.
