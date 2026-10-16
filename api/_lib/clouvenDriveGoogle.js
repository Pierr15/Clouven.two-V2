import { getDriveAccessToken } from "./drive.js";

const FOLDER_MIME = "application/vnd.google-apps.folder";

function driveError(response, data, fallback) {
  const error = Object.assign(new Error(data?.error?.message || fallback), {
    status: response.status >= 500 ? 502 : 400,
    code: data?.error?.status || "GOOGLE_DRIVE_REQUEST_FAILED",
  });
  return error;
}

export async function findFolderByOperationKey(token, operationKey) {
  const q = `appProperties has { key='clouvenOperationKey' and value='${operationKey}' } and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=10&fields=files(id,name,mimeType,parents,appProperties,webViewLink)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) throw driveError(response, data, "Tidak dapat memeriksa folder operasi di Google Drive.");
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
  const data = await response.json();
  if (!response.ok) throw driveError(response, data, "Gagal membuat folder Google Drive.");
  if (!data.id || data.mimeType !== FOLDER_MIME) {
    throw Object.assign(new Error("Google Drive tidak mengembalikan metadata folder yang valid."), { status: 502, code: "GOOGLE_DRIVE_INVALID_RESPONSE" });
  }
  return data;
}
