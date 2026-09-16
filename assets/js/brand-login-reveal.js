const LOGIN_MARKER = "clouven-login-brand-user";

function releaseStartupGate() {
  document.documentElement.classList.remove("login-startup-pending", "login-startup-running");
  if (window.__clouvenLoginGateTimer) {
    clearTimeout(window.__clouvenLoginGateTimer);
    delete window.__clouvenLoginGateTimer;
  }
}

// Login stores a one-use user id. Restored sessions and guest visits never animate.
export function playLoginBrandReveal(user) {
  if (!user?.id) {
    releaseStartupGate();
    return;
  }
  let marker = null;
  try { marker = sessionStorage.getItem(LOGIN_MARKER); }
  catch {
    releaseStartupGate();
    return;
  }
  if (marker !== user.id) {
    releaseStartupGate();
    return;
  }
  try { sessionStorage.removeItem(LOGIN_MARKER); } catch {}
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    releaseStartupGate();
    return;
  }
  const overlay = document.createElement("div");
  overlay.className = "login-brand-reveal";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-label", "Login berhasil");
  overlay.innerHTML = `<div class="login-brand-reveal-card" aria-hidden="true"><svg viewBox="0 0 120 120"><path class="login-logo-c" pathLength="100" d="M72 25a38 38 0 1 0 0 70"/><path class="login-logo-two" pathLength="100" d="M78 31c11-9 26-2 22 11-3 10-22 20-25 31h27"/></svg><p>Selamat datang</p></div>`;
  document.body.append(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add("is-active");
    document.documentElement.classList.remove("login-startup-pending");
    document.documentElement.classList.add("login-startup-running");
  });
  const finish = () => {
    overlay.remove();
    releaseStartupGate();
  };
  overlay.addEventListener("animationend", event => {
    if (event.animationName === "login-brand-overlay") finish();
  });
  // A browser that suppresses animation events still removes the temporary layer.
  setTimeout(finish, 2900);
}
