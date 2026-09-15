# Clouven.two — Forms Rev12

Fitur dan aktivasi terbaru: [REV12-FORMS-INSTAGRAM.md](REV12-FORMS-INSTAGRAM.md). Revisi 12 menambahkan kolom Instagram anggota dan tabel referensi mapel–guru. Jalankan migrasi **202609070001_forms_instagram_rev12.sql** setelah migrasi Revisi 9, lalu impor JSON mapel–guru melalui panel. Migrasi Revisi 12 telah diuji lokal dan belum diterapkan ke produksi.

Mulai dari [MULAI-DI-SINI.md](MULAI-DI-SINI.md) untuk penerapan revisi pada database yang sudah ada. Matriks terbaru: [AKSES-ROLE-REV9.md](AKSES-ROLE-REV9.md).

Clouven.two tetap memakai vanilla HTML/CSS/JavaScript dan visual yang sama, tetapi backend aplikasi sekarang memakai **Supabase Auth + PostgreSQL + Row Level Security + Realtime**. Google Drive tetap menjadi penyimpanan file fisik untuk materi/tugas.

## Yang berubah dari versi Firebase

- Firebase Authentication → **Supabase Auth**.
- Firestore → **Supabase PostgreSQL**.
- Firestore Rules → **Postgres Row Level Security (RLS)**.
- `onSnapshot()` → **Supabase Realtime Postgres Changes**.
- Firebase custom claims → role pada tabel `members`, diverifikasi server dan dipakai langsung oleh RLS.
- Firebase Admin SDK tidak dipakai oleh aplikasi runtime. Paket `firebase-admin` hanya dipertahankan sementara untuk skrip migrasi data lama.

Username/NIS tetap dipetakan internal menjadi `<username>@clouven.local`, jadi user tetap login menggunakan username/NIS dan password, bukan email.

## Struktur halaman

- `/` — Beranda publik.
- `/jadwal/` — Pelajaran, piket, dan urutan pemimpin apel. Publik.
- `/tools/` — Tools TKJ. Publik.
- `/tugas/` — Tugas + progres sendiri; pemantauan/pengelolaan progres anggota sesuai role.
- `/penyimpanan/` — Metadata Supabase + file Google Drive. Wajib login.
- `/anggota/` — Daftar anggota. Wajib login.
- `/profile/` — Profil, ganti password, logout.
- `/login/` — Gateway Student.
- `/admin/login/` — Login Developer.
- `/admin/` — Admin Panel khusus Developer.
- `/kelola/` — Kelola Kelas untuk Class Officer, Teacher, Developer.

## Role

Lima role: Guest, Student, Class Officer, Teacher, Developer. Keputusan fitur memakai matriks eksplisit; misalnya Class Officer dapat melihat progres anggota lain namun tidak mengubahnya.

Role tersimpan di `public.members.role`. RLS membaca role tersebut melalui fungsi SQL `current_app_role()` / `has_app_role()`. Mengubah role tidak membutuhkan custom-claim refresh.

---

# 1. Buat project Supabase

1. Buat project baru di Supabase.
2. Buka **Connect / API Keys**.
3. Ambil:
   - Project URL → `SUPABASE_URL`
   - Publishable key (`sb_publishable_...`) → `SUPABASE_PUBLISHABLE_KEY`
   - Secret key (`sb_secret_...`) → `SUPABASE_SECRET_KEY`
4. Jangan pernah menaruh Secret key di frontend atau commit ke GitHub.

Frontend mengambil URL + publishable key dari `GET /api/config`, yang membaca environment deployment. Tidak ada lagi nilai project/key yang ditanam di `assets/js/supabase.js`. Gunakan `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY`; `SUPABASE_ANON_KEY` didukung untuk project dengan anon key lama. Endpoint menolak secret/service-role key dan hanya mengirim dua field publik. Publishable key tetap terlihat di browser karena diperlukan untuk mengakses Supabase; keamanan data tetap bergantung pada Auth dan RLS. Secret key hanya dipakai Vercel Functions.

# 2. Buat schema + RLS

Buka **Supabase Dashboard → SQL Editor**, lalu jalankan seluruh isi:

```text
supabase/migrations/202609040001_initial_schema.sql
supabase/migrations/202609060001_role_access_rev9.sql
supabase/migrations/202609070001_forms_instagram_rev12.sql
```

