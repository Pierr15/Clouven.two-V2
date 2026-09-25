import { styledName } from "./styled-name.js";
import { startNameSync } from "./name-sync.js";
import { getSession, ROLE_LABEL, hasRole, logout } from "./auth.js";
import { can } from "./permissions.js";
import { initials, escapeHTML } from "./utils.js";
import { mountBrandPreview } from "./brand-preview.js";
import { playLoginBrandReveal } from "./brand-login-reveal.js?v=startup-transition-3";
import { mountNotificationCenter } from "./notifications.js";

const links = [
  ["home", "/", "home", "Home"],
  ["schedule", "/jadwal/", "calendar-week", "Schedule"],
  ["calendar", "/kalender/", "calendar-event", "Kalender"],
  ["tasks", "/tugas/", "clipboard-list", "Tasks"],
  ["tools", "/tools/", "tools", "Tools"],
  ["storage", "/penyimpanan/", "brand-google-drive", "Storage"],
  ["members", "/anggota/", "users", "Members"],
];

export async function mountShell(active = "") {
  const host = document.querySelector("#sidebar");
  if (!host) return null;
  const session = await getSession();
  let collapsed = false;
  try {
    collapsed = localStorage.getItem("clouven-sidebar-collapsed") === "1";
  } catch {}
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  const protectedKeys = new Set(["tasks", "calendar", "storage", "members"]);
  host.className = `sidebar${collapsed ? " is-collapsed" : ""}`;
  document.documentElement.classList.remove("sidebar-precollapsed");
  host.innerHTML = `
    <button class="sidebar-close icon-button" type="button" aria-label="Tutup menu navigasi">×</button>
    <div class="sidebar-brand">
      <button type="button" class="brand-symbol"><span class="brand-mark" aria-hidden="true">C<sup>2</sup></span></button>
      <a href="/" class="brand-copy">Ruang <strong>Kelas</strong></a>
      <button
      class="sidebar-collapse"
      type="button"
      aria-label="${collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}"
      aria-expanded="${!collapsed}"
      >
        ${
          collapsed
            ? `<i class="ti ti-chevron-right"></i>`
            : `<i class="ti ti-chevron-left"></i>`
        }
      </button>
    </div>
    <nav class="sidebar-nav" aria-label="Navigasi utama">
      ${links
        .map(
          ([key, href, icon, label]) => `
        <a
          class="sidebar-link ${active === key ? "is-active" : ""}"
          aria-label="${label}" title="${label}" ${active === key ? 'aria-current="page"' : ""}
          href="${
            protectedKeys.has(key) && !session.user
              ? `/login/?next=${encodeURIComponent(href)}`
              : href
          }"
        >
          <span class="nav-icon">
            <i class="ti ti-${icon}"></i>
          </span>

          <span class="nav-label">${label}</span>
        </a>
      `,
        )
        .join("")}

    </nav>
    <div class="sidebar-spacer"></div>
        ${
          session.user && can(session.role, "manage_class")
            ? `
    <a
      class="sidebar-link ${["admin", "manage"].includes(active) ? "is-active" : ""}"
      href="${can(session.role, "admin") ? "/admin/" : "/kelola/"}"
      aria-label="${can(session.role, "admin") ? "Admin Panel" : "Kelola Kelas"}" title="${can(session.role, "admin") ? "Admin Panel" : "Kelola Kelas"}" ${active === "admin" ? 'aria-current="page"' : ""}
    >
      <span class="nav-icon">
        <i class="ti ti-user-shield"></i>
      </span>
      <span class="nav-label">${can(session.role, "admin") ? "Admin Panel" : "Kelola Kelas"}</span>
    </a>
  `
            : ""
        }

    ${session.user ? '<div class="notification-host" id="notificationHost"></div>' : ""}
    <p class="sidebar-section-label">Akun</p>

    <div class="sidebar-account">
      <div class="sidebar-profile">
        <a
          class="profile-main"
          href="${session.user ? "/profile/" : "/login/"}"
          aria-label="${session.user ? "Buka profile" : "Login"}"
        >
          <span class="profile-avatar">
            <span class="profile-initials">
              ${escapeHTML(
                initials(
                  session.profile?.name ||
                    session.user?.user_metadata?.name ||
                    "Guest",
                ),
              )}
            </span>

            <i class="ti ti-settings profile-gear"></i>
          </span>

          <span class="profile-copy">
            <strong>
              ${styledName(
                session.profile || {
                  name: session.user?.user_metadata?.name || "Login",
                  role: "guest",
                },
              )}
            </strong>

            <span>${ROLE_LABEL[session.role] || "Guest"}</span>
          </span>
        </a>

        <button class="profile-theme" type="button" aria-label="Dark mode" data-theme-toggle>
          <i class="ti ti-moon" data-theme-icon aria-hidden="true"></i>
        </button>

        ${
          session.user
            ? `
              <button
                class="profile-logout"
                type="button"
                aria-label="Logout"
                title="Logout"
                data-logout
              >
                <i class="ti ti-logout-2"></i>
              </button>
            `
            : ""
        }
      </div>

            <div class="account-drawer" id="accountDrawer">
              <a href="${session.user ? "/profile/" : "/login/"}">
                <i class="ti ti-user-circle"></i>
                <span>${session.user ? "Profile" : "Login"}</span>
              </a>

              <button class="drawer-theme" type="button" aria-label="Dark mode" data-theme-toggle>
                <i class="ti ti-moon" data-theme-icon aria-hidden="true"></i>
                <span data-theme-label>Dark mode</span>
              </button>

              ${
                session.user
                  ? `
              <button type="button" data-logout>
                <i class="ti ti-logout-2"></i>
                <span>Logout</span>
              </button>
              `
                  : ""
              }
            </div>
    </div>
  `;
  startNameSync(session);
  if (session.user) mountNotificationCenter(host.querySelector("#notificationHost"),session.user.id);
  document.dispatchEvent(new Event("clouven:shell-ready"));
  mountBrandPreview(host.querySelector(".brand-symbol"));
  playLoginBrandReveal(session.user);

  const account = host.querySelector(".sidebar-account");
  const drawer = account.querySelector(".account-drawer");
  const profileLink = account.querySelector(".profile-main");
  let restoringAccountFocus = false;
  function reopenAccount() {
    account.classList.remove("is-dismissed");
    drawer.inert = false;
  }
  account.addEventListener("clouven:close-account", () => {
    account.classList.add("is-dismissed");
    // Return focus without letting :focus-within reopen the dismissed drawer.
    restoringAccountFocus = true;
    if (drawer.contains(document.activeElement))
      profileLink.focus({ preventScroll: true });
    restoringAccountFocus = false;
    drawer.inert = true;
  });
  profileLink.addEventListener("pointerenter", reopenAccount);
  profileLink.addEventListener("focus", () => {
    if (!restoringAccountFocus) reopenAccount();
  });
  profileLink.addEventListener("keydown", (event) => {
    if (innerWidth <= 820 || !host.classList.contains("is-collapsed")) return;
    if (event.key === "ArrowDown" || event.key === " ") {
      event.preventDefault();
      reopenAccount();
      drawer.querySelector("a")?.focus();
    }
  });
  profileLink.addEventListener("click", (event) => {
    if (innerWidth <= 820 || !host.classList.contains("is-collapsed")) return;
    event.preventDefault();
    reopenAccount();
  });

  const collapseButton = host.querySelector(".sidebar-collapse");

  collapseButton?.addEventListener("click", () => {
    const next = !host.classList.contains("is-collapsed");

    host.classList.toggle("is-collapsed", next);
    document.body.classList.toggle("sidebar-collapsed", next);

    try {
      localStorage.setItem("clouven-sidebar-collapsed", next ? "1" : "0");
    } catch {}
    collapseButton.setAttribute("aria-expanded", String(!next));

    collapseButton.innerHTML = next
      ? `<i class="ti ti-chevron-right"></i>`
      : `<i class="ti ti-chevron-left"></i>`;

    collapseButton.setAttribute(
      "aria-label",
      next ? "Perluas sidebar" : "Ciutkan sidebar",
    );
  });

  host.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();

      try {
        await logout();
        location.href = "/login/";
      } catch (error) {
        console.error("Logout gagal:", error);
        alert("Logout gagal. Coba lagi.");
      }
    });
  });

  const menu = document.querySelector(".mobile-menu");
  const main = document.querySelector(".app-main");
  const mobile = matchMedia("(max-width: 820px)");
  const backdrop = document.createElement("div");
  backdrop.className = "sidebar-backdrop";
  backdrop.hidden = true;
  backdrop.setAttribute("aria-hidden", "true");
  document.body.appendChild(backdrop);
  menu?.setAttribute("aria-label", "Buka menu navigasi");
  menu?.setAttribute("aria-controls", "sidebar");

  function setMobileOpen(open, restoreFocus = true) {
    open = open && mobile.matches;
    host.classList.toggle("is-mobile-open", open);
    document.body.classList.toggle("mobile-nav-open", open);
    backdrop.hidden = !open;
    host.inert = mobile.matches && !open;
    if (main) main.inert = open;
    menu?.setAttribute("aria-expanded", String(open));
    if (open) host.querySelector(".sidebar-close")?.focus();
    else if (restoreFocus && mobile.matches) menu?.focus();
  }
  menu?.addEventListener("click", () => setMobileOpen(true));
  host
    .querySelector(".sidebar-close")
    ?.addEventListener("click", () => setMobileOpen(false));
  backdrop.addEventListener("click", () => setMobileOpen(false));
  document.addEventListener("keydown", (event) => {
    if (!host.classList.contains("is-mobile-open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setMobileOpen(false);
    }
    if (event.key === "Tab") {
      const items = [
        ...host.querySelectorAll("a[href],button:not([disabled])"),
      ].filter(
        (el) =>
          el.getClientRects().length &&
          getComputedStyle(el).visibility === "visible",
      );
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  mobile.addEventListener("change", () => {
    const focusWasInside = host.contains(document.activeElement);
    const menuHadFocus =
      document.activeElement === menu ||
      document.activeElement === host.querySelector(".sidebar-close");
    setMobileOpen(false, false);
    if (mobile.matches && focusWasInside) menu?.focus();
    else if (!mobile.matches && menuHadFocus) collapseButton?.focus();
  });
  setMobileOpen(false, false);
  return session;
}
