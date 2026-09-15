// Only public credentials may cross the server/browser boundary.
export function validatePublicConfig(value) {
  const message = "Konfigurasi website belum tersedia.";
  if (!value || typeof value.url !== "string" || typeof value.publishableKey !== "string") throw new Error(message);
  let url;
  try { url = new URL(value.url); } catch { throw new Error(message); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!(url.protocol === "https:" || (url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error(message);
  const key = value.publishableKey.trim();
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(key);
  if (!publicKey && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    try {
      const payload = key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      publicKey = JSON.parse(atob(payload)).role === "anon";
    } catch { publicKey = false; }
  }
  if (!publicKey) throw new Error(message);
  return { url: url.origin, publishableKey: key };
}

export async function loadPublicConfig() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("/api/config", {cache:"no-store", signal:controller.signal});
    if (!response.ok) throw new Error("Konfigurasi website belum tersedia.");
    return validatePublicConfig(await response.json());
  } finally { clearTimeout(timeout); }
}
