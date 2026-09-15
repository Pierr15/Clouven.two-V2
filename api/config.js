import { validatePublicConfig } from "../assets/js/public-config.js";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  try {
    console.log("ENV CHECK:", {
      hasUrl: Boolean(process.env.SUPABASE_URL),
      hasPublishableKey: Boolean(process.env.SUPABASE_PUBLISHABLE_KEY),
      hasAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
    });
    const config = validatePublicConfig({
      url: process.env.SUPABASE_URL,
      publishableKey:
        process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
    });
    return res.status(200).json(config);
  } catch (error) {
    console.error("CONFIG ERROR:", error);

    return res.status(503).json({
      error: "Konfigurasi website belum tersedia. Hubungi pengelola website.",
    });
  }
}
