# Kondisi memuat, kosong, dan gagal — Revisi 7

Bagian yang mengambil data kini membedakan permintaan yang masih berjalan, respons berhasil tanpa isi, dan permintaan yang gagal. Kartu status mengikuti warna, tipografi, radius, serta ikon Tabler yang sudah digunakan website, termasuk tema gelap dan preferensi reduced motion.

## Perubahan

- Beranda: informasi kelas dan ringkasan jadwal/piket, apel, serta tugas memiliki status pemuatan terpisah. Kegagalan satu bagian tidak menyamarkan kondisi bagian lain. Hari libur tetap ditampilkan sebagai hari libur.
- Jadwal: status berlaku untuk pelajaran, piket, dan urutan apel. Permintaan hari sebelumnya tidak dapat mengubah tampilan setelah pengguna berpindah hari.
- Tugas: daftar tugas dan progres pengguna harus berhasil dimuat sebelum status selesai/belum selesai ditampilkan. Daftar kosong dibedakan dari filter tanpa hasil.
- Anggota dan penyimpanan: pesan kosong hanya muncul setelah pembacaan berhasil; kegagalan memiliki tombol Coba lagi.
- Profil: pembacaan profil dan ringkasan tugas ditangani; profil yang tidak tersedia mempunyai pesan tersendiri.
- Admin: panel tidak menampilkan formulir berisi data kosong sementara pembacaan awal atau pergantian hari masih berjalan/gagal. Formulir tersedia setelah respons berhasil, termasuk ketika daftar memang kosong.
- Inisialisasi akun dan SDK: kegagalan dapat dicoba ulang. Pesan pada halaman login berada di dalam kartu login; formulir tidak dapat dikirim selama pemeriksaan akun terhambat.
- Permintaan baca yang tidak selesai dalam 15 detik menampilkan pesan gagal. Tombol Coba lagi mengambil ulang data tanpa memuat ulang halaman. Refresh yang tumpang tindih digabungkan, dan hasil permintaan yang telah ditinggalkan diabaikan.
- Semua sepuluh halaman memakai versi CSS dan entry module `data-states-7`. Revisi tema/avatar dan perataan sidebar tetap dipertahankan.

## Verifikasi lokal

- 25 skenario kondisi data lulus: 20 skenario inti ditambah 5 pemeriksaan panel admin, profil kosong, dan pemulihan halaman login. Skenario mencakup koneksi lambat, gagal, kosong, retry, timeout, respons terlambat, kegagalan progres tugas, kegagalan SDK, serta error saat refresh latar belakang.
- 18 pemeriksaan interaksi lulus, termasuk navigasi mobile, fokus keyboard, dialog, tools, tab jadwal, panel admin, login, dan pembatasan UI untuk tamu/siswa.
- Tampilan pesan gagal mobile pada tema terang/gelap diperiksa dari screenshot; tidak ada overflow halaman pada viewport pengujian 390 px.
- 17 module JavaScript frontend lolos pemeriksaan sintaks.
- Hash 46 file proyek sumber diperiksa ulang: tidak ada perubahan.

Backend disimulasikan dalam pengujian, dan koneksi aplikasi ke layanan produksi diblokir oleh fixture. Hasil ini bukan pengujian RLS, login produksi, Google Drive, atau deploy Vercel. Skrip interaksi memberi batas waktu pada pengambilan font/ikon eksternal agar gangguan CDN tidak menggantung seluruh pemeriksaan.

Hasil terperinci: `rev7-data-states-results.json`, `rev7-interactions.json`, dan screenshot `rev7-mobile-*-errors.png`. Bukti revisi sebelumnya tetap disimpan sebagai riwayat dan tidak menyatakan pengujian ulang seluruh matriks lama.

Menjalankan ulang: `node tests/ui-data-states.cjs` dan `node tests/ui-interactions.cjs` dengan Playwright/Microsoft Edge seperti panduan proyek. Skrip tidak mengubah akun atau data produksi.
