import { createClient } from "@supabase/supabase-js";

const [usernameRaw, password, name = "Developer"] = process.argv.slice(2);
if (!usernameRaw || !password || password.length < 6) {
  console.error('Pakai: node scripts/bootstrap-developer.mjs <username> <password-min-6> ["Nama"]');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secretKey) throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY belum diatur.");

const supabase = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const username = usernameRaw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
const email = `${username}@clouven.local`;

let user = null;
const { data: existingMember } = await supabase.from("members").select("id").eq("username", username).maybeSingle();
if (existingMember?.id) {
  const { data, error } = await supabase.auth.admin.updateUserById(existingMember.id, {
    password,
    user_metadata: { name, username },
  });
  if (error) throw error;
  user = data.user;
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, username },
  });
  if (error) throw error;
  user = data.user;
}

const { error: memberError } = await supabase.from("members").upsert({
  id: user.id,
  name,
  username,
  role: "developer",
  class_role: "Developer",
  number: "",
  updated_at: new Date().toISOString(),
}, { onConflict: "id" });
if (memberError) throw memberError;
console.log(`Developer Supabase siap: ${username} (${user.id})`);
