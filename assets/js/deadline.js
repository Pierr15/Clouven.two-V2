// Class date-only deadlines are inclusive through 23:59 in Asia/Jakarta.
export function deadlineInstant(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year,month,day] = value.split("-").map(Number);
    const check=new Date(Date.UTC(year,month-1,day));
    if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)return null;
    return new Date(`${value}T23:59:59+07:00`);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDayDiff(date, now) {
  const a = Date.UTC(date.getFullYear(),date.getMonth(),date.getDate());
  const b = Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  return Math.round((a-b)/86400000);
}
function jakartaDayDiff(value, now) {
  const formatter=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"});
  const parts=Object.fromEntries(formatter.formatToParts(now).filter(x=>x.type!=="literal").map(x=>[x.type,Number(x.value)]));
  const [year,month,day]=value.split("-").map(Number);
  return Math.round((Date.UTC(year,month-1,day)-Date.UTC(parts.year,parts.month-1,parts.day))/86400000);
}

export function deadlineLabel(value, {now = new Date(), done = false} = {}) {
  if (done) return "Selesai";
  const due = deadlineInstant(value);
  if (!due) return "Belum ada tenggat";
  const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(value);
  const days = dateOnly?jakartaDayDiff(value,now):localDayDiff(due,now);
  const remaining = due.getTime()-now.getTime();
  if (remaining <= 0) {
    const lateDays = Math.max(1,Math.ceil(-remaining/86400000));
    return lateDays === 1 ? "Terlambat" : `Terlambat ${lateDays} hari`;
  }
  if (!dateOnly && remaining < 86400000) {
    if (remaining >= 3600000) return `${Math.ceil(remaining/3600000)} jam lagi`;
    return `${Math.max(1,Math.ceil(remaining/60000))} menit lagi`;
  }
  if (days > 1) return `${days} hari lagi`;
  if (days === 1) return "Besok";
  if (dateOnly) return "Berakhir hari ini";
  if (remaining >= 3600000) return `${Math.ceil(remaining/3600000)} jam lagi`;
  return `${Math.max(1,Math.ceil(remaining/60000))} menit lagi`;
}

export function refreshDeadlineLabels(root = document, doneById = {}) {
  root.querySelectorAll("[data-deadline]").forEach(el => {
    el.textContent = deadlineLabel(el.dataset.deadline, {done: Boolean(doneById[el.dataset.taskId])});
  });
}

export function startDeadlineClock(root = document, doneById = () => ({})) {
  const refresh = () => refreshDeadlineLabels(root,doneById());
  refresh();
  const timer = setInterval(refresh,60000);
  addEventListener("pageshow",refresh);
  return () => {clearInterval(timer);removeEventListener("pageshow",refresh);};
}
