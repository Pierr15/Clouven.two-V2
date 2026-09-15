# Verifikasi Revisi 11

Dijalankan lokal pada 7 September 2026. Tidak ada migrasi, deploy, atau operasi tulis terhadap layanan produksi.

| Pemeriksaan | Hasil |
| --- | --- |
| Sintaks JavaScript aplikasi, API, dan server preview | 40 file lulus |
| UI fitur Revisi 11, Edge headless | 18 skenario lulus |
| Regresi matriks akses dan UI dari Revisi 9 | 35 skenario lulus |
| Siklus typewriter sebelumnya | Lulus pada 320, 390, dan 1440 px |
| Validasi endpoint konfigurasi publik | 14 pemeriksaan lulus |
| Server preview dengan environment nyata | Konfigurasi ada/kosong, prioritas environment, route halaman, penolakan POST, dan pemblokiran file privat lulus |
| Preview Revisi 11 di port 4176 | /api/config mengembalikan HTTP 200 dan hanya field url + publishableKey |

## Cakupan UI

- Pengaturan tersedia dan tersimpan untuk Developer di Admin, serta Class Officer/Teacher di Kelola Kelas.
- Nilai tersimpan dimuat kembali saat berganti tab panel; kegagalan simpan mempertahankan draf dan bisa dicoba ulang.
- Maksimal lima variasi tambahan, penghapusan dan penomoran variasi, pencegahan simpan ganda.
- Judul berganti sesuai urutan setelah diam 5.000 ms, dihapus, lalu diketik ulang. Tinggi judul stabil saat berganti frasa.
- Animasi dapat dimatikan; preferensi reduced motion menampilkan judul statis.
- Dialog hapus menyebut tugas/mata pelajaran dan dampak progres, Batal/Escape, fokus keyboard, status Menghapus, klik ganda, gagal dan coba ulang.
- Penolakan penghapusan tanpa baris hasil tidak dianggap sukses.
- Kegagalan konfigurasi dapat dicoba ulang, dan client Supabase tidak dibuat sebelum konfigurasi publik lolos validasi.
- Tampilan editor dan dialog tidak melebar keluar viewport pada 320, 390, dan 1440 px dalam mode terang serta gelap.

Screenshot hasil terbaru yang disertakan: rev11-settings-desktop-light.png, rev11-settings-mobile-dark.png, rev11-delete-mobile-dark.png. Tampilan ketiganya diperiksa secara visual.

## Bukti dan batas

Hasil mesin: settings-results.json, ui-access-results.json, typewriter-results.json, config-results.json, preview-config-results.json, preservation-rev11.json.

UI memakai akun, data Supabase, dan respons API simulasi. Tes server konfigurasi menjalankan handler serta server Node yang sebenarnya dengan nilai environment terisolasi. Endpoint preview juga diperiksa memakai konfigurasi publik yang dipindahkan dari Rev10; tidak melakukan login atau perubahan data produksi.

Aturan SQL tidak diubah oleh Revisi 11. Hasil tes RLS/API lain di folder ini berasal dari revisi sebelumnya dan tidak diklaim sebagai pengujian produksi baru. Pengujian autentikasi/CRUD/Drive pada deployment tetap perlu dilakukan setelah environment dan revisi akses database diaktifkan.

Penghapusan progres bersandar pada foreign key task_progress.task_id dengan ON DELETE CASCADE dalam schema aplikasi yang sudah ada.
