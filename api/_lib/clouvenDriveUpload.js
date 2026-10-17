export const MAX_DRIVE_UPLOAD_BYTES = 3 * 1024 * 1024;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function validateDriveUpload({ name, mimeType, sizeBytes }) {
  if (typeof name !== "string") {
    throw Object.assign(new Error("Nama file wajib berupa teks."), { status: 400, code: "INVALID_FILE_NAME" });
  }
  const normalizedName = name.trim().replace(/\s+/g, " ");
  if (!normalizedName || normalizedName.length > 240 || CONTROL_CHARACTERS.test(normalizedName) || normalizedName === "." || normalizedName === "..") {
    throw Object.assign(new Error("Nama file wajib diisi dan maksimal 240 karakter."), { status: 400, code: "INVALID_FILE_NAME" });
  }
  if (typeof mimeType !== "string" || !mimeType.trim() || mimeType.length > 160 || CONTROL_CHARACTERS.test(mimeType)) {
    throw Object.assign(new Error("Tipe konten file tidak valid."), { status: 400, code: "INVALID_FILE_TYPE" });
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1) {
    throw Object.assign(new Error("File harus memiliki ukuran lebih dari 0 byte."), { status: 400, code: "INVALID_FILE_SIZE" });
  }
  if (sizeBytes > MAX_DRIVE_UPLOAD_BYTES) {
    throw Object.assign(new Error("Ukuran file maksimal 3 MiB."), { status: 413, code: "FILE_TOO_LARGE" });
  }
  return { name: normalizedName, mimeType: mimeType.trim().toLowerCase(), sizeBytes };
}

export function readRawBodyWithLimit(req, limit = MAX_DRIVE_UPLOAD_BYTES) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_DRIVE_UPLOAD_BYTES) {
    throw new TypeError("Upload body limit must be between 1 byte and 3 MiB.");
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on("data", (chunk) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > limit) {
        fail(Object.assign(new Error("Ukuran file maksimal 3 MiB."), { status: 413, code: "FILE_TOO_LARGE" }));
        req.pause?.();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks, size));
    });
    req.on("error", (error) => fail(error));
    req.on("aborted", () => fail(Object.assign(new Error("Upload dibatalkan."), { status: 400, code: "UPLOAD_ABORTED" })));
  });
}
