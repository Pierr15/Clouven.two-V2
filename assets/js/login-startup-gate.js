(() => {
  try {
    if (!sessionStorage.getItem("clouven-login-brand-user")) return;
    document.documentElement.classList.add("login-startup-pending");
    window.__clouvenLoginGateTimer = window.setTimeout(() => {
      document.documentElement.classList.remove("login-startup-pending", "login-startup-running");
    }, 8000);
  } catch {}
})();
