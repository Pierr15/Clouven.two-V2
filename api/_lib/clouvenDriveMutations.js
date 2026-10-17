function apiError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

const DRIVE_ID = /^[A-Za-z0-9_-]{5,200}$/;
function validateId(value) {
  if (typeof value !== "string" || !DRIVE_ID.test(value)) {
    throw apiError(400, "ID Google Drive tidak valid.", "INVALID_DRIVE_FILE_ID");
  }
}

async function patchFile({ token, driveFileId, fields, query = "" }) {
  validateId(driveFileId);
  const params = new URLSearchParams({
    fields: "id,name,mimeType,parents,trashed,webViewLink",
    supportsAllDrives: "true",
  });
  if (query) {
    for (const [key, value] of Object.entries(query)) params.set(key, value);
  }
  const response = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(driveFileId) + "?" + params.toString(), {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    throw Object.assign(new Error("Tidak dapat memperbarui item Google Drive."), {
      status: response.status >= 500 ? 502 : 400,
      code: data?.error?.status || "GOOGLE_DRIVE_REQUEST_FAILED",
    });
  }
  if (data.id !== driveFileId) throw apiError(502, "Google Drive mengembalikan metadata item yang tidak sesuai.", "GOOGLE_DRIVE_INVALID_RESPONSE");
  return data;
}

/**
 * These primitives only mutate the service-owned Google Drive object.
 * A calling API handler must enforce Clouven ACLs and journal/reconcile metadata.
 */
export async function renameDriveItem({ token, driveFileId, name }) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 240 || /[\\/\u0000-\u001f\u007f]/.test(name)) {
    throw apiError(400, "Nama item tidak valid.", "INVALID_ITEM_NAME");
  }
  return patchFile({ token, driveFileId, fields: { name: name.trim().replace(/\s+/g, " ") } });
}

export async function moveDriveItem({ token, driveFileId, oldParentDriveId, newParentDriveId }) {
  validateId(oldParentDriveId);
  validateId(newParentDriveId);
  if (oldParentDriveId === newParentDriveId) throw apiError(400, "Folder asal dan tujuan sama.", "SAME_PARENT");
  return patchFile({
    token, driveFileId, fields: {},
    query: { addParents: newParentDriveId, removeParents: oldParentDriveId },
  });
}

export async function setDriveItemTrashed({ token, driveFileId, trashed }) {
  if (typeof trashed !== "boolean") throw apiError(400, "Status Trash tidak valid.", "INVALID_TRASH_STATE");
  return patchFile({ token, driveFileId, fields: { trashed } });
}
