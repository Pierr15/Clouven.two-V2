# Pengalaman unggah file — Revisi 8

Halaman Penyimpanan kini menampilkan batas 3 MB sebelum pemilihan file, nama lengkap dan ukuran file terpilih, serta validasi file kosong/terlalu besar. Batas aplikasi tetap 3 × 1024 × 1024 byte dan batas server tidak diubah. Kartu unggah hanya ditampilkan untuk pengurus dan role yang diizinkan.

## Alur baru

1. Pilih file yang memiliki isi dan berukuran maksimal 3 MB. Pesan kesalahan berada di dekat input; pengguna dapat mengganti pilihan tanpa kehilangan mata pelajaran/kategori.
2. Kirim file. Persentase berasal dari byte pengiriman XMLHttpRequest yang benar-benar dilaporkan browser. Jika ukuran transfer tidak dapat dihitung, indikator ditampilkan tanpa angka persentase.
3. Tunggu penyimpanan Google Drive. Selesainya pengiriman perangkat tidak dianggap sebagai keberhasilan keseluruhan; indikator berlanjut tanpa persentase sampai endpoint mengonfirmasi ID file.
4. Tambahkan file ke daftar kelas. Pesan berhasil baru muncul setelah penyimpanan catatan file dikonfirmasi. Formulir kemudian direset dan daftar dimuat ulang.

Tombol dan input dikunci selama proses untuk mencegah pengiriman ganda atau perubahan keterangan di tengah pengiriman. Kesalahan transfer mempertahankan file dan isian untuk percobaan ulang manual. Pesan hasil tetap terlihat sampai file baru dipilih.

Jika ID file sudah diterima tetapi catatan daftar gagal disimpan, tombol **Coba simpan lagi** hanya mengulangi penyimpanan catatan. File tidak dikirim lagi selama halaman tetap terbuka. Konflik ID Drive yang sudah tersimpan ditangani dengan membaca dan memverifikasi pemilik catatan tersebut, memakai constraint unik yang sudah tersedia pada schema proyek. Ini juga menangani respons simpan yang terputus setelah database berhasil menulis.

Transfer memiliki timeout 120 detik. Pemeriksaan sesi dan penyimpanan daftar menggunakan timeout 15 detik. Timeout/koneksi putus sebelum ID Drive diterima tidak membuktikan file belum tersimpan; UI meminta pengguna memeriksa daftar sebelum mengulangi unggahan. Revisi ini tidak menambahkan penyimpanan ulang otomatis setelah refresh halaman atau idempotensi endpoint unggah Drive.

Status mendukung pembaca layar dan reduced motion. Persentase tidak diumumkan berulang melalui live region; perubahan tahap yang diumumkan. Warna dan ikon mengikuti sistem tema/Tabler proyek. Keterangan teknis tentang database dan hosting di halaman Penyimpanan diganti dengan petunjuk penggunaan.

Dasar pengukuran progres: [MDN — XMLHttpRequest.upload](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/upload). Angka ini mengukur pengiriman dari browser, bukan persentase pekerjaan Google Drive.

## Verifikasi

- 20 pemeriksaan unggah lulus: validasi 0 B, tepat 3 MB, 3 MB + 1 byte, nama file, penggantian pilihan, progres terukur/tidak diketahui, fase menunggu Drive dan daftar, pencegahan submit ganda, error/timeout/abort, HTTP 401/403/413/500, respons tidak valid, retry daftar, respons database terputus setelah commit, hak UI siswa, dan tampilan mobile light/dark.
- Satu pemeriksaan di antaranya menggunakan XMLHttpRequest browser asli ke endpoint HTTP lokal: 128 KB diterima utuh, autentikasi diteruskan, dan alur selesai sampai daftar file. Pemeriksaan progres terperinci menggunakan event XHR simulasi agar setiap fase dapat diverifikasi.
- Tiga pemeriksaan regresi kondisi data Penyimpanan juga lulus: memuat/gagal/retry, respons kosong, dan kegagalan refresh latar belakang.
- Pemeriksaan mobile memakai viewport 320 px, nama file panjang, serta reduced motion. Permintaan font/ikon eksternal diizinkan dengan batas waktu dan dapat memakai fallback bila CDN gagal.
- Pengujian menggunakan respons Supabase dan Drive simulasi. Tidak ada upload, akun, atau data produksi yang diubah. Integrasi Drive/Vercel produksi tetap perlu diuji pada deployment preview.
- Hash 46 file proyek sumber dibandingkan; tidak ada perubahan. Arsip revisi sebelumnya dipertahankan.

Jalankan `node tests/ui-upload.cjs` dengan Playwright/Microsoft Edge. Bukti berada pada `rev8-upload-results.json` dan screenshot `rev8-mobile-*.png`.
