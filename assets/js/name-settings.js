import { startButtonLoading } from "./loading-ui.js";
import { can } from "./permissions.js";
import {
  NAME_STYLES,
  resolveNameCustomization,
  validateNameCustomization,
} from "./name-customization.js";
import { StyledName, getNameProfile } from "./styled-name.js";
import { refreshNameSync } from "./name-sync.js";
import { supabase } from "./supabase.js";

export function mountNameSettings(host, initial, onSaved = () => {}) {
  let member = initial,
    dirty = false,
    busy = false;
  host.className = "card form-card name-settings";
  host.innerHTML = `<h3>Custom Display Name</h3>
    <p class="muted">Pilih tampilan nama. Preview berubah langsung; tekan Simpan untuk menerapkannya.</p>
    <form><fieldset><legend class="sr-only">Pengaturan tampilan nama</legend>
      <div class="form-field"><label for="displayNameStyle">Style nama</label><select id="displayNameStyle" name="name_style"></select></div>
      <div class="form-grid" data-colors>
        <div class="form-field"><label for="nameColor1">Warna 1</label><input id="nameColor1" name="name_color_1" type="color"></div>
        <div class="form-field" data-second><label for="nameColor2">Warna 2</label><input id="nameColor2" name="name_color_2" type="color"></div>
        <div class="form-field" data-third><label class="choice-label"><input type="checkbox" id="useNameColor3"> Gunakan warna 3 (opsional)</label><label for="nameColor3">Warna 3</label><input id="nameColor3" name="name_color_3" type="color"></div>
      </div>
      <p class="form-help">Warna menyesuaikan mode terang dan gelap agar nama tetap terbaca. Preferensi kurangi gerakan akan menampilkan efek statis.</p>
      <div class="name-preview"><p class="muted" id="namePreviewLabel">Preview</p><output aria-labelledby="namePreviewLabel" aria-live="polite" data-name-preview></output></div>
      <div class="form-actions"><button type="submit" class="button button-coral">Simpan</button></div>
    </fieldset><p role="status" aria-live="polite" data-save-status></p></form>`;
  const form = host.querySelector("form"),
    fieldset = form.querySelector("fieldset"),
    style = form.elements.name_style;
  for (const value of NAME_STYLES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value[0].toUpperCase() + value.slice(1);
    style.append(option);
  }
  const third = host.querySelector("#useNameColor3"),
    status = host.querySelector("[data-save-status]"),
    button = host.querySelector('[type="submit"]');
  function config() {
    return {
      name_style: style.value,
      name_color_1: form.elements.name_color_1.value,
      name_color_2: form.elements.name_color_2.value,
      name_color_3: third.checked ? form.elements.name_color_3.value : null,
    };
  }
  function preview() {
    const multi = ["gradient", "flow", "prism", "shimmer"].includes(
      style.value,
    );
    host.querySelector("[data-colors]").hidden = style.value === "default";
    host.querySelector("[data-second]").hidden = !multi;
    host.querySelector("[data-third]").hidden = !multi;
    form.elements.name_color_3.disabled = !third.checked;
    host
      .querySelector("[data-name-preview]")
      .replaceChildren(
        StyledName({ ...member, ...config() }, { preview: true }),
      );
  }
  function update(value) {
    member = value;
    const allowed = can(member?.role, "customize_name");
    host.hidden = !allowed;
    fieldset.disabled = !allowed || busy;
    if (!allowed) {
      dirty = false;
      host.querySelector("[data-name-preview]").replaceChildren();
      return;
    }
    if (!dirty && !busy) {
      const saved = resolveNameCustomization(member);
      for (const key of ["name_style", "name_color_1", "name_color_2"])
        form.elements[key].value = saved[key];
      third.checked = saved.name_color_3 !== null;
      form.elements.name_color_3.value = saved.name_color_3 || "#F9A8D4";
    }
    preview();
  }
  form.addEventListener("input", () => {
    dirty = true;
    status.textContent = "Belum disimpan.";
    preview();
  });
  form.addEventListener("change", () => {
    dirty = true;
    status.textContent = "Belum disimpan.";
    preview();
  });
  document.addEventListener("clouven:name-profiles", () =>
    update(getNameProfile(initial?.id) || { ...member, role: "guest" }),
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !can(member?.role, "customize_name")) return;
    let loading;
    try {
      const settings = validateNameCustomization(config());
      busy = true;
      fieldset.disabled = true;
      loading = startButtonLoading(button);
      status.textContent = "";
      const { error } = await supabase.rpc("set_my_name_customization", {
        settings,
      });
      if (error) throw error;
      dirty = false;
      await refreshNameSync();
      onSaved();
      status.textContent = "Tampilan nama berhasil disimpan.";
    } catch (error) {
      status.textContent = ["PGRST202", "42883", "42703"].includes(error.code)
        ? "Pengaturan belum tersedia. Minta pengelola menerapkan migrasi display name."
        : error.message || "Tampilan nama belum tersimpan. Silakan coba lagi.";
    } finally {
      busy = false;
      loading?.finish();
      update(getNameProfile(initial?.id) || member);
    }
  });
  update(initial);
  return { update };
}
