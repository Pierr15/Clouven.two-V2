# Perbaikan pusat animasi tema

Bug berhasil direproduksi dengan Edge pada zoom browser 200% ketika animasi berjalan tanpa dijeda. Pada viewport 1280 × 720 CSS piksel dan frame 2560 × 1440, avatar berada di sekitar (84, 1354) piksel gambar. Versi lama menghasilkan pusat lingkaran sekitar (41, 677), sehingga terlihat di tengah kiri halaman. Versi baru menghasilkan pusat sekitar (84, 1354).

Posisi avatar dan radius sekarang dinyatakan relatif terhadap ukuran snapshot. Perubahan juga mencakup posisi dan ukuran snapshot ikon agar rotasi tetap mengikuti tombol. Durasi penyebaran 450 ms, putaran ikon 180°, dan fade laci tetap berlaku.

## Bukti

- `rev4-reproduced-old-origin.png`: frame animasi versi lama yang berjalan langsung.
- `rev4-corrected-live-origin.png`: frame versi baru yang berjalan langsung.
- `live-theme-origin-results.json`: 22 pengujian lulus pada zoom 100%, 125%, 150%, dan 200%, sidebar terbuka/diciutkan, scroll, serta viewport HP. Sampel akun lokal mencakup developer, siswa, dan tamu.
- `tests/ui-theme-live-origin.cjs`: merekam compositor melalui CDP tanpa menjeda animasi. Pengukuran pusat dari tepi lingkaran pada gambar memiliki toleransi rasterisasi 6 CSS piksel. Tes yang menjeda animasi tetap berguna untuk geometri dan rotasi, tetapi tidak mendeteksi bug compositor tersebut.
- `avatar-rotation-results.json`: sepuluh pemeriksaan geometri dan rotasi tetap lulus setelah perubahan. Preferensi reduced motion juga lulus.

Backend disimulasikan lokal. Tidak ada data atau akun produksi yang diubah. Project sumber D:/Project/ClouvenTwo-V2 tetap utuh.

Referensi sintaks bentuk lingkaran dan posisi persentase: [MDN circle()](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/basic-shape/circle).