Untuk database lama yang sudah memiliki schema awal, jalankan **hanya migrasi Revisi 9**. Jangan mengulang schema awal pada database yang sudah memiliki policies.

Schema awal membuat:

```text
members
class_profile
schedules
apel_queue
tasks
task_summaries
task_progress
resources
```

Sekaligus membuat index, RLS policies, helper role, dan memasukkan tabel ke publication `supabase_realtime`.

### Akses penting

- Guest membaca profil kelas, jadwal, dan apel. Semua data tugas termasuk ringkasan membutuhkan akun anggota setelah migrasi Revisi 9.
- Student membaca anggota/resources dan hanya membaca/mengubah progres sendiri.
- Class Officer melihat progres anggota lain; Teacher/Developer dapat mengubahnya.
- Biodata sendiri hanya dapat diedit Teacher/Developer melalui API. Password sendiri tersedia untuk semua anggota.
- Class Officer ke atas dapat mengubah profile, jadwal, piket, apel, dan tugas.
- Pengelolaan akun dilakukan lewat server API dan hanya Developer.
- Secret key server melewati RLS, sehingga endpoint server selalu melakukan `verifyRequest()` terlebih dahulu.

# 3. Environment Variables

Untuk preview lokal, salin `.env.example` menjadi `.env.local` dan isi environment Supabase serta Google Drive. Gunakan Node.js 22 atau lebih baru, lalu `npm start` atau `JALANKAN-PREVIEW.bat`, kemudian buka `http://127.0.0.1:3000`. Server preview membaca environment proses, lalu `.env.local`, lalu `.env` (urutan prioritas tertinggi ke terendah). File environment tidak dilayani sebagai aset dan tidak disertakan dalam paket ZIP. Server lokal menjalankan endpoint upload, download, dan pengelolaan Google Drive; aksesnya tetap diperiksa melalui Supabase Auth dan role database. Saat mengunggah, website menampilkan progress bar 0–100% berdasarkan byte yang benar-benar sudah dikirim. Setelah mencapai 100%, status berubah menjadi pemrosesan Google Drive dan penyimpanan metadata tanpa mengulang upload.

Jangan membuka folder dengan Live Server atau preview statis pada port 3000 untuk menguji upload: layanan tersebut hanya mengirim HTML/CSS/JS dan tidak menjalankan `/api/drive/upload`. Jika port 3000 sudah dipakai, tutup server lain tersebut atau gunakan `npm run start:4173`, lalu buka `http://127.0.0.1:4173`.

Untuk deployment, isi variabel melalui Vercel Project Settings dan deploy seluruh folder termasuk `api/config.js`. Endpoint akun selain Drive tetap memerlukan Vercel Functions pada penggunaan lokal.

Environment runtime utama:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_ROOT_FOLDER_ID=
```

Jika upload menampilkan bahwa koneksi Google Drive perlu diaktifkan ulang, jalankan `ATUR-ULANG-GOOGLE-DRIVE.bat`. Browser akan membuka persetujuan Google, memvalidasi bahwa akun dapat menulis ke folder root, lalu menyimpan refresh token baru ke `.env.local`. OAuth Client harus menerima redirect URI `http://127.0.0.1:53682/oauth/callback`. Setelah selesai, tutup dan jalankan ulang preview. Untuk penggunaan jangka panjang, periksa OAuth consent screen: project External berstatus Testing dapat menerbitkan refresh token yang berakhir setelah 7 hari.

Firebase credentials hanya dibutuhkan jika kamu benar-benar menjalankan migrasi data lama. Setelah migrasi selesai dan diverifikasi, hapus Firebase env dari deployment.

# 4. Buat Developer pertama

Install dependency:

```bash
npm install
```

Lalu:

```bash
node scripts/bootstrap-developer.mjs javier password-awal "Javier"
```

Script membuat user Supabase Auth dan row `members` dengan role `developer`.

Setelah itu akun lain dapat dibuat dari `/admin/` → **Akun & Role**.

# 5. Migrasi data Firebase → Supabase

Jika database Firebase lama sudah berisi data, isi sementara:

