# Revisi 10 — animasi judul beranda

Judul utama beranda diketik huruf demi huruf, diam **5 detik setelah lengkap**, kemudian dihapus dari belakang dan diketik ulang. Siklus berulang terus.

- Kecepatan mengetik: 75 ms per karakter; menghapus: 40 ms per karakter.
- Setelah kosong, jeda 350 ms sebelum mulai mengetik kembali.
- Teks mengikuti isian Headline dan Kata sorot dari Kelola Kelas/Admin. Warna coral dan huruf miring pada kata sorot tetap ada.
- Ruang judul tetap mengikuti teks lengkap sehingga paragraf dan tombol tidak naik turun.
- Pembaruan jadwal/ringkasan atau data judul yang sama tidak mengulang animasi dari awal.
- Tab yang tersembunyi menjeda animasi. Preferensi reduced motion menampilkan judul lengkap secara statis.
- Pembaca layar menerima judul lengkap tanpa pengumuman setiap huruf.

Revisi ini merupakan salinan terpisah dari Revisi 9. Project asli dan Revisi 9 tidak diedit.

## Menjalankan

Klik JALANKAN-PREVIEW.bat atau jalankan npm start dari folder ini. Port default adalah 4173. Preview yang dibuka selama pengerjaan memakai **http://127.0.0.1:4175/**.

Revisi 10 hanya mengubah frontend. Tidak ada migrasi database tambahan. Persyaratan aktivasi fitur akses Revisi 9 tetap mengikuti MULAI-DI-SINI.md.

## Pengujian

Pengujian Edge headless dengan data lokal dan jam browser terkontrol lulus pada lebar 320, 390, dan 1440 px: urutan ketik/hapus, jeda 5000 ms, siklus ulang, kestabilan tinggi/posisi konten, overflow, pembaruan teks, karakter emoji utuh, teks aman, judul aksesibel, reduced motion, serta jeda tab tersembunyi.

Bukti: verification/typewriter-results.json dan verification/rev10-heading-*.png.

Untuk mengulang, sediakan Playwright dan Microsoft Edge, lalu jalankan node tests/ui-typewriter.cjs. PLAYWRIGHT_MODULE dapat menunjuk instalasi Playwright yang sudah tersedia.
