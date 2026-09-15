import { cardSkeletonMarkup } from "./card-skeletons.js";
import { escapeHTML } from "./utils.js";

const states = new Map();
export const READ_TIMEOUT = 15000;

export async function readWithTimeout(read) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(read),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Waktu pemuatan habis.")),
          READ_TIMEOUT,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createLoadState(key, label, render) {
  const state = { key, label, status: "loading", hasData: false, retry: null };
  state.update = (event) => {
    if (event.status === "loading" && state.status === "error")
      event = { ...event, hasData: false };
    Object.assign(state, event);
    // Keep existing content steady while a background refresh is in flight.
    if (!(event.status === "loading" && event.hasData)) render();
  };
  states.set(key, state);
  return state;
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-load-retry]");
  if (!button || button.disabled) return;
  const state = states.get(button.dataset.loadRetry);
  if (state?.retry) {
    button.disabled = true;
    state.retry();
  }
});

export function loadStateMarkup(...items) {
  const pending = items.filter(
    (s) => s.status !== "ready" && !(s.status === "loading" && s.hasData),
  );
  if (!pending.length) return "";
  const failures = pending.filter((s) => s.status === "error");
  return (failures.length ? failures : pending.slice(0, 1))
    .map((s) => {
      const failed = s.status === "error";
      return `<div class="data-state ${failed ? "is-error" : "is-loading"}" role="status" aria-live="polite" aria-atomic="true">
      <span class="data-state-symbol" aria-hidden="true">${failed ? '<i class="ti ti-cloud-off"></i>' : '<span class="three-dot-wave"><i></i><i></i><i></i></span>'}</span>
      <div class="data-state-copy"><strong>${escapeHTML(s.label)} ${failed ? "gagal dimuat" : "sedang dimuat…"}</strong>
      <p>${failed ? escapeHTML(s.errorMessage || "Periksa koneksi internet, lalu coba lagi.") : "Sebentar, kami sedang mengambil data terbaru."}</p></div>
      ${failed ? `<button type="button" class="button button-light button-small" data-load-retry="${escapeHTML(s.key)}">Coba lagi</button>` : ""}
    </div>`;
    })
    .join("");
}

export function showLoadState(host, ...items) {
  const baseMarkup = loadStateMarkup(...items);
  const type = host.dataset.skeleton;
  const markup = baseMarkup && ["members", "tasks"].includes(type) && !items.some(s => s.status === "error")
    ? cardSkeletonMarkup(type) : baseMarkup;
  host.setAttribute(
    "aria-busy",
    String(items.some((s) => s.status === "loading" && !s.hasData)),
  );
  if (!markup) return false;
  const hadFocus = host.contains(document.activeElement);
  if (host.innerHTML !== markup) host.innerHTML = markup;
  if (hadFocus) {
    host.tabIndex = -1;
    host.focus({ preventScroll: true });
  }
  return true;
}

// Keep initialization recoverable when session/profile requests fail.
export async function loadAccount(
  read,
  label = "Informasi akun",
  errorMessage = "",
) {
  let host;
  let guardedForm, formWasInert;
  const ensureHost = () => {
    if (host) return host;
    host = document.createElement("div");
    host.className = "account-load-state";
    (document.querySelector(".app-main, .login-card") || document.body).prepend(
      host,
    );
    guardedForm = document.querySelector("#loginForm");
    if (guardedForm) {
      formWasInert = guardedForm.inert;
      guardedForm.inert = true;
    }
    return host;
  };
  const state = createLoadState("account", label, () =>
    showLoadState(ensureHost(), state),
  );
  state.errorMessage = errorMessage;
  try {
    for (;;) {
      const loadingTimer = setTimeout(
        () => state.update({ status: "loading", hasData: false }),
        180,
      );
      try {
        return await readWithTimeout(read);
      } catch {
        clearTimeout(loadingTimer);
        await new Promise((resolve) =>
          state.update({ status: "error", retry: resolve }),
        );
        state.update({ status: "loading", hasData: false });
      } finally {
        clearTimeout(loadingTimer);
      }
    }
  } finally {
    host?.remove();
    if (guardedForm) guardedForm.inert = formWasInert;
    states.delete("account");
  }
}
