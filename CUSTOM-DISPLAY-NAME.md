# Custom Animated Display Name — ClouvenTwo V2

Revisi lokal: 14 September 2026. Scope hanya tampilan nama untuk Developer. Database produksi belum diubah.

## Analisis dan keputusan

Project memakai HTML, ES modules JavaScript vanilla, CSS global, Supabase Auth, tabel public.members, dan API Vercel. Tidak ada React atau proses hydration. Role resmi berasal dari members, dengan matriks permissions.js dan pemeriksaan API existing. Members menggunakan SELECT untuk pengguna terdaftar; penulisan browser langsung sudah dibatasi. Profil sendiri sudah memiliki area settings sehingga tidak perlu halaman baru.

Rencana yang diterapkan: satu renderer DOM StyledName; empat kolom tambahan di members; satu RPC untuk penyimpanan dengan role dari database; UI preview/Simpan pada Profile; integrasi identitas existing; pengujian unit, PostgreSQL lokal, dan browser. Posisi wali kelas serta perbaikan foto card dari revisi sebelumnya dipertahankan.

## Mengaktifkan penyimpanan

1. Gunakan project Supabase yang sama dengan konfigurasi website existing.
2. Pastikan schema awal, migrasi akses role Rev9 (202609060001), dan Forms Rev12 (202609070001) sudah diterapkan.
3. Buka SQL Editor lalu jalankan isi lengkap supabase/migrations/202609130001_developer_display_names.sql. Skrip dibungkus transaksi dan diuji dijalankan dua kali.
4. Muat ulang website, login dengan akun Developer, buka Profile → Custom Display Name. Pilih style/warna, lihat Preview, lalu tekan Simpan.
5. Verifikasi sekali pada project Supabase asli: penyimpanan milik Developer berhasil dan request non-Developer ditolak. Pengujian produksi ini belum dijalankan oleh Codex.

Sebelum migrasi, nama tetap Default; tombol Simpan menampilkan pesan migrasi belum tersedia. Tidak perlu mengganti secret, framework, database, atau membuat tabel baru. Tidak ada akun yang dihapus/dibuat ulang oleh revisi fitur ini.

## Renderer dan lokasi integrasi

Revisi Member Card: judul kartu memakai font-weight 600 yang diwarisi StyledName; nomor absen berada pada span terpisah dengan bobot 700. Nama adalah satu text node di dalam satu kotak yang dapat wrap, sehingga background tidak diulang per kata/baris. Gradient/Flow pada kartu memakai indigo → violet → rose → violet → indigo, dengan varian terang/gelap; Flow memakai animasi bersama 4,8 detik. Gradient tetap statis. Gradient/Flow tidak memakai text-shadow, filter, atau stroke. Nama pada list lain tetap memakai renderer yang sama dan palet pilihannya.

StyledName(user) dalam assets/js/styled-name.js membuat span dengan textContent. Adapter styledName(user) mengembalikan outerHTML dari komponen DOM yang sama untuk template vanilla existing; tidak membaca HTML atau CSS arbitrary dari database. Nama, font, ukuran, bobot, spacing dan perilaku wrap mengikuti typography existing. Nomor absen tetap di luar efek nama.

Digunakan pada kartu/detail Anggota, Profile, identitas sidebar/account menu, daftar akun Admin, daftar progres tugas, nama pemimpin apel, serta petugas piket. Teks input, username/NIS, label aksesibilitas, nama berkas dan nama guru yang berupa data teks bebas tidak diperlakukan sebagai profil pengguna. Tidak ada atribusi author visual existing yang perlu ditambahkan.

Referensi user ID diprioritaskan. Data piket/antrean lama yang hanya menyimpan nama mendapat style hanya bila cocok persis dengan satu profil; duplikat atau nama tanpa profil tetap Default. Antrean apel baru menyimpan member_id jika cocok unik. Tidak ada tebakan identitas pada nama yang ambigu.

name-sync.js menyinkronkan profil melalui satu subscription bersama, pembaruan data halaman, dan refresh saat tab kembali aktif. Perubahan role yang diterima langsung merender ulang nama terpasang, termasuk modal terbuka. Jika koneksi terputus, pembaruan visual menunggu event/refresh berikutnya; pemeriksaan izin simpan tetap dilakukan database pada setiap request.

