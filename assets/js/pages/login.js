import { loginWithUsername, getSession, hasRole, logout } from "../auth.js";
import { can } from "../permissions.js";
import { showToast } from "../utils.js";

const adminMode = document.body.dataset.loginMode === "admin";
const requestedNext = new URLSearchParams(location.search).get("next");
const next = requestedNext && /^\/(?!\/)/.test(requestedNext) && !requestedNext.includes("\\") ? requestedNext : (adminMode ? "/admin/" : "/");

const existing = await getSession();
if (existing.user) {
  if (adminMode && !can(existing.role, "admin")) location.replace(can(existing.role, "manage_class") ? "/kelola/" : "/");
  else location.replace(next);
}

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.target.querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Memeriksa…";
  try {
    const credential = await loginWithUsername(event.target.username.value, event.target.password.value);
    const session = await getSession(credential.user);
    if (adminMode && !can(session.role, "admin")) {
      await logout();
      throw new Error("Panel Admin hanya tersedia untuk Developer. Gunakan halaman Login untuk masuk ke akun kelas.");
    }
    // The next authenticated page consumes this once. Guests never receive this marker.
    sessionStorage.setItem("clouven-login-brand-user", session.user.id);
    location.href = next;
  } catch (error) {
    showToast(error.message?.toLowerCase().includes("invalid login") ? "Username/NIS atau password salah." : error.message);
  } finally {
    button.disabled = false;
    button.textContent = adminMode ? "Masuk ke Admin →" : "Masuk →";
  }
});
