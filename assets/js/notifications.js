import {supabase} from "./supabase.js";
import {escapeHTML,showToast} from "./utils.js";
import {deadlineLabel,refreshDeadlineLabels} from "./deadline.js";

const safeUrl = value => /^\/(tugas|kalender|jadwal)\/(\?(?:task|event)=[a-zA-Z0-9-]+)?$/.test(value || "") ? value : "/";
const types = {assignment_new:"Tugas baru",assignment_due:"Tenggat tugas",calendar_new:"Kegiatan baru",calendar_reminder:"Pengingat kegiatan",schedule_change:"Perubahan jadwal"};

export function browserPermission() {
  if (!("Notification" in window) || !window.isSecureContext) return "unsupported";
  return Notification.permission;
}
const browserKey=uid=>`clouven-browser-notifications-${uid}`;
export function browserEnabled(uid) {
  try {return Boolean(uid)&&localStorage.getItem(browserKey(uid)) === "on" && browserPermission() === "granted";} catch {return false;}
}
export async function setBrowserEnabled(uid,enabled) {
  if (!enabled) {localStorage.setItem(browserKey(uid),"off");return browserPermission();}
  const state=browserPermission();
  if (state === "unsupported" || state === "denied") return state;
  const permission = state === "granted" ? state : await Notification.requestPermission();
  if (permission === "granted") localStorage.setItem(browserKey(uid),"on");
  return permission;
}
function notifyBrowser(row,uid) {
  if (!browserEnabled(uid) || document.visibilityState === "visible") return;
  try {
    const notification = new Notification(row.title,{body:row.message,tag:row.dedupe_key,icon:"/assets/images/favicon.svg"});
    notification.onclick=()=>{window.focus();location.href=safeUrl(row.target_url);};
  } catch (error) {console.warn("Browser notification unavailable",error);}
}
export async function readPreferences(uid) {
  const {data,error}=await supabase.from("notification_preferences").select("assignment_reminders,calendar_reminders").eq("user_id",uid).maybeSingle();
  if(error)throw error;
  return data ? {...data,exists:true} : {assignment_reminders:true,calendar_reminders:true,exists:false};
}
export async function savePreferences(uid,values) {
  const payload={assignment_reminders:values.assignment_reminders,calendar_reminders:values.calendar_reminders};
  const {error}=values.exists
    ? await supabase.from("notification_preferences").update(payload).eq("user_id",uid)
    : await supabase.from("notification_preferences").insert({user_id:uid,...payload});
  if(error)throw error;
}

export function mountNotificationCenter(host,uid) {
  if (!host || !uid) return () => {};
  host.innerHTML=`<button class="notification-bell" type="button" aria-label="Buka notifikasi" aria-expanded="false"><i class="ti ti-bell" aria-hidden="true"></i><span class="notification-count" hidden></span></button><section class="notification-panel" hidden aria-label="Pusat notifikasi"><div class="notification-heading"><strong>Notifikasi</strong><button type="button" data-read-all> Tandai semua dibaca</button></div><div class="notification-list" role="status">Memuat notifikasi…</div></section>`;
  const bell=host.querySelector(".notification-bell"), panel=host.querySelector(".notification-panel"), list=host.querySelector(".notification-list"), count=host.querySelector(".notification-count");
  let rows=[],unreadCount=0,taskDue={};
  function paint(){
    const unread=unreadCount;
    count.hidden=!unread;count.textContent=unread>99?"99+":String(unread);
    bell.setAttribute("aria-label",unread?`Buka notifikasi, ${unread} belum dibaca`:"Buka notifikasi");
    list.innerHTML=rows.length?rows.map(row=>`<a class="notification-item ${row.read_at?"":"is-unread"}" href="${safeUrl(row.target_url)}" data-notification-id="${escapeHTML(row.id)}"><span class="notification-type">${types[row.type]||"Info kelas"}</span><strong>${escapeHTML(row.title)}</strong><span>${escapeHTML(row.message)}</span>${taskDue[row.related_id]?`<span class="deadline-label" data-deadline="${escapeHTML(taskDue[row.related_id])}">${deadlineLabel(taskDue[row.related_id])}</span>`:""}<small>${new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(row.created_at))}</small></a>`).join(""):'<div class="empty-state"><strong>Belum ada notifikasi.</strong>Kabar kelas akan tampil di sini.</div>';
  }
  async function refresh(){
    try {
      const [items,total]=await Promise.all([
        supabase.from("notifications").select("id,type,title,message,related_id,target_url,created_at,read_at,dedupe_key").eq("user_id",uid).order("created_at",{ascending:false}).limit(60),
        supabase.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",uid).is("read_at",null)
      ]);
      if(items.error||total.error)throw items.error||total.error;
      rows=items.data||[];unreadCount=total.count||0;
      const ids=[...new Set(rows.filter(row=>row.type.startsWith("assignment_")).map(row=>row.related_id).filter(Boolean))];
      if(ids.length){const due=await supabase.from("task_summaries").select("id,due,due_at").in("id",ids);if(due.error)throw due.error;taskDue=Object.fromEntries((due.data||[]).map(row=>[row.id,row.due_at||row.due]));}
      paint();
    }
    catch(error){list.innerHTML='<div class="data-state is-error">Notifikasi gagal dimuat. <button type="button" data-retry-notifications>Coba lagi</button></div>';console.error(error);}
  }
  bell.addEventListener("click",()=>{panel.hidden=!panel.hidden;bell.setAttribute("aria-expanded",String(!panel.hidden));if(!panel.hidden)refresh();});
  host.addEventListener("click",async event=>{
    if(event.target.closest("[data-retry-notifications]")) return refresh();
    const all=event.target.closest("[data-read-all]");
    const link=event.target.closest("[data-notification-id]");
    if(!all&&!link)return;
    if(link)event.preventDefault();
    const query=supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",uid).is("read_at",null);
    const {error}=await (all?query:query.eq("id",link.dataset.notificationId));
    if(error){if(link)event.preventDefault();showToast("Gagal menandai notifikasi: "+error.message);return;}
    if(all){rows=rows.map(row=>({...row,read_at:row.read_at||new Date().toISOString()}));unreadCount=0;paint();}
    if(link)unreadCount=Math.max(0,unreadCount-1);
    if(link)location.href=safeUrl(link.getAttribute("href"));
  });
  const onOutside=event=>{if(!host.contains(event.target)){panel.hidden=true;bell.setAttribute("aria-expanded","false");}};
  const onKey=event=>{if(event.key==="Escape"&&!panel.hidden){panel.hidden=true;bell.setAttribute("aria-expanded","false");bell.focus();}};
  document.addEventListener("click",onOutside);document.addEventListener("keydown",onKey);
  const channel=supabase.channel(`notifications-${uid}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:`user_id=eq.${uid}`},payload=>{notifyBrowser(payload.new,uid);refresh();}).subscribe();
  const clock=setInterval(()=>{if(!panel.hidden)refreshDeadlineLabels(panel);},60000);
  refresh();
  return ()=>{clearInterval(clock);document.removeEventListener("click",onOutside);document.removeEventListener("keydown",onKey);supabase.removeChannel(channel);};
}
