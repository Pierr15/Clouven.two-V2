import { cert, initializeApp } from "firebase-admin/app";
import { getAuth as getFirebaseAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";

function need(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} belum diatur.`);
  return value;
}

const firebaseApp = initializeApp({
  credential: cert({
    projectId: need("FIREBASE_PROJECT_ID"),
    clientEmail: need("FIREBASE_CLIENT_EMAIL"),
    privateKey: need("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  }),
});
const firestore = getFirestore(firebaseApp);
const firebaseAuth = getFirebaseAuth(firebaseApp);
const supabase = createClient(
  need("SUPABASE_URL"),
  process.env.SUPABASE_SECRET_KEY || need("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const defaultPassword = process.env.MIGRATION_DEFAULT_PASSWORD || "";
const uidMap = new Map();
const syntheticDomain = "@clouven.local";

async function upsert(table, rows, onConflict = "id") {
  if (!rows?.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`✓ ${table}: ${rows.length} row`);
}

async function migrateAuthAndMembers() {
  if (!defaultPassword) {
    console.warn("! MIGRATION_DEFAULT_PASSWORD kosong. Auth users, members, task_progress, dan uploader mapping dilewati.");
    return;
  }
  if (defaultPassword.length < 6) throw new Error("MIGRATION_DEFAULT_PASSWORD minimal 6 karakter.");

  let pageToken;
  do {
    const page = await firebaseAuth.listUsers(1000, pageToken);
    for (const oldUser of page.users) {
      const email = oldUser.email || "";
      if (!email.endsWith(syntheticDomain)) continue;
      const username = email.slice(0, -syntheticDomain.length);
      const oldMember = await firestore.collection("members").doc(oldUser.uid).get();
      const member = oldMember.exists ? oldMember.data() : {};

      let newUser = null;
      const { data: existing } = await supabase.from("members").select("id").eq("username", username).maybeSingle();
      if (existing?.id) {
        const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
          password: defaultPassword,
          user_metadata: { name: member.name || oldUser.displayName || username, username },
        });
        if (error) throw error;
        newUser = data.user;
      } else {
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password: defaultPassword,
          email_confirm: true,
          user_metadata: { name: member.name || oldUser.displayName || username, username },
        });
        if (error) throw error;
        newUser = data.user;
      }
      uidMap.set(oldUser.uid, newUser.id);
      await upsert("members", [{
        id: newUser.id,
        name: member.name || oldUser.displayName || username,
        username,
        number: String(member.number || ""),
        role: ["student","class_officer","teacher","developer"].includes(member.role) ? member.role : "student",
        class_role: member.classRole || member.class_role || "Anggota",
        role_label: member.roleLabel || member.role_label || "",
        phone: member.phone || "",
        email: member.email || "",
        quote: member.quote || "",
        photo: member.photo || "",
        legacy_firebase_uid: oldUser.uid,
        updated_at: new Date().toISOString(),
      }]);
    }
    pageToken = page.pageToken;
  } while (pageToken);
}

async function migrateData() {
  // Mendukung dua bentuk sumber:
  // 1) v2 Firebase: collection terpisah (classData/schedules/tasks/apelQueue).
  // 2) website lama: satu dokumen besar kelas/data.
  const legacySnap = await firestore.collection("kelas").doc("data").get();
  const legacy = legacySnap.exists ? legacySnap.data() : null;

  const profile = await firestore.collection("classData").doc("profile").get();
  const profileData = profile.exists ? profile.data() : legacy?.profile;
  if (profileData) await upsert("class_profile", [{ id: "main", data: profileData, updated_at: new Date().toISOString() }]);

  const scheduleSnap = await firestore.collection("schedules").get();
  let scheduleRows = scheduleSnap.docs.map((doc) => ({
    day: doc.id,
    lessons: doc.data().lessons || [],
    piket: doc.data().piket || [],
    updated_at: new Date().toISOString(),
  }));
  if (!scheduleRows.length && legacy?.schedules?.lesson) {
    scheduleRows = ["monday","tuesday","wednesday","thursday","friday"].map((day) => ({
      day,
      lessons: legacy.schedules.lesson?.[day] || [],
      piket: legacy.schedules.piket?.[day] || [],
      updated_at: new Date().toISOString(),
    }));
  }
  await upsert("schedules", scheduleRows, "day");

  const apelSnap = await firestore.collection("apelQueue").orderBy("order").get();
  let apelRows = apelSnap.docs.map((doc, position) => ({
    id: doc.id,
    name: doc.data().name || "Belum ditentukan",
    member_id: uidMap.get(doc.data().memberId) || null,
    position,
    updated_at: new Date().toISOString(),
  }));
  if (!apelRows.length && legacy?.schedules?.apel) {
    const names = ["monday","tuesday","wednesday","thursday","friday"]
      .map((day) => legacy.schedules.apel?.[day]?.leader)
      .filter(Boolean);
    apelRows = [...new Set(names)].map((name, position) => ({
      id: `legacy-apel-${position + 1}`, name: String(name), member_id: null, position, updated_at: new Date().toISOString(),
    }));
  }
  await upsert("apel_queue", apelRows);

  const taskSnap = await firestore.collection("tasks").get();
  const sourceTasks = taskSnap.docs.length
    ? taskSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    : (legacy?.tasks || []).map((task, index) => ({ id: String(task.id || `legacy-task-${index + 1}`), ...task }));
  await upsert("tasks", sourceTasks.map((x) => ({
    id: x.id,
    title: x.title || "Tugas",
    subject: x.subject || "Umum",
    due: /^\d{4}-\d{2}-\d{2}$/.test(x.due || "") ? x.due : null,
    teacher: x.teacher || x.assignee || "",
    description: x.description || "",
    status: x.status === "archived" ? "archived" : "open",
    updated_at: new Date().toISOString(),
  })));

  if (uidMap.size) {
    const progressSnap = await firestore.collection("taskProgress").get();
    const progressRows = progressSnap.docs.map((doc) => doc.data()).map((x) => ({
      user_id: uidMap.get(x.uid),
      task_id: x.taskId,
      done: Boolean(x.done),
      updated_at: new Date().toISOString(),
    })).filter((x) => x.user_id && x.task_id);
    await upsert("task_progress", progressRows, "user_id,task_id");
  }

  const resourceSnap = await firestore.collection("resources").get();
  const resourceRows = resourceSnap.docs.map((doc) => doc.data()).filter((x) => x.driveFileId).map((x) => ({
    drive_file_id: x.driveFileId,
    name: x.name || "file",
    mime_type: x.mimeType || "application/octet-stream",
    size: Number(x.size) || 0,
    subject: x.subject || "Umum",
    kind: x.kind === "tugas" ? "tugas" : "materi",
    uploaded_by: uidMap.get(x.uploadedBy) || null,
    uploaded_by_name: x.uploadedByName || "Pengguna",
  }));
  await upsert("resources", resourceRows, "drive_file_id");
}

console.log("Migrasi Firebase → Supabase dimulai…");
await migrateAuthAndMembers();
await migrateData();
console.log("Selesai. Setelah verifikasi, Firebase tidak lagi diperlukan oleh aplikasi runtime.");
if (defaultPassword) console.log("PENTING: semua akun hasil migrasi memakai MIGRATION_DEFAULT_PASSWORD. Minta user mengganti password setelah login.");
