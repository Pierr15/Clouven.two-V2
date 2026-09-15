# Verifikasi Revisi 12

Catatan pembaruan Forms-Rev12-Data: laporan di bawah adalah pengujian implementasi Revisi 12 sebelumnya. File JSON pada salinan terbaru kini sudah berisi 13 mapel dari pengguna. Validasi data terbaru dicatat terpisah dalam catalog-user-data-results.json; tidak ada impor ke database produksi.

Dijalankan lokal pada 7 September 2026. Tidak ada migrasi, deploy, login, atau perubahan data produksi dalam pengujian.

| Pemeriksaan | Hasil |
| --- | --- |
| Sintaks JavaScript aplikasi, API, dan preview server | 47 file lulus |
| Fitur UI Revisi 12 | 22 skenario utama + 2 skenario tambahan lulus |
| Regresi UI dan akses Revisi 9 | 35 skenario lulus |
| Regresi pengaturan judul, hapus tugas, konfigurasi Revisi 11 | 18 skenario lulus |
| API Instagram | 14 skenario lulus |
| Regresi API dan matriks role sebelumnya | 57 skenario lulus |
| Migrasi, RLS, dan transaksi PostgreSQL lokal | 25 skenario lulus; migrasi Revisi 12 dijalankan dua kali |
| Preview server | Endpoint konfigurasi, prioritas environment, blok file privat, route halaman, dan penolakan POST lulus |

## Cakupan

- Pemilihan mapel mengisi satu guru otomatis, mengosongkan guru sebelumnya saat mapel berubah, dan memberi pilihan guru terkait jika lebih dari satu.
- Perilaku tersebut diperiksa pada Admin Developer serta Kelola Kelas Class Officer dan Teacher.
- JSON tidak valid tidak bisa disimpan; file valid memiliki pratinjau, belum mengubah database sebelum dikonfirmasi, dan dapat dicoba ulang setelah gagal.
- Pengisian jadwal, salin pelajaran hari lain, deteksi tabrakan jam, penghapusan baris, pilihan piket, dan penyimpanan diperiksa pada ketiga role pengelola.
- Semua role anggota dapat mengedit Instagram sendiri; Student/Class Officer tetap tidak mendapat tombol edit biodata umum. Tautan kartu dan penghapusan username diuji.
- API menolak guest/orphan, UID/role/nama tambahan, tautan non-Instagram dan input tidak valid. Developer dapat mengedit Instagram anggota lain. Penulisan selalu terikat aktor yang telah diverifikasi.
- Tabel mapel–guru hanya dapat dibaca/dikelola pengelola. Direct write browser ke members tetap ditolak. Impor JSON tidak valid rollback sepenuhnya.
- Dropdown diuji dengan mouse/keyboard dan di dalam modal, termasuk Escape yang menutup menu tanpa menutup modal. Saran nama anggota tetap muncul jika input difokuskan sebelum proses enhancement selesai.
- Kalender tanggal bertema website, pilihan dropdown, serta preview Instagram kelas diuji.
- Preview rk diperiksa pada sidebar lebar, ringkas, dan ketukan ponsel; pointer bisa berpindah ke kartu, tautan memakai tab baru, dan Escape menutup preview.
- Layout diperiksa pada 320, 390, dan 1440 px, dalam tema terang/gelap. Tidak ada overflow horizontal pada skenario yang diuji.

Screenshot yang diperiksa secara visual dan disertakan: rev12-schedule-desktop-light.png, rev12-dropdown-mobile-dark.png, rev12-brand-light.png.

## Bukti dan batas

Bukti mesin: forms-results.json, forms-supplementary-results.json, ui-access-results.json, settings-results.json, instagram-api-results.json, api-access-results.json, rls-forms-results.json, preview-config-results.json, preservation-rev12.json.

UI menggunakan Edge headless dan Supabase/API simulasi. Tes endpoint memakai handler asli dengan layanan terisolasi. Tes database memakai PostgreSQL lokal melalui PGlite, bukan database Supabase produksi.

Data pengujian Bahasa Indonesia/Bu Liza dan mapel lain hanya berada dalam fixture tes. Template yang dikirim tetap memiliki isian kosong untuk dilengkapi pengguna. Mengisi atau mengimpor fixture pengujian tidak dilakukan pada database produksi.

Migrasi baru dan Vercel Functions harus diaktifkan pada lingkungan deployment sebelum fitur katalog serta penyimpanan Instagram bisa dipakai dengan layanan sebenarnya. Pengujian produksi, CRUD akun nyata, dan integrasi Google Drive produksi tidak dilakukan di revisi ini. Hasil verifikasi lain yang diwarisi dari revisi sebelumnya bukan pengujian baru.
