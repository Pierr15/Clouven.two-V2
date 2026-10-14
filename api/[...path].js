import configHandler from "../server/api-handlers/config.js";
import createUserHandler from "../server/api-handlers/admin/create-user.js";
import deleteUserHandler from "../server/api-handlers/admin/delete-user.js";
import resetPasswordHandler from "../server/api-handlers/admin/reset-password.js";
import updateUserHandler from "../server/api-handlers/admin/update-user.js";
import driveDownloadHandler from "../server/api-handlers/drive/download.js";
import driveManageHandler from "../server/api-handlers/drive/manage.js";
import driveUploadHandler from "../server/api-handlers/drive/upload.js";
import notificationsRunHandler from "../server/api-handlers/notifications/run.js";
import instagramHandler from "../server/api-handlers/profile/instagram.js";
import photoHandler from "../server/api-handlers/profile/photo.js";
import profileUpdateHandler from "../server/api-handlers/profile/update.js";
import developerNameHandler from "../server/api-handlers/public/developer-name.js";
import memberPhotosHandler from "../server/api-handlers/public/member-photos.js";

export const config = { api: { bodyParser: false } };

const handlers = new Map([
  ["/api/admin/create-user", createUserHandler],
  ["/api/admin/delete-user", deleteUserHandler],
  ["/api/admin/reset-password", resetPasswordHandler],
  ["/api/admin/update-user", updateUserHandler],
  ["/api/config", configHandler],
  ["/api/drive/download", driveDownloadHandler],
  ["/api/drive/manage", driveManageHandler],
  ["/api/drive/upload", driveUploadHandler],
  ["/api/notifications/run", notificationsRunHandler],
  ["/api/profile/instagram", instagramHandler],
  ["/api/profile/photo", photoHandler],
  ["/api/profile/update", profileUpdateHandler],
  ["/api/public/developer-name", developerNameHandler],
  ["/api/public/member-photos", memberPhotosHandler],
]);

async function parseJsonBody(req) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;
  if (req.url?.split("?")[0] === "/api/drive/upload") return;
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    req.body = {};
    return;
  }
  const chunks = [];
  let size = 0;
  const maxBytes = 5 * 1024 * 1024;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("Payload terlalu besar."), { status: 413 });
    chunks.push(chunk);
  }
  if (!size) { req.body = {}; return; }
  try { req.body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Format JSON tidak valid."), { status: 400 }); }
}

export default async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  const pathname = String(req.url || "").split("?")[0].replace(/\/+$/, "") || "/";
  const routeHandler = handlers.get(pathname);
  if (!routeHandler) return res.status(404).json({ error: "Endpoint tidak ditemukan." });
  try {
    await parseJsonBody(req);
    return await routeHandler(req, res);
  } catch (error) {
    console.error("API request failed", pathname, error);
    if (res.writableEnded) return;
    return res.status(error.status || 500).json({
      error: error.status === 400 || error.status === 413 ? error.message : "Internal server error",
    });
  }
}
