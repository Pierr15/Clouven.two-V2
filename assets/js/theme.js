// Loaded before styles on every page so the saved theme paints immediately.
(() => {
  const root = document.documentElement;
  const key = "clouven-theme";
  let saved = "light";
  try { saved = localStorage.getItem(key) || "light"; } catch {}
  root.dataset.theme = saved === "dark" ? "dark" : "light";
  let switching = false;

  function syncControls() {
    const dark = root.dataset.theme === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(button => {
      const label = dark ? "Light mode" : "Dark mode";
      button.setAttribute("aria-label", label);
      button.title = label;
      button.querySelectorAll("[data-theme-label]").forEach(text => { text.textContent = label; });
      button.querySelectorAll("[data-theme-icon]").forEach(icon => {
        icon.className = `ti ti-${dark ? "sun" : "moon"}`;
      });
    });
  }

  function apply(theme) {
    root.dataset.theme = theme;
    try { localStorage.setItem(key, theme); } catch {}
    syncControls();
  }

  function dismissDrawer(button) {
    if (button.closest(".account-drawer")) {
      button.closest(".sidebar-account")?.dispatchEvent(new Event("clouven:close-account"));
    }
  }

  async function toggle(button) {
    if (switching) return;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    const icon = button.querySelector("[data-theme-icon]");
    const avatar = button.closest(".sidebar-account")?.querySelector(".profile-avatar");
    const rect = avatar?.getBoundingClientRect();
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reducedMotion || !rect?.width || !rect?.height) {
      dismissDrawer(button);
      apply(next);
      if (!reducedMotion) icon?.animate?.([
        { transform: "rotate(-180deg)", opacity: .25 },
        { transform: "rotate(0deg)", opacity: 1 },
      ], { duration: 320, easing: "cubic-bezier(.4, 0, .2, 1)" });
      return;
    }
    // Only the visible user's avatar defines the origin, never the theme button.
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const width = innerWidth;
    const height = innerHeight;
    const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) + 2;
    // Snapshot CSS lengths can use a different zoom scale than DOM rectangles.
    // Percentages keep the reveal attached to the avatar in the rendered viewport.
    const horizontal = value => `${value / width * 100}%`;
    const vertical = value => `${value / height * 100}%`;
    const circleDiagonal = Math.hypot(width, height) / Math.SQRT2;
    const avatarRadius = Math.max(rect.width, rect.height) / 2;
    switching = true;
    root.style.setProperty("--theme-origin-x", horizontal(x));
    root.style.setProperty("--theme-origin-y", vertical(y));
    root.style.setProperty("--theme-avatar-radius", `${avatarRadius / circleDiagonal * 100}%`);
    root.style.setProperty("--theme-radius", `${radius / circleDiagonal * 100}%`);
    root.style.setProperty("--theme-avatar-x", horizontal(rect.left));
    root.style.setProperty("--theme-avatar-y", vertical(rect.top));
    root.style.setProperty("--theme-avatar-width", horizontal(rect.width));
    root.style.setProperty("--theme-avatar-height", vertical(rect.height));
    const iconRect = icon?.getBoundingClientRect();
    if (iconRect) {
      root.style.setProperty("--theme-icon-x", horizontal(iconRect.left));
      root.style.setProperty("--theme-icon-y", vertical(iconRect.top));
      root.style.setProperty("--theme-icon-width", horizontal(iconRect.width));
      root.style.setProperty("--theme-icon-height", vertical(iconRect.height));
    }
    root.toggleAttribute("data-theme-icon-in-drawer", Boolean(button.closest(".account-drawer")));
    avatar.setAttribute("data-theme-origin-avatar", "");
    icon?.setAttribute("data-theme-rotating", "");
    root.classList.add("theme-transitioning");
    let transition;
    try {
      // Both CSS animations begin with the snapshot: no second animation phase.
      transition = document.startViewTransition(() => {
        dismissDrawer(button);
        apply(next);
      });
      transition.ready.catch(() => {});
      await transition.finished;
    } catch {
      // Keep the theme usable if snapshots are unavailable (e.g. a hidden tab).
      transition?.skipTransition();
      dismissDrawer(button);
      apply(next);
    } finally {
      root.classList.remove("theme-transitioning");
      root.removeAttribute("data-theme-icon-in-drawer");
      avatar.removeAttribute("data-theme-origin-avatar");
      icon?.removeAttribute("data-theme-rotating");
      switching = false;
    }
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-theme-toggle]");
    if (button) toggle(button);
  });
  document.addEventListener("clouven:shell-ready", syncControls);
  document.addEventListener("DOMContentLoaded", syncControls);
  addEventListener("storage", event => {
    if (event.key !== key || switching) return;
    root.dataset.theme = event.newValue === "dark" ? "dark" : "light";
    syncControls();
  });
})();
