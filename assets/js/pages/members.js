import { styledName } from "../styled-name.js";
import {instagramUrl} from "../instagram.js";
import {editInstagram,editBiodata} from "../dialogs.js";
import { createLoadState, showLoadState } from "../load-state.js";
import { requireAuth } from "../auth.js";
import { bootShell } from "../bootstrap.js";
import { subscribeMembers } from "../data.js?v=member-sort-1";
import { escapeHTML, initials, openModal } from "../utils.js";

const session = await requireAuth(); if(!session) throw new Error("redirect");
await bootShell("members");
let members=[];
const listState = createLoadState("members", "Daftar anggota", render);
function avatar(member){return member.photo || `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 250"><rect width="300" height="250" fill="#d8e5d1"/><circle cx="150" cy="105" r="52" fill="#f3c69f"/><path d="M70 250q15-92 80-92t80 92" fill="#284b3d"/><text x="150" y="225" text-anchor="middle" fill="#fff" font-family="Arial" font-size="30" font-weight="700">${escapeHTML(initials(member.name))}</text></svg>`)}`;}
function memberCard(m) { return `<button class="member-card" data-member="${m.id}"><span class="member-photo"><img src="${escapeHTML(avatar(m))}" alt="Foto ${escapeHTML(m.name)}"></span><span class="member-card-copy"><h3>${m.number ? `<span class="member-number">${escapeHTML(m.number)} · </span>` : ""}${styledName(m)}</h3><p>${escapeHTML(m.roleLabel || m.classRole || "Anggota")}</p>${m.instagram?`<span class="member-instagram"><i class="ti ti-brand-instagram" aria-hidden="true"></i> @${escapeHTML(m.instagram)}</span>`:""}</span></button>`; }
function isHomeroomTeacher(member) {
  return String(member.classRole || "").replace(/\s+/g, "").toLowerCase() === "walikelas";
}
function render() {
  const grid = document.querySelector("#memberGrid");
  const homeroom = document.querySelector("#homeroomCard");
  if (showLoadState(grid, listState)) {
    homeroom.hidden = true;
    homeroom.replaceChildren();
    return;
  }
  const teachers = members.filter(isHomeroomTeacher);
  const classmates = members.filter(member => !isHomeroomTeacher(member));
  homeroom.innerHTML = teachers.map(memberCard).join("");
  homeroom.hidden = teachers.length === 0;
  grid.innerHTML = classmates.length ? classmates.map(memberCard).join("") :
    '<div class="empty-state"><strong>Belum ada anggota.</strong>Daftar akan muncul setelah Developer membuat akun.</div>';
}

document.querySelector(".page-section").addEventListener("click",(event)=>{const b=event.target.closest("[data-member]");if(!b)return;const m=members.find(x=>x.id===b.dataset.member);if(!m)return;const wrap=document.createElement("div");wrap.className="modal-backdrop";wrap.innerHTML=`<div class="modal"><div class="modal-head"><div><p class="eyebrow">anggota kelas</p><h2>${styledName(m)}</h2></div><button class="icon-button" data-close>×</button></div><p class="muted">${escapeHTML(m.classRole || "Anggota")} · ${escapeHTML(m.role || "student")}</p><div class="grid grid-2"><div class="card form-card"><strong>Nomor absen</strong><p class="muted">${escapeHTML(m.number || "—")}</p></div><div class="card form-card"><strong>Username / NIS</strong><p class="muted">${escapeHTML(m.username || "—")}</p></div></div>${m.instagram?`<p class="member-instagram"><a href="${escapeHTML(instagramUrl(m.instagram))}" target="_blank" rel="noopener noreferrer"><i class="ti ti-brand-instagram" aria-hidden="true"></i> @${escapeHTML(m.instagram)}</a></p>`:""}${m.id===session.user.id||session.role==="developer"?`<button class="button button-light" type="button" data-edit-instagram>Edit Instagram</button>`:""}${m.quote?`<p style="margin-top:18px;font-family:var(--font-serif);font-style:italic">“${escapeHTML(m.quote)}”</p>`:""}</div>`;const close=openModal(wrap, b);wrap.querySelector("[data-edit-instagram]")?.addEventListener("click",()=>{close();if(m.id===session.user.id)editInstagram(m,{trigger:b,onSaved:()=>listState.retry?.()});else editBiodata(m,{trigger:b,onSaved:()=>listState.retry?.()});});});
subscribeMembers(v=>{members=v;}, listState.update);
