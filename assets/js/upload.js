export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

export function uploadFile(file, headers, onProgress, onSent) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/drive/upload");
    request.responseType = "json";
    request.timeout = 120000;
    Object.entries(headers).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.addEventListener("progress", event => {
      onProgress(event.lengthComputable && event.total > 0
        ? Math.min(100, Math.floor(event.loaded / event.total * 100)) : null);
    });
    // Sending to the website is complete; Drive processing can still be running.
    request.upload.addEventListener("load", onSent);
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300 && request.response?.id) {
        resolve(request.response);
        return;
      }
      const messages = {
        401: "Sesi login berakhir. Masuk kembali sebelum mengunggah.",
        403: "Akun ini tidak memiliki izin mengunggah file.",
        413: "File terlalu besar. Pilih file berukuran maksimal 3 MB.",
      };
      const codes = {
        GOOGLE_REAUTHORIZE: "Koneksi Google Drive perlu diaktifkan ulang oleh Developer. Jalankan ATUR-ULANG-GOOGLE-DRIVE.bat pada project.",
        GOOGLE_OAUTH_FAILED: "Google Drive belum dapat dihubungkan. Periksa konfigurasi OAuth project.",
      };
      const contentType = typeof request.getResponseHeader === "function"
        ? request.getResponseHeader("content-type") || "" : "";
      const previewIsStatic = request.status === 404 || contentType.includes("text/html") ||
        (request.status === 200 && !request.response?.id);
      reject(new Error(codes[request.response?.code] || messages[request.status] ||
        (previewIsStatic
          ? "Preview ini tidak menjalankan API upload. Jalankan project dengan npm start lalu buka http://127.0.0.1:3000."
          : "Unggahan belum berhasil dikonfirmasi. Periksa daftar file sebelum mencoba lagi.")));
    });
    request.addEventListener("error", () => reject(new Error("Koneksi terputus. Periksa koneksi dan daftar file sebelum mencoba lagi.")));
    request.addEventListener("timeout", () => reject(new Error("Unggahan terlalu lama. Periksa koneksi dan daftar file sebelum mencoba lagi.")));
    request.addEventListener("abort", () => reject(new Error("Pengiriman terhenti. File belum dikonfirmasi tersimpan.")));
    request.send(file);
  });
}
