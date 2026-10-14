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
  window.__clouvenMobileDockCleanup?.();
  const session = await getSession();
  if (!document.querySelector("#developer-avatar-shimmer-styles")) {
    const style = document.createElement("style");
    style.id = "developer-avatar-shimmer-styles";
    style.textContent = `
      .developer-shimmer-avatar, .member-photo.is-developer { position: relative; isolation: isolate; overflow: hidden; }
      .developer-shimmer-avatar::after, .member-photo.is-developer::after {
        content: ""; position: absolute; z-index: 3; top: -35%; bottom: -35%; left: -100%; width: 60%;
        pointer-events: none; background: linear-gradient(110deg, transparent, rgba(255,255,255,.12) 35%, rgba(255,255,255,.9) 50%, rgba(255,220,150,.4) 57%, transparent 76%);
        transform: skewX(-18deg); animation: developerAvatarShimmer 4.8s ease-in-out infinite;
      }
      @keyframes developerAvatarShimmer { 0%, 15% { left: -100%; opacity: 0; } 25% { opacity: 1; } 65%, 100% { left: 140%; opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { .developer-shimmer-avatar::after, .member-photo.is-developer::after { animation: none; } }
    `;
    document.head.appendChild(style);
  }
  let collapsed = false;
  try {
    collapsed = localStorage.getItem("clouven-sidebar-collapsed") === "1";
  } catch {}
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  const protectedKeys = new Set(["tasks", "calendar", "storage"]);
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
          <span class="profile-avatar${session.role === "developer" ? " developer-shimmer-avatar" : ""}">
            ${(session.profile?.photo || session.user?.user_metadata?.avatar_url) ? `<img src="${escapeHTML(session.profile?.photo || session.user.user_metadata.avatar_url)}" alt="" class="profile-avatar-image" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit" />` : ""}
            <span class="profile-initials" ${(session.profile?.photo || session.user?.user_metadata?.avatar_url) ? 'style="display:none"' : ""}>
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
  // On mobile, the top-right control opens the account menu instead of the sidebar.
  const mobileTopbar = menu?.closest(".mobile-topbar");
  const mobileProfileMenuId = "mobileProfileMenu";
  const notificationHostForHeader = host.querySelector("#notificationHost");
  if (mobileTopbar && notificationHostForHeader) {
    mobileTopbar.insertBefore(notificationHostForHeader, menu || null);
    notificationHostForHeader.classList.add("mobile-header-notifications");
  }
  const avatarPhoto = session.profile?.photo || session.user?.user_metadata?.avatar_url || "";
  const avatarName = session.profile?.name || session.user?.user_metadata?.name || "Guest";
  const avatarMarkup = avatarPhoto
    ? '<img src="' + escapeHTML(avatarPhoto) + '" alt="" class="mobile-profile-avatar-image">'
    : '<span class="mobile-profile-avatar-initials">' + escapeHTML(initials(avatarName)) + '</span>';
  if (menu && mobileTopbar) {
    menu.innerHTML = '<span class="mobile-profile-avatar' + (session.role === "developer" ? " developer-shimmer-avatar" : "") + '">' + avatarMarkup + '</span>';
    menu.classList.add("mobile-profile-trigger");
    menu.setAttribute("aria-label", "Buka menu profil");
    menu.setAttribute("aria-controls", mobileProfileMenuId);
    menu.setAttribute("aria-expanded", "false");
    const managementLink = session.user && can(session.role, "manage_class")
      ? '<a class="mobile-profile-menu-item" href="' + (can(session.role, "admin") ? "/admin/" : "/kelola/") + '"><i class="ti ti-user-shield" aria-hidden="true"></i><span>' + (can(session.role, "admin") ? "Admin Panel" : "Kelola Kelas") + '</span></a>'
      : "";
    const profileMenu = document.createElement("section");
    profileMenu.id = mobileProfileMenuId;
    profileMenu.className = "mobile-profile-menu";
    profileMenu.hidden = true;
    profileMenu.setAttribute("aria-label", "Menu akun");
    profileMenu.innerHTML =
      '<div class="mobile-profile-menu-heading"><span>' + escapeHTML(avatarName) + '</span><small>' + escapeHTML(ROLE_LABEL[session.role] || "Guest") + '</small></div>' +
      managementLink +
      '<a class="mobile-profile-menu-item" href="' + (session.user ? "/profile/" : "/login/") + '"><i class="ti ti-user-circle" aria-hidden="true"></i><span>' + (session.user ? "Profil" : "Login") + '</span></a>' +
      '<button class="mobile-profile-menu-item" type="button" data-theme-toggle aria-label="Ganti mode tampilan"><i class="ti ti-moon" data-theme-icon aria-hidden="true"></i><span data-theme-label>Mode gelap/terang</span></button>' +
      (session.user ? '<button class="mobile-profile-menu-item" type="button" data-mobile-profile-logout><i class="ti ti-logout-2" aria-hidden="true"></i><span>Logout</span></button>' : "");
    mobileTopbar.appendChild(profileMenu);
    menu.addEventListener("click", (event) => {
      event.stopPropagation();
      const opening = profileMenu.hidden;
      profileMenu.hidden = !opening;
      menu.setAttribute("aria-expanded", String(opening));
    });
    let replayingMobileThemeToggle = false;
    profileMenu.addEventListener("click", (event) => {
      const themeButton = event.target.closest("[data-theme-toggle]");
      if (!themeButton || replayingMobileThemeToggle) return;
      event.preventDefault();
      event.stopPropagation();
      const avatarRect = menu.getBoundingClientRect();
      const root = document.documentElement;
      root.style.setProperty("--mobile-theme-origin-x", (avatarRect.left + avatarRect.width / 2) + "px");
      root.style.setProperty("--mobile-theme-origin-y", (avatarRect.top + avatarRect.height / 2) + "px");
      const toggleTheme = () => {
        replayingMobileThemeToggle = true;
        themeButton.click();
        replayingMobileThemeToggle = false;
      };
      if (mobile.matches && document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        document.startViewTransition(toggleTheme);
      } else {
        toggleTheme();
      }
      profileMenu.hidden = true;
      menu.setAttribute("aria-expanded", "false");
    }, true);
    profileMenu.addEventListener("click", async (event) => {
      const logoutButton = event.target.closest("[data-mobile-profile-logout]");
      if (!logoutButton) return;
      logoutButton.disabled = true;
      try {
        await logout();
        location.href = "/login/";
      } catch (error) {
        console.error("Logout gagal:", error);
        alert("Logout gagal. Coba lagi.");
        logoutButton.disabled = false;
      }
    });
    document.addEventListener("click", (event) => {
      if (!profileMenu.hidden && !profileMenu.contains(event.target) && !menu.contains(event.target)) {
        profileMenu.hidden = true;
        menu.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !profileMenu.hidden) {
        profileMenu.hidden = true;
        menu.setAttribute("aria-expanded", "false");
        menu.focus({ preventScroll: true });
      }
    });
  } else {
    menu?.addEventListener("click", () => setMobileOpen(true));
  }
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

  // Mobile header follows the dock: hide on downward scroll and reveal on upward scroll.
  let lastHeaderScrollY = window.scrollY;
  let headerScrollFrame = 0;
  const updateMobileHeaderOnScroll = () => {
    if (headerScrollFrame) return;
    headerScrollFrame = requestAnimationFrame(() => {
      headerScrollFrame = 0;
      if (!mobile.matches) {
        mobileTopbar?.classList.remove("is-header-hidden");
        lastHeaderScrollY = window.scrollY;
        return;
      }
      const y = Math.max(0, window.scrollY);
      const delta = y - lastHeaderScrollY;
      if (y < 24 || delta < -4) mobileTopbar?.classList.remove("is-header-hidden");
      else if (delta > 5 && y > 80) mobileTopbar?.classList.add("is-header-hidden");
      lastHeaderScrollY = y;
    });
  };
  window.addEventListener("scroll", updateMobileHeaderOnScroll, { passive: true });
  mobile.addEventListener("change", () => {
    lastHeaderScrollY = window.scrollY;
    mobileTopbar?.classList.remove("is-header-hidden");
  });

  // Mobile floating dock: keep the existing desktop sidebar and permission logic intact.
  const dock = document.createElement("div");
  dock.className = "mobile-dock";
  const protectedDockKeys = new Set(["tasks", "calendar", "storage"]);
  const dockHref = (key, href) =>
    protectedDockKeys.has(key) && !session.user
      ? "/login/?next=" + encodeURIComponent(href)
      : href;
  const dockLink = (key, href, icon, label) =>
    '<a class="mobile-dock-item' + (active === key ? " is-active" : "") + '" href="' +
    dockHref(key, href) + '" aria-label="' + label + '" title="' + label + '"' +
    (active === key ? ' aria-current="page"' : "") + '><i class="ti ti-' + icon +
    '" aria-hidden="true"></i></a>';
  const auxiliaryLinks = [
    ["calendar", "/kalender/", "calendar-event", "Kalender"],
    ["tools", "/tools/", "tools", "Tools"],
    ["members", "/anggota/", "users", "Anggota"],
  ];
  const auxiliaryMarkup = auxiliaryLinks.map(([key, href, icon, label]) =>
    '<a class="mobile-dock-panel-link' + (active === key ? " is-active" : "") +
    '" href="' + dockHref(key, href) + '"' +
    (active === key ? ' aria-current="page"' : "") + '><i class="ti ti-' + icon +
    '" aria-hidden="true"></i><span>' + label + '</span></a>'
  ).join("");
  const managementMarkup = session.user && can(session.role, "manage_class")
    ? '<a class="mobile-dock-panel-link" href="' +
      (can(session.role, "admin") ? "/admin/" : "/kelola/") +
      '"><i class="ti ti-user-shield" aria-hidden="true"></i><span>' +
      (can(session.role, "admin") ? "Admin Panel" : "Kelola Kelas") + '</span></a>'
    : "";
  dock.innerHTML = [
    '<section class="mobile-dock-panel" id="mobileDockPanel" aria-label="Menu lainnya" hidden>',
      '<div class="mobile-dock-panel-heading"><strong>Menu lainnya</strong>',
        '<button class="mobile-dock-panel-close" type="button" data-dock-close aria-label="Tutup menu lainnya" title="Tutup menu lainnya"><i class="ti ti-x" aria-hidden="true"></i></button>',
      '</div>',
      '<nav class="mobile-dock-panel-links" aria-label="Menu tambahan">',
        auxiliaryMarkup,
        
      '</nav>',
 
    '</section>',
    '<div class="mobile-dock-shell">',
      '<nav class="mobile-dock-nav" aria-label="Navigasi utama">',
        dockLink("home", "/", "home", "Home"),
        dockLink("schedule", "/jadwal/", "calendar-week", "Jadwal"),
        dockLink("tasks", "/tugas/", "clipboard-list", "Tugas"),
        dockLink("storage", "/penyimpanan/", "brand-google-drive", "Storage"),
        '<button class="mobile-dock-item mobile-dock-more' + (["calendar", "tools", "members", "admin", "manage"].includes(active) ? " is-active" : "") + '" type="button" data-dock-more aria-controls="mobileDockPanel" aria-expanded="false" aria-label="Lainnya" title="Lainnya"><i class="ti ti-layout-grid" aria-hidden="true"></i></button>',
      '</nav>',
      '<button class="mobile-dock-peek" type="button" data-dock-peek aria-label="Tampilkan navigasi" title="Tampilkan navigasi" aria-expanded="false" hidden><span aria-hidden="true"></span></button>',
    '</div>',
  ].join("");
  document.body.appendChild(dock);

  const dockPanel = dock.querySelector("#mobileDockPanel");
  const dockNav = dock.querySelector(".mobile-dock-nav");
  const dockMore = dock.querySelector("[data-dock-more]");
  const dockPeek = dock.querySelector("[data-dock-peek]");
  const notificationHost = host.querySelector("#notificationHost");
  const notificationSlot = null;
  let dockPanelOpen = false;
  let dockCompact = false;
  let lastDockScrollY = window.scrollY;
  let dockIdleTimer = 0;
  let dockScrollFrame = 0;
  const dockAbort = new AbortController();
  const dockOptions = { signal: dockAbort.signal };

  function setDockCompact(compact) {
    if (compact && dockPanelOpen) return;
    dockCompact = compact;
    dock.classList.toggle("is-compact", compact);
    dockNav.inert = compact;
    dockNav.setAttribute("aria-hidden", String(compact));
    dockPeek.hidden = !compact;
    dockPeek.setAttribute("aria-expanded", String(!compact));
  }
  function closeDockPanel(restoreFocus = false) {
    if (!dockPanelOpen) return;
    dockPanelOpen = false;
    dockPanel.hidden = true;
    dockMore.setAttribute("aria-expanded", "false");
    dockMore.classList.remove("is-active-panel");
    if (restoreFocus && mobile.matches) dockMore.focus({ preventScroll: true });
  }
  function openDockPanel() {
    setDockCompact(false);
    dockPanelOpen = true;
    dockPanel.hidden = false;
    dockMore.setAttribute("aria-expanded", "true");
    dockMore.classList.add("is-active-panel");
    dockPanel.querySelector(".mobile-dock-panel-close")?.focus({ preventScroll: true });
  }
  function syncDockVisibility() {
    const mobileOpen = mobile.matches && host.classList.contains("is-mobile-open");
    dock.hidden = !mobile.matches;
    dock.inert = !mobile.matches || mobileOpen;
    dock.setAttribute("aria-hidden", String(!mobile.matches || mobileOpen));
    if (!mobile.matches && notificationHost && notificationHost.parentElement !== host) {
      host.appendChild(notificationHost);
      notificationHost.classList.remove("mobile-header-notifications");
    } else if (mobile.matches && notificationHost && mobileTopbar && notificationHost.parentElement !== mobileTopbar) {
      mobileTopbar.insertBefore(notificationHost, menu || null);
      notificationHost.classList.add("mobile-header-notifications");
    }
    if (!mobile.matches || mobileOpen) {
      closeDockPanel(false);
      setDockCompact(false);
    }
  }
  dockMore.addEventListener("click", () => {
    if (dockPanelOpen) closeDockPanel(true);
    else openDockPanel();
  }, dockOptions);
  dockPeek.addEventListener("click", () => {
    clearTimeout(dockIdleTimer);
    setDockCompact(false);
    dockMore.focus({ preventScroll: true });
  }, dockOptions);
  dock.querySelector("[data-dock-close]").addEventListener("click", () => closeDockPanel(true), dockOptions);
  dock.addEventListener("click", async event => {
    const logoutButton = event.target.closest("[data-dock-logout]");
    if (!logoutButton) return;
    logoutButton.disabled = true;
    try {
      await logout();
      location.href = "/login/";
    } catch (error) {
      console.error("Logout gagal:", error);
      alert("Logout gagal. Coba lagi.");
      logoutButton.disabled = false;
    }
  }, dockOptions);
  document.addEventListener("click", event => {
    if (dockPanelOpen && !dock.contains(event.target)) closeDockPanel(false);
  }, dockOptions);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && dockPanelOpen) {
      event.preventDefault();
      closeDockPanel(true);
    }
  }, dockOptions);
  menu?.addEventListener("click", () => {
    closeDockPanel(false);
    syncDockVisibility();
  }, dockOptions);
  const onDockScroll = () => {
    if (!mobile.matches || dockPanelOpen || host.classList.contains("is-mobile-open")) return;
    const currentY = window.scrollY;
    const delta = currentY - lastDockScrollY;
    lastDockScrollY = currentY;
    if (delta > 2 && currentY > 48) setDockCompact(true);
    else if (delta < -3) setDockCompact(false);
    clearTimeout(dockIdleTimer);
    dockIdleTimer = window.setTimeout(() => {
      if (!dockPanelOpen) setDockCompact(false);
    }, 1000);
  };
  window.addEventListener("scroll", onDockScroll, { passive: true, signal: dockAbort.signal });
  mobile.addEventListener("change", () => {
    lastDockScrollY = window.scrollY;
    syncDockVisibility();
  }, dockOptions);
  // Observe the existing off-canvas menu state so the dock becomes interactive again
  // after it closes via Escape, backdrop, or the close button.
  const dockVisibilityObserver = new MutationObserver(syncDockVisibility);
  dockVisibilityObserver.observe(host, { attributes: true, attributeFilter: ["class"] });
  // The existing notification center is moved, not remounted, so its listeners and live channel stay unique.
  syncDockVisibility();
  window.__clouvenMobileDockCleanup = () => {
    clearTimeout(dockIdleTimer);
    if (dockScrollFrame) cancelAnimationFrame(dockScrollFrame);
    dockVisibilityObserver.disconnect();
    dockAbort.abort();
    dock.remove();
    if (notificationHost && notificationHost.parentElement !== host) host.appendChild(notificationHost);
  };

  return session;
}
