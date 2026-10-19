import developerNameHandler from "../../server/api-handlers/public/developer-name.js";
import memberPhotosHandler from "../../server/api-handlers/public/member-photos.js";

const handlers = new Map([
  ["developer-name", developerNameHandler],
  ["member-photos", memberPhotosHandler],
]);

export default function publicRouter(req, res) {
  const action = String(req.url || "")
    .split("?")[0]
    .split("/api/public/")[1]
    ?.replace(/\/+$/, "");
  const handler = handlers.get(action);
  if (!handler) return res.status(404).json({ error: "Endpoint tidak ditemukan." });
  return handler(req, res);
}
