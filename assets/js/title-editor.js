import { createTypewriter } from "./typewriter.js";
import { titleSettings, MAX_TITLE_VARIATIONS } from "./title-settings.js";
import { escapeHTML } from "./utils.js";

export function mountTitleEditor(form, profile) {
  const initial = titleSettings(profile.titleAnimation);

  // Prevent duplicate mounting on the same form.
  const existing = form.querySelector(".title-settings");
  if (existing) {
    return {
      read: () => titleSettings(profile.titleAnimation),
      destroy() {},
    };
  }

  const section = document.createElement("section");
  section.className = "title-settings";

  section.innerHTML = "...";

  const status = document.createElement("p");
  status.id = "profileSaveStatus";
  status.className = "notice error";
  status.hidden = true;
  status.setAttribute("role", "alert");

  const formActions = form.querySelector(".form-actions");

  if (formActions && formActions.parentNode === form) {
    form.insertBefore(section, formActions);
    form.insertBefore(status, formActions);
  } else {
    form.append(section, status);
  }

  // ...lanjutkan kode lama...
}

const status = document.createElement("p");
status.id = "profileSaveStatus";
status.className = "notice error";
status.hidden = true;
status.setAttribute("role", "alert");

const formActions = form.querySelector(".form-actions");

if (formActions && formActions.parentNode === form) {
  form.insertBefore(section, formActions);
  form.insertBefore(status, formActions);
} else {
  form.append(section, status);
}
const enabled = section.querySelector("#titleAnimationEnabled"),
  rows = section.querySelector("#titleVariationRows"),
  add = section.querySelector("#addTitleVariation");
enabled.checked = initial.enabled;
let preview = createTypewriter(section.querySelector("#titlePreview")),
  timer;
function read() {
  return titleSettings({
    enabled: enabled.checked,
    phrases: [...rows.children].map((row) => ({
      headline: row.querySelector("[data-title-headline]").value,
      emphasis: row.querySelector("[data-title-emphasis]").value,
    })),
  });
}
function refreshPreview() {
  clearTimeout(timer);
  preview.setText(
    form.elements.headline.value,
    form.elements.emphasis.value,
    read(),
  );
}
function numberRows() {
  [...rows.children].forEach((row, i) => {
    row.querySelector("legend").textContent = "Variasi " + (i + 1);
    row
      .querySelector("[data-remove-title]")
      .setAttribute("aria-label", "Hapus variasi " + (i + 1));
  });
  add.disabled = rows.children.length >= MAX_TITLE_VARIATIONS;
}
function appendRow(value = { headline: "", emphasis: "" }) {
  if (rows.children.length >= MAX_TITLE_VARIATIONS) return;
  const id = crypto.randomUUID(),
    row = document.createElement("fieldset");
  row.className = "title-variation";
  row.innerHTML =
    '<legend>Variasi</legend><div class="form-grid"><div class="form-field"><label for="headline-' +
    id +
    '">Teks utama</label><input id="headline-' +
    id +
    '" data-title-headline maxlength="120" value="' +
    escapeHTML(value.headline) +
    '" placeholder="Belajar bersama,"></div><div class="form-field"><label for="emphasis-' +
    id +
    '">Kata sorot</label><input id="emphasis-' +
    id +
    '" data-title-emphasis maxlength="80" value="' +
    escapeHTML(value.emphasis) +
    '" placeholder="tumbuh bersama."></div></div><button class="mini-action danger-action" type="button" data-remove-title>Hapus variasi</button>';
  rows.append(row);
  numberRows();
  return row;
}
initial.phrases.forEach(appendRow);
function onInput(event) {
  if (
    section.contains(event.target) ||
    ["headline", "emphasis"].includes(event.target.name)
  ) {
    clearTimeout(timer);
    timer = setTimeout(refreshPreview, 180);
  }
}
function onClick(event) {
  if (event.target.closest("#addTitleVariation")) {
    appendRow()?.querySelector("input").focus();
    refreshPreview();
  }
  const remove = event.target.closest("[data-remove-title]");
  if (remove) {
    const row = remove.closest(".title-variation"),
      next = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    numberRows();
    (next?.querySelector("input") || add).focus();
    refreshPreview();
  }
  if (event.target.closest("#restartTitlePreview")) {
    preview.destroy();
    preview = createTypewriter(section.querySelector("#titlePreview"));
    refreshPreview();
  }
}
form.addEventListener("input", onInput);
section.addEventListener("click", onClick);
refreshPreview();
return {
  read,
  destroy() {
    clearTimeout(timer);
    preview.destroy();
    form.removeEventListener("input", onInput);
    section.removeEventListener("click", onClick);
  },
};
