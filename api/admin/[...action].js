import createUserHandler from "../../server/api-handlers/admin/create-user.js";
import deleteUserHandler from "../../server/api-handlers/admin/delete-user.js";
import resetPasswordHandler from "../../server/api-handlers/admin/reset-password.js";
import updateUserHandler from "../../server/api-handlers/admin/update-user.js";

const handlers = new Map([
  ["create-user", createUserHandler],
  ["delete-user", deleteUserHandler],
  ["reset-password", resetPasswordHandler],
  ["update-user", updateUserHandler],
]);

export default function adminRouter(req, res) {
  const action = String(req.url || "")
    .split("?")[0]
    .split("/api/admin/")[1]
    ?.replace(/\/+$/, "");
  const handler = handlers.get(action);
  if (!handler) return res.status(404).json({ error: "Endpoint tidak ditemukan." });
  return handler(req, res);
}
