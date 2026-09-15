export function mountBrandPreview(trigger) {
  const card = document.createElement("section");
  card.className = "brand-preview";
  card.id = "classInstagramPreview";
  card.hidden = true;
  card.inert = true;
  card.setAttribute("aria-label", "Instagram kelas");
  card.innerHTML =
    '<div class="brand-preview-head"><span class="brand-preview-avatar" aria-hidden="true">C<sup>2</sup></span><div><strong>Clouven.two</strong><p>@clouven.two</p></div><i class="ti ti-brand-instagram" aria-hidden="true"></i></div><p class="muted">Cerita dan kebersamaan kelas, tersimpan di satu tempat.</p><a class="button button-coral" href="https://www.instagram.com/clouven.two/" target="_blank" rel="noopener noreferrer">Buka Instagram <i class="ti ti-arrow-up-right" aria-hidden="true"></i></a>';
  document.body.append(card);
  trigger.setAttribute("aria-controls", card.id);
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", "Preview Instagram kelas @clouven.two");
  let timer,
    hideTimer,
    open = false;
  function position() {
    const rect = trigger.getBoundingClientRect(),
      width = Math.min(304, innerWidth - 24);
    card.style.width = width + "px";
    card.style.left =
      Math.max(12, Math.min(rect.right + 14, innerWidth - width - 12)) + "px";
    card.style.top =
      Math.max(12, Math.min(rect.top, innerHeight - card.offsetHeight - 12)) +
      "px";
  }
  function show() {
    clearTimeout(timer);
    clearTimeout(hideTimer);
    open = true;
    card.hidden = false;
    card.inert = false;
    trigger.setAttribute("aria-expanded", "true");
    position();
    requestAnimationFrame(() => card.classList.add("is-open"));
  }
  function hide(restore = false) {
    clearTimeout(timer);
    open = false;
    card.classList.remove("is-open");
    card.inert = true;
    trigger.setAttribute("aria-expanded", "false");
    hideTimer = setTimeout(() => {
      if (!open) card.hidden = true;
    }, 180);
    if (restore) trigger.focus({ preventScroll: true });
  }
  function delayed() {
    timer = setTimeout(() => {
      if (
        !card.matches(":hover") &&
        !trigger.matches(":hover") &&
        !card.contains(document.activeElement)
      )
        hide();
    }, 180);
  }
  trigger.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") show();
  });
  trigger.addEventListener("pointerleave", delayed);
  card.addEventListener("pointerenter", () => clearTimeout(timer));
  card.addEventListener("pointerleave", delayed);
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    open ? hide() : show();
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      show();
      card.querySelector("a").focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (open && !trigger.contains(event.target) && !card.contains(event.target))
      hide();
  });
  document.addEventListener("focusin", (event) => {
    if (open && !card.contains(event.target) && event.target !== trigger)
      hide();
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        hide(true);
      }
      if (
        event.key === "Tab" &&
        document.activeElement === trigger &&
        !event.shiftKey
      ) {
        event.preventDefault();
        card.querySelector("a").focus();
      } else if (event.key === "Tab" && card.contains(document.activeElement)) {
        event.preventDefault();
        hide();
        if (event.shiftKey) trigger.focus();
        else
          trigger
            .closest(".sidebar-brand")
            ?.querySelector(".brand-copy")
            ?.focus();
      }
    },
    true,
  );
  addEventListener("resize", () => {
    if (open) position();
  });
  addEventListener(
    "scroll",
    () => {
      if (open) position();
    },
    true,
  );
  new MutationObserver(() => {
    if (
      open &&
      (trigger.closest("[inert]") || !trigger.getClientRects().length)
    )
      hide();
  }).observe(trigger.closest("#sidebar"), { attributes: true });
}
