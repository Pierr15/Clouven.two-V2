# ClouvenTwo V2: kalender, Today, dan notifikasi

## Arsitektur yang dipakai

Proyek tetap menggunakan HTML, CSS, modul JavaScript, Supabase Auth/PostgREST/Realtime, dan server API yang sudah ada. `tasks.due` tetap bertipe `date`, dengan `tasks.due_at` opsional untuk jam tenggat; kalender menampilkan tugas sebagai agenda turunan, tanpa menyalinnya ke tabel kegiatan. `schedules.lessons` dan `schedules.piket` tetap menjadi sumber Today. Class Officer, Teacher, dan Developer dapat mengelola kegiatan sesuai izin `edit_schedule`/`manage_class` yang sudah ada. Anggota lain hanya membaca.

Migrasi `supabase/migrations/202609240001_productivity.sql` menambah `calendar_events`, `notifications`, dan `notification_preferences`. Trigger membuat satu pemberitahuan saat tugas atau kegiatan baru muncul, serta paling banyak satu pemberitahuan perubahan jadwal per hari dan hari-jadwal. Fungsi `generate_productivity_reminders()` membuat pengingat tenggat dan kegiatan per anggota; kunci unik `(user_id,dedupe_key)` mencegah duplikasi saat job diulang. Tugas selesai dan preferensi pengguna diperiksa saat pengingat dibuat.

Notifikasi browser hanya dipicu dari perubahan Realtime ketika halaman masih hidup, tab tidak terlihat, browser mendukung API, dan pengguna sudah mengaktifkannya di Profil. Pengaturan browser disimpan per perangkat, sedangkan preferensi pengingat di aplikasi disimpan per akun. Izin browser tidak diminta saat halaman dibuka. Tidak ada Web Push saat situs benar-benar tertutup; itu memerlukan service worker, Push API, penyimpanan langganan per perangkat, kunci VAPID, dan layanan pengirim yang menyimpan kunci privat di server. Kunci privat atau service role tidak pernah dikirim ke browser.

## Aktivasi manual

1. Tinjau dan jalankan migrasi SQL baru setelah seluruh migrasi sebelumnya di Supabase. Ini mengubah skema aktif; pekerjaan ini hanya menyiapkan file lokal dan belum menjalankannya di proyek produksi.
2. Pastikan `SUPABASE_URL` dan `SUPABASE_SECRET_KEY` atau `SUPABASE_SERVICE_ROLE_KEY` sudah tersedia **hanya** di lingkungan server. Tambahkan `CRON_SECRET` berupa token acak panjang di lingkungan server. Jangan gunakan publishable key sebagai pengganti service role.
3. Deploy versi aplikasi dan API yang memuat migrasi ini. Jadwalkan `GET /api/notifications/run` setiap 10 menit dari penjadwal tepercaya dengan header `Authorization: Bearer <CRON_SECRET>`. Job ini diperlukan untuk pengingat ketika tidak ada anggota yang membuka situs. Frekuensi lebih dari 20 menit dapat melewatkan jendela pengingat. Batasi log dan akses token penjadwal.
4. Uji dengan akun Student dan Class Officer: Student dapat membuka kalender dan menandai notifikasi miliknya, tetapi tidak dapat membuat/mengubah/menghapus kegiatan; Class Officer dapat mengelola kegiatan; akun lain tidak dapat membaca notifikasi atau preferensi seseorang. Uji juga event dengan waktu mulai dekat serta tugas yang sudah ditandai selesai.
5. Di Profil, aktifkan izin notifikasi browser dengan tindakan pengguna. Izin yang ditolak harus diubah lewat pengaturan situs pada browser. Uji di HTTPS atau localhost.

Tenggat tugas bertipe tanggal saja berakhir pukul 23:59 zona `Asia/Jakarta` untuk pengingat dan countdown. Kegiatan memakai `timestamptz`; waktu input ditafsirkan dalam zona lokal browser dan disimpan sebagai UTC. Today memakai tanggal lokal perangkat sesuai permintaan.

## Batas verifikasi saat ini

Kode dan migrasi tersedia secara lokal. Belum ada migrasi database produksi, scheduler aktif, pengujian RLS terhadap Supabase asli, atau pengujian browser login di semua ukuran layar. Browser Notification API tidak mengirim pesan saat situs benar-benar tertutup. Realtime harus aktif untuk tabel `notifications` dan `calendar_events`, dan konfigurasi Realtime proyek harus mengizinkan pengguna terautentikasi.
Belum ada tabel atau alur pengumuman di V2, sehingga jenis notifikasi pengumuman belum diaktifkan.
