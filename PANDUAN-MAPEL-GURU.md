# Mengisi file mapel–guru

File [assets/data/mapel-guru.json](assets/data/mapel-guru.json) dalam salinan ini sudah berisi 13 mapel dari pengguna dan siap diimpor. Nama mapel dan guru dipertahankan persis seperti isian pengguna. Untuk menambah mapel nanti, duplikasi objek di dalam array subjects dan pisahkan dengan koma. Setiap kolom teachers memakai array, walaupun guru hanya satu.

Contoh berikut hanya menunjukkan format, bukan daftar yang otomatis dimasukkan ke database:

~~~json
{
  "schemaVersion": 1,
  "subjects": [
    {
      "subject": "Bahasa Indonesia",
      "teachers": ["Bu Liza"]
    },
    {
      "subject": "Nama mapel lain",
      "teachers": ["Nama guru pertama", "Nama guru kedua"]
    }
  ]
}
~~~

Satu guru akan terpilih otomatis ketika mapelnya dipilih. Jika ada beberapa guru dalam array teachers, pengguna memilih guru yang sesuai.

Jangan hapus tanda kutip pada nama, jangan tambahkan koma setelah elemen terakhir, dan jangan menambahkan komentar di dalam JSON. Nama mapel/guru tidak boleh kosong atau duplikat. Batas: 100 mapel, maksimal 20 guru per mapel, 100 karakter per nama, dan ukuran file 100 KB.

Setelah selesai, masuk sebagai Class Officer, Teacher, atau Developer. Buka tab **Mapel & Guru**, pilih file, periksa pratinjau, lalu klik **Simpan daftar baru**. Mengedit file di folder project saja tidak mengubah database.

JSON dibaca oleh importer dan disimpan sebagai baris dalam tabel subject_teachers melalui fungsi database replace_subject_teachers. Setiap objek memiliki kolom subject (teks) dan teachers (array teks). Migrasi Revisi 12 harus dijalankan dahulu.

Impor menggantikan seluruh daftar referensi. Karena itu, sertakan seluruh mapel yang ingin tetap tersedia. Tugas dan jadwal yang sudah ada tetap tersimpan; label data lama membantu saat mengedit catatan yang mapelnya belum tercantum di daftar baru.
