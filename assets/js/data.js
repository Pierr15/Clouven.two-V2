import { supabase } from "./supabase.js";
import { publishNameProfiles } from "./styled-name.js";
import { readWithTimeout } from "./load-state.js";

export const DEFAULT_PROFILE = {
  className: "XI TKJ 2",
  school: "SMK Negeri 1 Adiwerna",
  schoolYear: "2026 / 2027",
  advisor: "Wali kelas",
  leader: "Ketua kelas",
  headline: "Semangat, berjuang,",
  emphasis: "sukses.",
  description: "Satu tempat untuk tetap searah, dari jadwal pelajaran, tugas, sampai cerita kecil setiap anggota kelas.",
  photoCaption: "XI TKJ 2 · 2026/27",
  classPhoto: "/assets/images/class-placeholder.svg",
};

function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}

function subscribeTable(table, fetcher, callback, filter = null, onState = () => {}) {
  let disposed = false, hasData = false, running = false, queued = false;
  const refresh = async () => {
    if (disposed) return;
    if (running) { queued = true; return; }
    running = true;
    onState({status: "loading", hasData, retry: refresh});
    try {
      const value = await readWithTimeout(fetcher);
      if (disposed) return;
      callback(value);
      hasData = true;
      onState({status: "ready", hasData, retry: refresh});
    } catch (error) {
      if (!disposed) {
        console.error(`Gagal membaca ${table}`, error);
        onState({status: "error", hasData, retry: refresh});
      }
    } finally {
      running = false;
      if (queued && !disposed) { queued = false; refresh(); }
    }
  };
  const config = { event: "*", schema: "public", table };
  if (filter) config.filter = filter;
  const channel = supabase
    .channel(`clouven-${table}-${crypto.randomUUID()}`)
    .on("postgres_changes", config, refresh)
    .subscribe();
  refresh();
  const unsubscribe = () => {
    disposed = true;
    supabase.removeChannel(channel);
  };
  unsubscribe.retry = refresh;
  return unsubscribe;
}

export function subscribeProfile(callback, onState) {
  return subscribeTable("class_profile", async () => {
    const row = unwrap(await supabase.from("class_profile").select("data").eq("id", "main").maybeSingle());
    return { ...DEFAULT_PROFILE, ...(row?.data || {}) };
  }, callback, "id=eq.main", onState);
}

