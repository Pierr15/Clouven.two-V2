# ClouvenTwo V2 — Revisi 12

**Pembaruan daftar mapel:** salinan ini bernama ClouvenTwo-V2-Forms-Rev12-Data dan menyertakan 13 mapel beserta guru yang diisi pengguna. JSON sudah dinormalisasi dan lolos validator aplikasi. Tidak ada perubahan nama. Buka [mapel-guru.json](assets/data/mapel-guru.json), kemudian impor melalui tab **Mapel & Guru → Pilih file → Simpan daftar baru**. Daftar belum dimasukkan ke database oleh pengerjaan ini. Migrasi Revisi 12 tetap diperlukan jika belum diterapkan.

**Pembaruan jadwal dan login:** halaman Jadwal serta formulir pengelola kini membagi pelajaran menjadi **Blok A (Teori)** dan **Blok B (Bengkel)**. Jadwal lama otomatis dibaca sebagai Blok A dan tidak membutuhkan migrasi tambahan. Setelah login berhasil, halaman tujuan ditutup layar startup penuh, logo **C²** digambar dengan garis tanpa efek kilau, lalu lapisan bergeser untuk memperlihatkan website. Ikon C² pada sidebar tetap statis dan Guest tidak mendapat transisi ini.

Hasil terbaru ada di **ClouvenTwo-V2-Forms-Rev12**. Lihat [REV12-FORMS-INSTAGRAM.md](REV12-FORMS-INSTAGRAM.md) untuk form bertema website, pasangan mapel–guru, input jadwal, serta Instagram anggota/kelas. Template yang perlu kamu isi: [mapel-guru.json](assets/data/mapel-guru.json), dengan petunjuk di [PANDUAN-MAPEL-GURU.md](PANDUAN-MAPEL-GURU.md).

Sebelum memakai fitur baru dengan backend sebenarnya, jalankan **supabase/migrations/202609070001_forms_instagram_rev12.sql** setelah migrasi Revisi 9, lalu deploy folder API bersama frontend. Migrasi belum diterapkan ke produksi dalam pengerjaan ini. Revisi 12 memakai konfigurasi environment yang sama dengan Revisi 11. Bagian di bawah menjelaskan fitur dan setup yang diwarisi dari Revisi 11.

Revisi ini menambahkan dialog penghapusan tugas, pengaturan animasi judul beranda, dan konfigurasi Supabase melalui environment. Hasil ada di **ClouvenTwo-V2-Settings-Rev11**. Project asli serta Revisi 9 dan 10 tetap dipertahankan.

## Penghapusan tugas

Di **Kelola Kelas → Tugas** atau **Admin Panel → Tugas**, tombol Hapus membuka dialog yang menampilkan nama tugas, mata pelajaran, dan dampak penghapusan progres anggota. Batal, Escape, atau klik area luar menutup dialog sebelum konfirmasi.

Setelah dikonfirmasi, tombol menampilkan **Menghapus…** dan menolak klik ganda. Jika gagal, dialog tetap terbuka dengan pesan dan tombol coba ulang. Jika database tidak mengembalikan baris yang dihapus, aplikasi tidak menampilkan sukses palsu. Daftar diperbarui setelah berhasil; fokus keyboard kembali ke formulir. Draf tugas lain tetap terjaga.

## Pengaturan judul beranda

Buka **Info Kelas → Animasi judul beranda**. Bagian ini tersedia di:

- **Admin Panel** untuk Developer.
- **Kelola Kelas** untuk Class Officer, Teacher, dan Developer.

Aktifkan/nonaktifkan animasi, tambah maksimal lima variasi selain Headline/Kata sorot utama, hapus variasi, dan periksa pratinjau. Tekan **Simpan info** untuk menerapkan. Pengaturan berlaku untuk seluruh pengunjung, bukan hanya browser pengelola.

Saat aktif, urutannya adalah judul utama, variasi pertama, dan seterusnya, lalu mengulang. Setiap teks diam **5 detik** setelah selesai diketik, kemudian dihapus. Saat nonaktif, hanya judul utama tampil tetap. Pengunjung dengan preferensi sistem mengurangi gerakan tetap mendapat judul statis.

Pengaturan disimpan di **class_profile.data.titleAnimation**. Tidak ada migrasi SQL tambahan untuk Revisi 11. Aturan akses Revisi 9 tetap berlaku.

## Preview lokal

Gunakan **Node.js 22 atau lebih baru**. Di salinan project lokal yang disiapkan pada pengerjaan ini, .env.local sudah berisi konfigurasi publik yang dipindahkan dari Revisi 10.

Jika memakai ZIP:

1. Ekstrak ke folder baru.
2. Salin .env.example menjadi .env.local.
3. Isi SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY.
4. Jalankan JALANKAN-PREVIEW.bat atau npm start.
5. Buka http://127.0.0.1:3000. Ini harus merupakan server dari `npm start`, bukan Live Server/preview statis.

Tidak perlu instalasi dependensi untuk server preview. Konfigurasi dibaca dari environment proses, lalu .env.local, lalu .env. Nilai proses memiliki prioritas tertinggi. File environment tidak disertakan dalam ZIP.

Preview ini melayani halaman, aset, `/api/config`, nama tampilan Developer untuk Guest, serta endpoint upload/download/pengelolaan Google Drive. Upload menampilkan progress bar 0–100% sebelum Google Drive memproses file. Login dan pemeriksaan role tetap memakai Supabase sesuai environment. Operasi pengelolaan akun selain Drive memerlukan Vercel Functions. Jika token Google kedaluwarsa, jalankan `ATUR-ULANG-GOOGLE-DRIVE.bat`, selesaikan izin Google, lalu jalankan ulang preview. Tes otomatis memakai layanan simulasi, bukan akun/data produksi.

Jika upload menampilkan pesan bahwa API upload belum berjalan, port 3000 sedang dipakai server lain. Tutup server tersebut lalu jalankan `npm start` dari folder project. Kamu juga dapat memakai `npm run start:4173` untuk menjalankan preview project pada port 4173.

## Deployment

Frontend sekarang wajib dapat mengakses **GET /api/config**. Isi SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY di environment Vercel lalu deploy seluruh project, termasuk folder api. Anon key lama dapat menggunakan SUPABASE_ANON_KEY jika publishable key tidak diisi.

Endpoint hanya mengirim URL dan kunci publik. Publishable/anon key memang tetap tersedia di browser; perubahan ini memindahkan konfigurasi dari source code, bukan menyembunyikan kunci publik. Secret/service-role key tetap hanya untuk server dan ditolak jika salah ditempatkan sebagai konfigurasi frontend.

Untuk database yang belum menerima revisi akses, terapkan supabase/migrations/202609060001_role_access_rev9.sql. Database baru memerlukan schema awal terlebih dahulu. Untuk menampilkan nama animasi Developer kepada guest tanpa membuka data anggota lain, terapkan juga `supabase/migrations/202609140001_public_developer_name_profiles.sql` setelah migrasi display name Revisi 13. Detail setup Supabase, Developer awal, dan Google Drive tersedia di [README.md](README.md). Matriks akses: [AKSES-ROLE-REV9.md](AKSES-ROLE-REV9.md).

**Pengerjaan ini belum melakukan deploy, migrasi produksi, atau perubahan akun/data produksi.** Hasil pengujian terbaru ada di [verification/SETTINGS-REV11.md](verification/SETTINGS-REV11.md).
