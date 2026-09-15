# Matriks akses — Revisi 9

Sumber: Usulan Akses A7:H32 pada workbook revisi pengguna. Keputusan diterapkan pada UI, API, dan RLS sesuai jenis fitur.

| Fitur | Guest | Student | Class Officer | Teacher | Developer |
| --- | --- | --- | --- | --- | --- |
| Beranda dan informasi kelas | Izinkan | Izinkan | Izinkan | Izinkan | Izinkan |
| Jadwal pelajaran dan piket | Izinkan | Izinkan | Izinkan | Izinkan | Izinkan |
| Urutan pemimpin apel | Izinkan | Izinkan | Izinkan | Izinkan | Izinkan |
| Ringkasan tugas di beranda | Tolak | Izinkan | Izinkan | Izinkan | Izinkan |
| Tools dan kalkulator | Izinkan | Izinkan | Izinkan | Izinkan | Izinkan |
| Light mode dan dark mode | Izinkan | Izinkan | Izinkan | Izinkan | Izinkan |
| Halaman tugas lengkap | Tolak | Izinkan | Izinkan | Izinkan | Izinkan |
| Mengubah progres tugas sendiri | Tolak | Izinkan | Izinkan | Izinkan | Izinkan |
| Melihat progres pengguna lain | Tolak | Tolak | Izinkan | Izinkan | Izinkan |
| Mengubah progres pengguna lain | Tolak | Tolak | Tolak | Izinkan | Izinkan |
| Daftar dan detail anggota | Tolak | Izinkan | Izinkan | Izinkan | Izinkan |
| Daftar file dan unduh file | Tolak | Izinkan | Izinkan | Izinkan | Izinkan |
| Unggah file kelas | Tolak | Tolak | Izinkan | Izinkan | Izinkan |
| Profil dan password sendiri | Tolak | Izinkan | Izinkan | Izinkan | Izinkan |
| Membuka panel admin | Tolak | Tolak | Tolak | Tolak | Izinkan |
| Mengubah informasi kelas | Tolak | Tolak | Izinkan | Izinkan | Izinkan |
| Mengubah jadwal dan piket | Tolak | Tolak | Izinkan | Izinkan | Izinkan |
| Mengubah urutan apel | Tolak | Tolak | Izinkan | Izinkan | Izinkan |
| Membuat, mengubah, menghapus tugas | Tolak | Tolak | Izinkan | Izinkan | Izinkan |
| Membuat akun pengguna | Tolak | Tolak | Tolak | Tolak | Izinkan |
| Mengubah role pengguna | Tolak | Tolak | Tolak | Tolak | Izinkan |
| Mengubah biodata pengguna | Tolak | Tolak | Tolak | Tolak | Izinkan |
| Mengedit biodata sendiri | Tolak | Tolak | Tolak | Izinkan | Izinkan |
| Menghapus akun pengguna | Tolak | Tolak | Tolak | Tolak | Izinkan |
| Reset password pengguna lain | Tolak | Tolak | Tolak | Tolak | Izinkan |
| Mengubah atau menghapus file Drive | Tolak | Tolak | Izinkan | Izinkan | Izinkan |

Kontrol operasional Class Officer/Teacher berada di **Kelola Kelas**. Admin tetap khusus Developer.

Tambahan Revisi 12: semua anggota (Student, Class Officer, Teacher, Developer) boleh mengedit Instagram sendiri melalui endpoint khusus. Developer boleh mengedit Instagram anggota lain. Hak biodata lainnya pada tabel di atas tetap sama. Referensi mapel–guru hanya dapat dibaca/dikelola Class Officer, Teacher, dan Developer; jadwal publik tetap menampilkan nama mapel/guru dari jadwal yang tersimpan.
Hak ubah biodata tidak mencakup mengganti username atau menaikkan role sendiri. Reset password akun lain berada di Admin; ganti password sendiri berada di Profile.
Ubah file mencakup nama, mata pelajaran, dan kategori. Hapus file memindahkannya ke Sampah Google Drive.
Role diputuskan ulang pada setiap request API/RLS. Tampilan yang sudah terbuka mengikuti role baru setelah halaman dimuat ulang.
