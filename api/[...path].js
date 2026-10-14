const routes = {
  "profile/photo": () => import("./_handlers/profile/photo.js"),
  "profile/instagram": () => import("./_handlers/profile/instagram.js"),
  "public/member-photos": () => import("./_handlers/public/member-photos.js"),
};

export default async function handler(req, res) {
  const rawPath = req.query?.path;
  const routePath = (Array.isArray(rawPath) ? rawPath.join("/") : String(rawPath || ""))
    .split("/")
    .filter(Boolean)
    .join("/");
  const loadRoute = Object.hasOwn(routes, routePath) ? routes[routePath] : null;

  if (!loadRoute) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(404).json({ error: "API endpoint tidak ditemukan." });
  }

  try {
    const module = await loadRoute();
    return await module.default(req, res);
  } catch (error) {
    console.error("[api/catch-all] handler failed", { routePath, message: error?.message });
    if (res.headersSent) return;
    return res.status(500).json({ error: "Permintaan belum dapat diproses. Coba lagi." });
  }
}