## Keamanan dan database

Empat kolom members: name_style, name_color_1, name_color_2, name_color_3. Default style adalah default; warna awal #7DD3FC/#A78BFA dan warna ketiga null. Nilai tidak lengkap atau invalid saat dibaca jatuh ke Default.

RPC set_my_name_customization(settings) tidak menerima user_id/role. Function menggunakan auth.uid(), mengunci baris pemilik, dan memeriksa role saat ini benar-benar developer. SECURITY DEFINER memakai search_path kosong, referensi schema eksplisit, serta execute hanya untuk authenticated. RLS baca existing dipertahankan; browser tidak mendapat hak INSERT/UPDATE/DELETE members. Trigger tambahan melarang perubahan customization milik orang lain/non-Developer lewat jalur tulis lain. CHECK constraint, RPC, dan validator UI memakai whitelist style serta warna hex enam digit. Payload dengan properti tambahan, url(), var(), CSS, warna pendek dan newline ditolak.

Demotion boleh mempertahankan warna/style tersimpan tetapi renderer menampilkan Default dan RPC menolak simpan baru. Perubahan profil, password, peran dan pembuatan akun default tetap memakai mekanisme existing. Tidak ada role baru, badge, achievement atau kosmetik lain.

Rujukan keamanan function: https://supabase.com/docs/guides/database/functions

## UI, style, aksesibilitas

Profile → Custom Display Name hanya terlihat bagi Developer. Perubahan pilihan hanya mengubah preview sampai Simpan ditekan. Preview memakai StyledName yang sama. Ada native color picker berlabel, warna ketiga opsional, status simpan/gagal, dan focus ring keyboard. Warna tampilan menyesuaikan luminans untuk permukaan terang/gelap existing agar terbaca; nilai hex pilihan asli tetap disimpan.

- Default: typography existing tanpa efek.
- Solid: satu warna.
- Gradient: gradasi statis dua/tiga warna.
- Flow: pergerakan gradasi horizontal 4,8 detik per arah, dengan warna lebih rapat.
- Neon: tiga lapis glow dengan pulse halus 2,6 detik; ukuran glow mengikuti ukuran teks.
- Prism: gradasi multicolor dengan warna perantara dan glow, bergerak 5,8 detik per arah.
- Shimmer: highlight lebih tegas melintas setiap 4,6 detik dengan jeda.

