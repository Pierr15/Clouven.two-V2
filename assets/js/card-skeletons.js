const shape = (kind) => `<span class="loading-shape ${kind}"></span>`;
export function cardSkeletonMarkup(type) {
  const member = type === "members";
  const card = member
    ? `<div class="member-card loading-card" aria-hidden="true"><span class="member-photo loading-shape"></span><span class="member-card-copy"><h3>${shape("loading-name")}</h3><p>${shape("loading-role")}</p><span class="member-instagram">${shape("loading-social")}</span></span></div>`
    : `<article class="task-card loading-card" aria-hidden="true"><div class="task-card-head">${shape("loading-subject")}${shape("loading-badge")}</div><h3>${shape("loading-title")}${shape("loading-title-short")}</h3><p class="task-description">${shape("loading-description")}${shape("loading-description-short")}</p><div class="task-footer">${shape("loading-date")}${shape("loading-action")}</div></article>`;
  return `<span class="loading-status is-loading" role="status" aria-live="polite">${member ? "Daftar anggota" : "Daftar tugas"} sedang dimuat…</span>` + card.repeat(member ? 8 : 6);
}
