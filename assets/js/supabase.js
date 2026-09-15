import { loadAccount } from "./load-state.js";

import { loadPublicConfig } from "./public-config.js";

const publicConfig = await loadAccount(loadPublicConfig, "Konfigurasi website", "Coba lagi. Jika masih gagal, hubungi pengelola website untuk memeriksa konfigurasi layanan.");

export const supabase = await loadAccount(async () => {
  if (!window.supabase?.createClient) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      script.onload = () => { script.remove(); resolve(); };
      script.onerror = () => { script.remove(); reject(new Error("Layanan tidak dapat dimuat.")); };
      document.head.append(script);
    });
  }
  return window.supabase.createClient(
  publicConfig.url,
  publicConfig.publishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "clouven-two-auth",
    },
  },
  );
}, "Layanan website");

export const USERNAME_DOMAIN = "clouven.local";

export function normalizeUsername(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

export function usernameToEmail(username) {
  const normalized = normalizeUsername(username);

  if (!normalized) {
    throw new Error("Username/NIS tidak valid.");
  }

  return `${normalized}@${USERNAME_DOMAIN}`;
}