Revisi intensitas memakai Display Name Styles Discord sebagai referensi visual (https://support.discord.com/hc/en-us/articles/33833879643927-Discord-Display-Name-Styles-FAQ), dengan implementasi CSS sendiri. Preview diperbesar; ukuran nama pada halaman existing tetap mengikuti typography semula. Reduced motion tetap menampilkan versi statis. Revisi visual ini tidak memerlukan migrasi database tambahan.

Pergerakan gradasi memakai CSS background-position; Neon menganimasikan text-shadow pada area teks kecil. Tidak ada timer/per-frame JavaScript, canvas, particle, atau dependency animasi. prefers-reduced-motion meniadakan gerakan; gradient/glow tetap terbaca. Forced colors dan print memakai teks biasa. Screen reader membaca text node nama asli.

## Menambahkan style kelak

Tambahkan nilai ke NAME_STYLES di name-customization.js, selector CSS pada styled-name.css, lalu buat migrasi baru yang memperbarui whitelist CHECK dan RPC. Tambahkan kasus renderer, reduced motion, warna, role, dan database pada tes. UI style otomatis mengambil whitelist. Jangan menambahkan CSS string dari database atau mengubah matriks role tanpa keputusan scope baru.

## Validasi

Revisi intensitas animasi: 36 tes unit lulus dan 38 skenario browser lulus, termasuk perbandingan gambar beberapa frame pada mode terang/gelap, posisi nama stabil, 100 member, dan reduced motion. Hasil terbaru tersedia di verification/display-name-ui/results.json. Angka dan pemeriksaan database/regresi di bawah merupakan validasi implementasi fondasi sebelumnya; skema dan permission tidak berubah dalam revisi visual.

- 36 tes unit customization/warna lulus.
- 46 tes PostgreSQL lokal (PGlite) lulus: RPC, grant, RLS, trigger, owner, demotion, payload invalid, migrasi dua kali, dan akses members existing.
- 36 skenario browser Headless Edge lulus: tujuh style dengan preview dan Save, Guest/Student/Teacher/Class Officer, demotion saat settings/modal terbuka, data invalid/missing, injeksi nama sebagai teks, nama pendek/panjang, 100 members, viewport 390/820/1440, terang/gelap, reduced motion, fokus keyboard, error Simpan, identitas bersama, dan legacy name ambiguity.
- Regresi existing lulus: api-access (57), instagram-api (14), public-config (14), preview-config, rls-access (92), rls-forms (25), ui-access (35), ui-forms (24), ui-settings (18), ui-upload (20), ui-layout, ui-typewriter, ui-theme, ui-avatar-rotation. Tes live theme origin lulus 22 skenario pada pengulangan; run awal mengalami kegagalan pengukuran frame, sehingga hasilnya bergantung timing lingkungan browser.
- Dua suite existing belum hijau: ui-data-states mencari textarea lessons yang sudah diganti editor baris Rev12; ui-interactions memakai asumsi urutan fokus modal lama sebelum tombol Edit Instagram ditambahkan. Keduanya juga gagal pada salinan project sebelum perubahan. Tes existing ini tidak diubah dalam patch fitur.
- Tidak tersedia script lint, typecheck, test runner agregat, atau production build di package.json. Semua file JS diperiksa sintaks; tidak dibuat pipeline/framework baru. Website ini disajikan langsung sebagai berkas statis dan API Vercel.
- Browser test memakai Supabase/API simulasi dan tidak menemukan pageerror tak terduga; font/icon eksternal diblokir pada tes. Auth/permission diuji lokal, bukan login/password/Realtime pada layanan produksi. Tidak ada hydration pada arsitektur ini.

Menjalankan tes baru: node tests/name-customization.mjs; node tests/ui-display-name.cjs dengan PLAYWRIGHT_MODULE menunjuk Playwright dan Edge terpasang; node --wasm-num-compilation-tasks=1 --liftoff-only tests/rls-display-name.mjs dengan PGLITE_MODULE/PGLITE_PGCRYPTO menunjuk modul PGlite/pgcrypto. Dependency tooling tes tidak ditambahkan ke runtime website.

## File dibuat

- `assets/css/styled-name.css`
- `assets/js/name-customization.js`
- `assets/js/styled-name.js`
- `assets/js/name-sync.js`
- `assets/js/name-settings.js`
- `supabase/migrations/202609130001_developer_display_names.sql`
- `tests/name-customization.mjs`
- `tests/rls-display-name.mjs`
- `tests/ui-display-name.cjs`
- `CUSTOM-DISPLAY-NAME.md`

## File diubah

- `admin/index.html`
- `admin/login/index.html`
- `anggota/index.html`
- `assets/css/app.css`
- `assets/js/data.js`
- `assets/js/pages/admin.js`
- `assets/js/pages/home.js`
- `assets/js/pages/members.js`
- `assets/js/pages/profile.js`
- `assets/js/pages/schedule.js`
- `assets/js/pages/tasks.js`
- `assets/js/permissions.js`
- `assets/js/schedule-editor.js`
- `assets/js/shell.js`
- `index.html`
- `jadwal/index.html`
- `kelola/index.html`
- `login/index.html`
- `penyimpanan/index.html`
- `profile/index.html`
- `tools/index.html`
- `tugas/index.html`

Perubahan HTML selain Profile hanya memperbarui versi aset cache. Profile menambah slot settings. app.css mengimpor CSS nama dan membatasi selector label role agar tidak mengubah typography span nama.

## Sisa aktivasi

Terapkan migrasi pada Supabase asli dan lakukan smoke test akun asli. Tidak ada placeholder implementasi. Deployment website maupun perubahan layanan eksternal belum dilakukan. Dua tes legacy yang disebutkan perlu diperbarui terpisah bila seluruh suite lama harus hijau.
