# Revisi 12 — Form, jadwal, dan Instagram

Revisi disimpan pada folder ClouvenTwo-V2-Forms-Rev12. Project asli dan Revisi 11 dipertahankan.

## Form mengikuti identitas website

Dropdown dan daftar saran memakai menu bertema website, dengan tombol dan warna yang mengikuti light/dark mode. Dropdown mendukung keyboard: panah, Home/End, Enter, Escape, dan pencarian awal dengan huruf. Kalender tanggal juga memakai tampilan website. Input teks, angka, jam, checkbox, radio, serta tombol pilih file memakai gaya yang sama. Dialog pemilihan file pada sistem operasi tetap menggunakan pemilih berkas perangkat.

## Daftar mapel–guru

Buka **Admin Panel → Mapel & Guru** atau **Kelola Kelas → Mapel & Guru**.

1. Unduh atau edit assets/data/mapel-guru.json.
2. Isi nama mapel dan daftar guru.
3. Pilih JSON melalui formulir impor.
4. Periksa pratinjau, lalu tekan **Simpan daftar baru**.

Daftar tidak diambil dari jadwal lama. Pada salinan Forms-Rev12-Data, file sudah berisi 13 mapel dan guru yang dilengkapi pengguna, telah diperbaiki format JSON-nya tanpa mengubah nama. Impor menggantikan daftar referensi dalam satu transaksi database, sehingga kegagalan impor tidak menghapus sebagian daftar lama. Jadwal serta tugas yang sudah tersimpan tidak diubah oleh impor.

Batas: 100 mapel, 1–20 guru per mapel, masing-masing nama maksimal 100 karakter, dan file maksimal 100 KB. Nama mapel/guru yang duplikat ditolak. Template memakai schemaVersion 1 dan array subjects; petunjuk serta contoh ada di [PANDUAN-MAPEL-GURU.md](PANDUAN-MAPEL-GURU.md).

Saat membuat tugas atau mengisi jadwal:

- Pilih mapel dari daftar.
- Jika satu guru terdaftar, kolom guru otomatis terisi.
- Jika beberapa guru terdaftar, pilih salah satu guru terkait.
- Mengganti mapel menghapus pilihan guru dari mapel sebelumnya.
- Mapel/guru data lama tetap tampil saat mengedit catatan lama. Mengubah daftar referensi tidak memigrasikan data lama secara otomatis.

## Jadwal lebih mudah diisi

Pada **Jadwal & Piket**, pilih hari lalu tambahkan baris pelajaran. Setiap baris memiliki jam mulai, jam selesai, mapel, guru, dan ruangan. Jam dapat diketik sebagai 0700 atau 07:00. Baris dapat dihapus; jadwal disimpan menurut jam mulai.

Tombol **Salin pelajaran** menambahkan pelajaran dari hari sumber ke hari yang diedit. Daftar piket hari sumber tidak ikut disalin. Salinan belum tersimpan sampai tombol **Simpan jadwal** ditekan. Jam selesai harus setelah jam mulai dan antarbaris tidak boleh bertabrakan.

Petugas piket dipilih melalui checkbox anggota. Nama piket lama yang belum cocok dengan nama anggota tetap ditampilkan agar tidak hilang saat pengeditan.

## Instagram anggota

Semua role anggota dapat mengubah Instagram sendiri melalui **Profile → Edit Instagram** atau membuka kartu sendiri di **Members → Edit Instagram**.

Developer dapat membantu mengubah Instagram anggota lain melalui kartu anggota (dialog biodata) atau **Admin → Akun & Role → Biodata**. Hak edit biodata lainnya tetap mengikuti Revisi 9; Student dan Class Officer tidak memperoleh hak mengganti nama, role, atau biodata lain melalui fitur Instagram.

Masukan menerima @username atau tautan profil Instagram dan disimpan sebagai username yang dinormalisasi. Kosongkan untuk menghapus tautan. Kartu anggota menampilkan username, sedangkan detail kartu menyediakan tautan ke Instagram di tab baru. Halaman anggota tetap memerlukan login.

## Preview Instagram kelas

Ikon **ST** menampilkan kartu @clouven.two saat di-hover, berisi avatar/logo kelas, deskripsi singkat, dan tombol Buka Instagram. Kartu tetap terbuka saat pointer dipindahkan ke dalamnya, lalu menghilang dengan fade. Pada perangkat sentuh, ketuk ikon untuk membuka preview. Escape atau klik di luar menutupnya.

Keyboard: fokus ikon lalu Enter/Space untuk membuka; ArrowDown membuka dan memindahkan fokus ke tautan. Tab dari ikon menuju tombol Instagram. Brand teks “Ruang Kelas” tetap menuju beranda.

Avatar menggunakan monogram C² website. Preview tidak mengambil feed, foto akun, statistik, atau metadata langsung dari Instagram. Tautan menuju https://www.instagram.com/clouven.two/.

## Aktivasi database dan server

Jalankan **supabase/migrations/202609070001_forms_instagram_rev12.sql** setelah schema awal dan migrasi akses Revisi 9.

Migrasi menambahkan:

- Kolom members.instagram dengan validasi username.
- Tabel subject_teachers dengan aturan akses pengelola kelas.
- Fungsi replace_subject_teachers untuk impor JSON yang atomik.

Data mapel–guru tidak diisi oleh migrasi. Impor JSON yang sudah dilengkapi lewat panel setelah migrasi diterapkan.

Deploy seluruh project beserta folder api. Endpoint baru POST /api/profile/instagram memverifikasi akun dan selalu menulis ke ID pengguna yang sedang login. Endpoint admin/update-user melayani perubahan oleh Developer. Direct write dari browser ke tabel members tetap ditolak. Environment Supabase/Google Drive mengikuti [README.md](README.md).

**Tidak ada migrasi atau deployment produksi yang dijalankan dalam pengerjaan ini.** Preview lokal menyediakan halaman dan endpoint konfigurasi; penulisan profil Instagram memerlukan Vercel Functions. Pengujian UI memakai data simulasi. Jika migrasi belum dijalankan, fitur katalog dan Instagram pada backend sebenarnya belum bisa digunakan.
