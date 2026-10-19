import instagramHandler from "../../server/api-handlers/profile/instagram.js";
import photoHandler from "../../server/api-handlers/profile/photo.js";
import profileUpdateHandler from "../../server/api-handlers/profile/update.js";

const handlers = new Map([
  ["instagram", instagramHandler],
  ["photo", photoHandler],
  ["update", profileUpdateHandler],
]);

export default function profileRouter(req, res) {
  const action = String(req.url || "")
    .split("?")[0]
    .split("/api/profile/")[1]
    ?.replace(/\/+$/, "");
  const handler = handlers.get(action);
  if (!handler) return res.status(404).json({ error: "Endpoint tidak ditemukan." });
  return handler(req, res);
}
