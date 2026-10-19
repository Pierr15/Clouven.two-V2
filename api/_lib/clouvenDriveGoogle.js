import { randomUUID } from "node:crypto";

const FOLDER_MIME = "application/vnd.google-apps.folder";

function driveError(response, data, fallback) {
  return Object.assign(new Error(fallback), {
    status: response.status >= 500 ? 502 : 400,
    code: data?.error?.status || "GOOGLE_DRIVE_REQUEST_FAILED",
  });
}

async function readDriveJson(response, fallback) {
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw driveError(response, data, fallback);
  return data;
}

export async function findFolderByOperationKey(token, operationKey) {
  const q = `appProperties has { key='clouvenOperationKey' and value='${operationKey}' } and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=10&fields=files(id,name,mimeType,parents,appProperties,webViewLink)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await readDriveJson(response, "Tidak dapat memeriksa folder operasi di Google Drive.");
  return (data.files || []).find(file => file.appProperties?.clouvenOperationKey === operationKey) || null;
}

export async function createDriveFolderForOperation({ token, operationKey, name, parentDriveId }) {
  const existing = await findFolderByOperationKey(token, operationKey);
  if (existing) return existing;
  const response = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents,appProperties,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: [parentDriveId],
      appProperties: { clouvenOperationKey: operationKey },
    }),
  });
  const data = await readDriveJson(response, "Gagal membuat folder Google Drive.");
  if (!data.id || data.mimeType !== FOLDER_MIME) {
    throw Object.assign(new Error("Google Drive tidak mengembalikan metadata folder yang valid."), { status: 502, code: "GOOGLE_DRIVE_INVALID_RESPONSE" });
  }
  return data;
}

/** Find a previously uploaded file to reconcile a retried operation. */
export async function findFileByOperationKey(token, operationKey) {
  const q = `appProperties has { key='clouvenOperationKey' and value='${operationKey}' } and trashed = false`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=10&fields=files(id,name,mimeType,size,parents,appProperties,webViewLink)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await readDriveJson(response, "Tidak dapat memeriksa file operasi di Google Drive.");
  return (data.files || []).find(file => file.appProperties?.clouvenOperationKey === operationKey && file.mimeType !== FOLDER_MIME) || null;
}

/**
 * Uploads a small binary file using Drive multipart upload. The caller must enforce
 * Clouven ACLs, byte limits, operation journaling and metadata reconciliation.
 */
export async function uploadDriveFileForOperation({ token, operationKey, name, mimeType, parentDriveId, bytes }) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 3 * 1024 * 1024) {
    throw Object.assign(new Error("Ukuran file maksimal 3 MiB."), { status: bytes?.length > 3 * 1024 * 1024 ? 413 : 400, code: bytes?.length > 3 * 1024 * 1024 ? "FILE_TOO_LARGE" : "INVALID_FILE_BYTES" });
  }
  const existing = await findFileByOperationKey(token, operationKey);
  if (existing) return existing;

  const boundary = "clouven_drive_" + randomUUID().replace(/-/g, "");
  const metadata = JSON.stringify({
    name,
    mimeType,
    parents: [parentDriveId],
    appProperties: { clouvenOperationKey: operationKey },
  });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,parents,appProperties,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });
  const data = await readDriveJson(response, "Gagal mengunggah file ke Google Drive.");
  if (!data.id || data.name !== name || data.mimeType !== mimeType || Number(data.size) !== bytes.length || data.appProperties?.clouvenOperationKey !== operationKey) {
    throw Object.assign(new Error("Google Drive mengembalikan metadata file yang tidak sesuai."), { status: 502, code: "GOOGLE_DRIVE_INVALID_RESPONSE" });
  }
  return data;
}

const DRIVE_ID = /^[A-Za-z0-9_-]{5,200}$/;

function validateDriveId(value) {
  if (typeof value !== "string" || !DRIVE_ID.test(value)) {
    throw Object.assign(new Error("ID Google Drive tidak valid."), { status: 400, code: "INVALID_DRIVE_FILE_ID" });
  }
  return value;
}

/** Reads file bytes server-side; callers must never forward the access token. */
export async function downloadDriveFileBytes({ token, driveFileId }) {
  validateDriveId(driveFileId);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    let data = {};
    try { data = await response.json(); } catch {}
    if (response.status === 404) {
      throw Object.assign(new Error("File tidak ditemukan di Google Drive."), { status: 404, code: "GOOGLE_FILE_NOT_FOUND" });
    }
    throw driveError(response, data, "Gagal mengunduh file dari Google Drive.");
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Permanent deletion is only safe after the caller verified owner/role and empty folders. */
export async function deleteDriveFile({ token, driveFileId }) {
  validateDriveId(driveFileId);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return { id: driveFileId, alreadyDeleted: true };
  if (!response.ok) {
    let data = {};
    try { data = await response.json(); } catch {}
    throw driveError(response, data, "Gagal menghapus file dari Google Drive.");
  }
  return { id: driveFileId, alreadyDeleted: false };
}

export async function createDrivePermission({ token, driveFileId, email, role }) {
  validateDriveId(driveFileId);
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error("Alamat email tujuan tidak valid."), { status: 400, code: "INVALID_EMAIL" });
  }
  if (!["reader", "writer"].includes(role)) {
    throw Object.assign(new Error("Peran berbagi tidak valid."), { status: 400, code: "INVALID_SHARE_ROLE" });
  }
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}/permissions?supportsAllDrives=true&sendNotificationEmail=false&fields=id,type,role,emailAddress,displayName`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "user", role, emailAddress: email }),
  });
  const data = await readDriveJson(response, "Gagal membagikan item ke Google Drive.");
  if (!data.id || data.emailAddress !== email || data.role !== role) {
    throw Object.assign(new Error("Google Drive mengembalikan permission yang tidak sesuai."), { status: 502, code: "GOOGLE_DRIVE_INVALID_RESPONSE" });
  }
  return data;
}

export async function listDrivePermissions({ token, driveFileId }) {
  validateDriveId(driveFileId);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}/permissions?supportsAllDrives=true&fields=permissions(id,type,role,emailAddress,domain,displayName,deleted,expirationTime)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await readDriveJson(response, "Gagal membaca permission Google Drive.");
  return Array.isArray(data.permissions) ? data.permissions : [];
}

export async function deleteDrivePermission({ token, driveFileId, permissionId }) {
  validateDriveId(driveFileId);
  validateDriveId(permissionId);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}/permissions/${encodeURIComponent(permissionId)}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return { id: permissionId, alreadyDeleted: true };
  if (!response.ok) {
    let data = {};
    try { data = await response.json(); } catch {}
    throw driveError(response, data, "Gagal mencabut permission Google Drive.");
  }
  return { id: permissionId, alreadyDeleted: false };
}
