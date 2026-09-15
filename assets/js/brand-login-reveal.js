const LOGIN_MARKER = "clouven-login-brand-user";

// Login stores a one-use user id. Restored sessions and guest visits never animate.
export function playLoginBrandReveal(button, user) {
  if (!button || !user?.id) return;
  let marker = null;
  try { marker = sessionStorage.getItem(LOGIN_MARKER); }
  catch { return; }
  if (marker !== user.id) return;
  try { sessionStorage.removeItem(LOGIN_MARKER); } catch {}
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  button.classList.add("is-login-reveal");
  button.addEventListener("animationend", event => {
    if (event.animationName === "brand-mark-shine") button.classList.remove("is-login-reveal");
  }, { once: false });
  // A browser that suppresses animation events still returns the mark to its normal interactive state.
  setTimeout(() => button.classList.remove("is-login-reveal"), 2200);
}
