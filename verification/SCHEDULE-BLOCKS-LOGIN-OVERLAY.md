# Verifikasi blok jadwal dan animasi login

Tanggal verifikasi: 15 September 2026.

Ruang lingkup:

- Jadwal publik menampilkan Blok A (Teori) dan Blok B (Bengkel) secara terpisah.
- Pengelola dapat menambah, menyalin, memvalidasi, dan menyimpan pelajaran pada kedua blok.
- Waktu yang sama boleh dipakai pada Blok A dan Blok B; benturan waktu tetap ditolak di dalam blok yang sama.
- Pelajaran lama tanpa properti `block` otomatis dinormalisasi ke Blok A.
- Beranda merangkum pelajaran pertama pada masing-masing blok.
- Login berhasil menutup halaman tujuan sebelum paint pertama, menggambar C² tanpa efek kilau, lalu menjalankan transisi masuk website; ikon C² pada sidebar tetap statis.
- Guest, sesi yang dipulihkan, dan preferensi reduced motion tidak memutar overlay.
- Layout formulir dua blok diperiksa pada 320, 390, dan 1440 px dalam tema terang dan gelap.

Hasil:

- `node tests/ui-forms.cjs`: 25 pemeriksaan lulus.
- `node tests/ui-c2-motion.cjs`: 7 pemeriksaan lulus.
- `node --check`: seluruh file JavaScript yang diubah lulus pemeriksaan sintaks.

Pengujian memakai Microsoft Edge headless dan data Supabase simulasi. Tidak ada penulisan ke database produksi.
