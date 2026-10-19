import foldersHandler from "../../server/api-handlers/clouven-drive/folders.js";
import itemsHandler from "../../server/api-handlers/clouven-drive/items.js";
import overviewHandler from "../../server/api-handlers/clouven-drive/overview.js";
import filesHandler from "../../server/api-handlers/clouven-drive/files.js";
import downloadHandler from "../../server/api-handlers/clouven-drive/download.js";
import trashHandler from "../../server/api-handlers/clouven-drive/trash.js";
import permissionsHandler from "../../server/api-handlers/clouven-drive/permissions.js";
import shareHandler from "../../server/api-handlers/clouven-drive/share.js";

// Raw uploads and downloads must bypass Vercel's JSON body parser.
export const config = { api: { bodyParser: false } };

const handlers = new Map([
  ["folders", foldersHandler],
  ["items", itemsHandler],
  ["overview", overviewHandler],
  ["files", filesHandler],
  ["download", downloadHandler],
  ["trash", trashHandler],
  ["permissions", permissionsHandler],
  ["share", shareHandler],
]);

const MAX_JSON_BYTES = 64 * 1024;

async function parseJsonBody(req) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return;
  const contentType = String(req.headers?.["content-type"] || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    req.body = {};
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) throw Object.assign(new Error("Payload terlalu besar."), { status: 413 });
    chunks.push(chunk);
  }
  if (!size) {
    req.body = {};
    return;
  }
  try {
    req.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Format JSON tidak valid."), { status: 400 });
  }
}

export default async function clouvenDriveRouter(req, res) {
  res.setHeader?.("Cache-Control", "private, no-store");
  res.setHeader?.("X-Content-Type-Options", "nosniff");
  const action = String(req.url || "")
    .split("?")[0]
    .split("/api/clouven-drive/")[1]
    ?.replace(/\/+$/, "");
  const handler = handlers.get(action);
  if (!handler) return res.status(404).json({ error: "Endpoint tidak ditemukan." });
  try {
    if (action !== "files") await parseJsonBody(req);
    return await handler(req, res);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("[clouven-drive/router]", error.code || "INTERNAL_ERROR");
    if (res.writableEnded) return;
    return res.status(status).json({
      error: status >= 500 && !error.code ? "Permintaan Clouven Drive gagal." : error.message,
      code: error.code || undefined,
    });
  }
}