```env
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

Lalu jalankan:

```bash
npm run migrate:firebase
```

Skrip memindahkan:

- profile kelas,
- jadwal + piket,
- urutan pemimpin apel,
- tugas,
- resources Google Drive.

## Migrasi akun lama

Password Firebase lama tidak dipindahkan ke Supabase oleh skrip ini. Jika ingin ikut membuat ulang akun lama, isi:

```env
MIGRATION_DEFAULT_PASSWORD=password-sementara-minimal-6
```

Lalu jalankan lagi migrasi. Akun Firebase dengan email sintetis `@clouven.local` dibuat ulang di Supabase Auth, UID lama disimpan pada `legacy_firebase_uid`, dan `task_progress` dipetakan ke UID Supabase baru.

**Semua akun hasil migrasi memakai password sementara tersebut.** User harus mengganti password setelah login.

Jika v2 Firebase belum pernah dipakai oleh user nyata, paling bersih adalah tidak mengisi `MIGRATION_DEFAULT_PASSWORD`: migrasikan data kelas saja, bootstrap Developer, lalu buat akun siswa/guru dari panel Supabase baru.

# 6. Realtime

`assets/js/data.js` menggunakan Supabase Postgres Changes untuk:

- profile,
- jadwal,
- piket,
- apel queue,
- tasks,
- task progress,
- members,
- resources.

Setiap event realtime memicu refetch kecil terhadap tabel yang relevan. Untuk skala satu kelas ini sengaja dipilih karena sederhana dan stabil.

Urutan pemimpin apel tetap mendukung drag & drop, ↑/↓, dan **Berikutnya**. Begitu disimpan, perubahan muncul di client lain melalui Realtime.

# 7. Google Drive

Integrasi Drive tidak berubah secara konsep. File fisik tetap masuk:

```text
Clouven.two/
├─ Materi/<Mata Pelajaran>/
└─ Tugas/<Mata Pelajaran>/
```

Metadata file sekarang tersimpan pada tabel `resources` Supabase.

Credential Drive tetap server-only. Endpoint:

- `POST /api/drive/upload`
- `GET /api/drive/download?id=...`
- `POST /api/drive/manage` — rename/move kategori atau pindah ke Sampah; Class Officer ke atas.

memverifikasi access token dan role anggota sebelum mengakses Drive. Unduh/pengelolaan juga memeriksa bahwa file terdaftar di resources dan berada dalam folder root kelas. Ubah file berarti nama/kategori/mata pelajaran; isi biner file tidak diedit di website.

Halaman publik membaca nama dan efek tampilan Developer melalui `GET /api/public/developer-name`. Endpoint ini hanya mengembalikan nama, role, gaya, dan warna Developer; data anggota lain serta kontrol penyuntingan tetap tertutup bagi Guest.

# 8. Deploy Vercel

1. Push project ini ke GitHub lalu import repository ke Vercel.
2. Pilih Framework Preset: **Other**. Tidak ada build command dan Output Directory dikosongkan.
3. Tambahkan `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, dan `GOOGLE_DRIVE_ROOT_FOLDER_ID` untuk Production, Preview, dan Development bila diperlukan.
4. Terapkan migrasi Revisi 9, Revisi 12, Revisi 13 display name, dan `202609140001_public_developer_name_profiles.sql` pada database aplikasi sebelum mengaktifkan frontend baru.
5. Deploy seluruh source beserta folder `api`, lalu buka `/api/config` pada domain Vercel untuk memastikan konfigurasi publik tersedia.
6. Verifikasi login, nama Developer pada halaman publik, upload/download Drive, dan setiap role pada deployment Vercel.

Deploy dan aktivasi produksi belum dijalankan dalam pengerjaan Revisi 11. Pengaturan judul baru disimpan di JSON profil kelas yang sudah ada; tidak ada migrasi SQL tambahan untuk Revisi 11. Jika migrasi akses Revisi 9 belum pernah diterapkan, migrasi tersebut tetap diperlukan.

Frontend tetap tanpa build step. Vercel Functions memakai `@supabase/supabase-js` untuk operasi server-side.

# Checklist sebelum mematikan Firebase

- [ ] SQL schema Supabase berhasil dijalankan.
- [ ] Developer pertama bisa login.
- [ ] Homepage/Jadwal menerima realtime update.
- [ ] Student hanya bisa mengubah task progress sendiri.
- [ ] Class Officer bisa mengubah jadwal/apel/tugas.
- [ ] Developer bisa membuat akun dan mengganti role.
- [ ] Anggota dan resource hanya terbuka setelah login.
- [ ] Upload/download Google Drive berhasil.
- [ ] Data Firebase lama sudah dibandingkan dengan Supabase.
- [ ] Baru setelah itu hapus Firebase env/SDK lama.
