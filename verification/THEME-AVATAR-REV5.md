# Revisi titik awal tema di avatar

Pusat penyebaran tetap dihitung dari titik tengah avatar akun yang sedang tampil, menggunakan koordinat relatif yang memperbaiki masalah zoom pada Rev4.

Untuk memperjelas sumber gerakan pada avatar di dekat batas layar:

- Radius awal mengikuti separuh ukuran avatar.
- Avatar memiliki snapshot tersendiri yang tetap di posisinya dan membesar lembut hingga 1,08× sebelum kembali normal.
- Penyebaran memakai kurva percepatan halus, dimulai bersamaan dengan gerak avatar dan rotasi ikon.
- Durasi aplikasi tetap 450 ms; laci menutup dengan fade, dan reduced motion tetap didukung.

Pemeriksaan visual memakai font dan ikon Tabler asli dengan backend simulasi. Gambar `rev5-avatar-expanded-45ms.png` dan `rev5-avatar-collapsed-45ms.png` memperlihatkan awal penyebaran dan avatar pada posisinya. Gambar diambil saat dijeda untuk inspeksi posisi; ini terpisah dari pemeriksaan animasi langsung.

Pengujian piksel langsung memakai durasi 1800 ms hanya dalam profil browser uji untuk memperoleh frame yang cukup tanpa menjeda animasi. Tes geometri/rotasi memeriksa durasi produksi 450 ms. Hasil Rev4 disimpan sebagai bukti historis; hasil yang berawalan `rev5-` berlaku untuk revisi ini.

Hasil verifikasi lokal revisi ini:

- 22 skenario animasi langsung lulus, mencakup zoom browser 100–200%, sidebar terbuka/mengecil, halaman yang digulir, tampilan mobile, serta pergantian ke kedua tema. Selisih terbesar pusat hasil pengukuran piksel terhadap pusat avatar adalah 1,53 CSS px.
- 10 skenario geometri/rotasi lulus dengan durasi produksi 450 ms, putaran ikon 180°, gerak avatar tanpa delay, dan pembersihan status animasi setelah selesai. Pemeriksaan reduced motion juga lulus.
- Sepuluh halaman HTML memuat versi aset `avatar-source-5`, dan preview lokal merespons HTTP 200.
- Hash 46 file proyek sumber diperiksa ulang; tidak ada perubahan.

Tidak ada akun atau data produksi yang diubah. Folder sumber D:/Project/ClouvenTwo-V2 tetap utuh.
