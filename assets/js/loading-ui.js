// Shared feedback only: callers retain their validation and persistence logic.
const activeButtons = new WeakMap();

export function startButtonLoading(button, label = "Menyimpan…", { indicator = "spinner" } = {}) {
  if (activeButtons.has(button)) return activeButtons.get(button);
  const nodes = [...button.childNodes];
  const previous = { disabled: button.disabled, busy: button.getAttribute("aria-busy"), label: button.getAttribute("aria-label") };
  const idle = document.createElement("span");
  idle.className = "button-loading-idle";
  idle.setAttribute("aria-hidden", "true");
  idle.append(...nodes);
  const feedback = document.createElement("span");
  feedback.className = "button-loading-feedback";
  feedback.setAttribute("aria-hidden", "true");
  const copy = document.createElement("span");
  copy.className = "button-loading-copy";
  if (indicator === "spinner") {
    const spinner = document.createElement("span");
    spinner.className = "button-loading-spinner";
    feedback.append(spinner);
  }
  feedback.append(copy);
  button.replaceChildren(idle, feedback);
  button.classList.add("is-button-loading");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  let ended = false;
  const controller = {
    update(message) {
      copy.textContent = message;
      button.setAttribute("aria-label", message);
      button.classList.remove("is-button-loading-compact");
      // Short buttons keep their original width; their accessible name still announces the action.
      const available = button.clientWidth - 16;
      const indicatorWidth = indicator === "spinner" ? 24 : 0;
      if (copy.scrollWidth + indicatorWidth > available) button.classList.add("is-button-loading-compact");
    },
    finish() {
      if (ended) return;
      ended = true;
      button.replaceChildren(...nodes);
      button.classList.remove("is-button-loading", "is-button-loading-compact");
      button.disabled = previous.disabled;
      for (const [name, value] of [["aria-busy", previous.busy], ["aria-label", previous.label]]) {
        if (value === null) button.removeAttribute(name); else button.setAttribute(name, value);
      }
      activeButtons.delete(button);
      button.dispatchEvent(new CustomEvent("clouven:button-ready", { bubbles: true }));
    },
  };
  activeButtons.set(button, controller);
  controller.update(label);
  return controller;
}

export async function withButtonLoading(button, action, label = "Menyimpan…") {
  if (!button || button.disabled || activeButtons.has(button)) return;
  const loading = startButtonLoading(button, label);
  try { return await action(); } finally { loading.finish(); }
}