export async function saveProfile(payload) {
  unwrap(await supabase.from("class_profile").upsert({
    id: "main",
    data: payload,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" }));
}

export function normalizeScheduleBlocks(row = {}) {
  return {
    ...row,
    lessons: (Array.isArray(row.lessons) ? row.lessons : []).map(lesson => ({
      ...lesson,
      block: lesson?.block === "B" ? "B" : "A",
    })),
    piket: Array.isArray(row.piket) ? row.piket : [],
  };
}

export function subscribeSchedule(day, callback, onState) {
  return subscribeTable("schedules", async () => {
    const row = unwrap(await supabase.from("schedules").select("lessons,piket").eq("day", day).maybeSingle());
    return normalizeScheduleBlocks(row || { lessons: [], piket: [] });
  }, callback, `day=eq.${day}`, onState);
}

export async function saveSchedule(day, data) {
  const normalized = normalizeScheduleBlocks(data);
  unwrap(await supabase.from("schedules").upsert({
    day,
    lessons: normalized.lessons,
    piket: normalized.piket,
    updated_at: new Date().toISOString(),
  }, { onConflict: "day" }));
}

export function subscribeApelQueue(callback, onState) {
  return subscribeTable("apel_queue", async () => {
    const rows = unwrap(await supabase.from("apel_queue").select("id,name,member_id,position").order("position"));
    return (rows || []).map((row) => ({ id: row.id, name: row.name, memberId: row.member_id || "", order: row.position }));
  }, callback, null, onState);
}

export async function saveApelQueue(items) {
  const rows = items.map((item, position) => ({
    id: item.id || crypto.randomUUID(),
    name: item.name,
    member_id: item.memberId || null,
    position,
    updated_at: new Date().toISOString(),
  }));
  const existing = unwrap(await supabase.from("apel_queue").select("id")) || [];
  const keep = new Set(rows.map((row) => row.id));
  const remove = existing.map((row) => row.id).filter((id) => !keep.has(id));
  if (remove.length) unwrap(await supabase.from("apel_queue").delete().in("id", remove));
  if (rows.length) unwrap(await supabase.from("apel_queue").upsert(rows, { onConflict: "id" }));
}


export function subscribeTaskSummaries(callback, onState) {
  return subscribeTable("task_summaries", async () => {
    return unwrap(await supabase.from("task_summaries").select("*").order("due", { ascending: true, nullsFirst: false })) || [];
  }, callback, null, onState);
}

export function subscribeTasks(callback, onState) {
  return subscribeTable("tasks", async () => {
    return unwrap(await supabase.from("tasks").select("*").order("due", { ascending: true, nullsFirst: false })) || [];
  }, callback, null, onState);
}

export function subscribeProgress(uid, callback, onState) {
  return subscribeTable("task_progress", async () => {
    const rows = unwrap(await supabase.from("task_progress").select("task_id,done,updated_at").eq("user_id", uid)) || [];
    return Object.fromEntries(rows.map((row) => [row.task_id, {
      uid,
      taskId: row.task_id,
      done: row.done,
      updatedAt: row.updated_at,
    }]));
  }, callback, `user_id=eq.${uid}`, onState);
}

export async function setTaskProgress(uid, taskId, done) {
  unwrap(await supabase.from("task_progress").upsert({
    user_id: uid,
    task_id: taskId,
    done: Boolean(done),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,task_id" }));
}

export async function saveTask(task) {
  const id = task.id || crypto.randomUUID();
  const { id: _ignored, ...payload } = task;
  unwrap(await supabase.from("tasks").upsert({
    id,
    ...payload,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" }));
  return id;
}

export async function deleteTask(id) {
  const rows = unwrap(await supabase.from("tasks").delete().eq("id", id).select("id"));
  if (!rows?.some(row => row.id === id)) throw new Error("Tugas tidak dapat dihapus. Tugas mungkin sudah dihapus atau akses Anda telah berubah. Muat ulang daftar untuk memastikan.");
}

export async function listCalendarEvents(from, until) {
  const {data,error}=await supabase.from("calendar_events").select("*").lt("start_at",until).gt("end_at",from).order("start_at");
  if(error)throw error;
  return data||[];
}
export async function getCalendarEvent(id) {
  const {data,error}=await supabase.from("calendar_events").select("*").eq("id",id).maybeSingle();
  if(error)throw error;
  return data;
}

export async function saveCalendarEvent(payload) {
  const {id,...values}=payload;
  const query=id?supabase.from("calendar_events").update(values).eq("id",id).select("id").single():supabase.from("calendar_events").insert(values).select("id").single();
  const {data,error}=await query;
  if(error)throw error;
  return data.id;
}

export async function deleteCalendarEvent(id) {
  const {data,error}=await supabase.from("calendar_events").delete().eq("id",id).select("id");
  if(error)throw error;
  if(!data?.length)throw new Error("Kegiatan tidak dapat dihapus.");
}

function normalizeMember(row) {
  return row ? {
    ...row,
    classRole: row.class_role || "Anggota",
    roleLabel: row.role_label || "",
  } : null;
}

function memberNumberValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const exact = Number(text);
  if (Number.isFinite(exact)) return exact;
  const fallback = parseInt(text, 10);
  return Number.isFinite(fallback) ? fallback : null;
}

// Decorate a new array so Supabase's text ordering and the fetched rows remain untouched.
export function sortMembersByNumber(rows = []) {
  return rows.map((row, index) => ({ row, index, number: memberNumberValue(row?.number) }))
    .sort((a, b) => {
      if (a.number === null && b.number === null) return a.index - b.index;
      if (a.number === null) return 1;
      if (b.number === null) return -1;
      return a.number - b.number || a.index - b.index;
    })
    .map(({ row }) => row);
}

export function subscribeMembers(callback, onState) {
  return subscribeTable("members", async () => {
    const rows = unwrap(await supabase.from("members").select("*").order("number", { ascending: true, nullsFirst: false })) || [];
    const members = sortMembersByNumber(rows).map(normalizeMember);
    publishNameProfiles(members, {replace:true});
    return members;
  }, callback, null, onState);
}

export function subscribeMember(uid, callback, onState) {
  return subscribeTable("members", async () => {
    const row = unwrap(await supabase.from("members").select("*").eq("id", uid).maybeSingle());
    const member = normalizeMember(row);
    if (member) publishNameProfiles([member]);
    else publishNameProfiles([{id:uid,role:'guest'}]);
    return member;
  }, callback, `id=eq.${uid}`, onState);
}

export async function saveMember(id, payload) {
  const row = {
    id,
    ...payload,
    class_role: payload.classRole ?? payload.class_role ?? "Anggota",
    updated_at: new Date().toISOString(),
  };
  delete row.classRole;
  unwrap(await supabase.from("members").upsert(row, { onConflict: "id" }));
}

function normalizeResource(row) {
  return row ? {
    ...row,
    driveFileId: row.drive_file_id,
    mimeType: row.mime_type,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    createdAt: row.created_at,
  } : null;
}

export function subscribeResources(callback, onState) {
  return subscribeTable("resources", async () => {
    const rows = unwrap(await supabase.from("resources").select("*").order("created_at", { ascending: false })) || [];
    return rows.map(normalizeResource);
  }, callback, null, onState);
}

export async function saveResource(payload) {
  const { data: authData } = await supabase.auth.getSession();
  const userId = payload.uploadedBy || authData.session?.user?.id || null;
  const result = await supabase.from("resources").insert({
    drive_file_id: payload.driveFileId,
    name: payload.name,
    mime_type: payload.mimeType || "application/octet-stream",
    size: Number(payload.size) || 0,
    subject: payload.subject || "Umum",
    kind: payload.kind === "tugas" ? "tugas" : "materi",
    uploaded_by: userId,
    uploaded_by_name: payload.uploadedByName || "Pengguna",
  });
  // A prior attempt may have committed even if its response was interrupted.
  // The existing unique Drive ID prevents duplicate list entries on retry.
  if (result.error?.code === "23505") {
    const existing = unwrap(await supabase.from("resources")
      .select("id,uploaded_by").eq("drive_file_id", payload.driveFileId).maybeSingle());
    if (existing && existing.uploaded_by === userId) return;
  }
  unwrap(result);
}

export function subscribeAllProgress(callback, onState) {
  return subscribeTable("task_progress", async () => {
    return unwrap(await supabase.from("task_progress").select("user_id,task_id,done,updated_at")) || [];
  }, callback, null, onState);
}
