import { supabase, usernameToEmail } from "./supabase.js";
import { can } from "./permissions.js";
import { loadAccount } from "./load-state.js";

export const ROLE_RANK = {
  guest: 0,
  student: 1,
  class_officer: 2,
  teacher: 3,
  developer: 4,
};

export const ROLE_LABEL = {
  guest: "Guest",
  student: "Student",
  class_officer: "Class Officer",
  teacher: "Teacher",
  developer: "Developer",
};

export function hasRole(role, minimum) {
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[minimum] ?? 0);
}

export async function waitForAuth() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user || null;
}

export async function loginWithUsername(username, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession(user = null) {
  return loadAccount(() => readSession(user));
}

async function readSession(user = null) {
  let currentUser = user;
  if (!currentUser) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    currentUser = data.session?.user || null;
  }
  if (!currentUser) return { user: null, role: "guest", profile: null };

  const { data: profile, error } = await supabase
    .from("members")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();
  if (error) throw error;

  const normalizedProfile = profile ? {
    ...profile,
    classRole: profile.class_role || "Anggota",
    roleLabel: profile.role_label || "",
  } : null;
  const role = normalizedProfile?.role || "guest";
  return { user: currentUser, role, profile: normalizedProfile };
}

export async function requireAuth(next = location.pathname) {
  const user = await loadAccount(waitForAuth);
  if (!user) {
    location.href = `/login/?next=${encodeURIComponent(next)}`;
    return null;
  }
  const session = await getSession(user);
  if (!can(session.role, "own_account")) { location.href = "/"; return null; }
  return session;
}

export async function requireRole(minimum = "class_officer", adminLogin = true) {
  const session = await requireAuth(location.pathname);
  if (!session) return null;
  if (!hasRole(session.role, minimum)) {
    if (adminLogin) location.href = "/admin/login/?error=forbidden";
    else location.href = "/";
    return null;
  }
  return session;
}

export async function authHeader() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Kamu harus login.");
  return { Authorization: `Bearer ${token}` };
}

export async function requirePermission(permission) {
  const session = await requireAuth();
  if (!session) return null;
  if (!can(session.role, permission)) {
    location.replace(permission === "admin" && can(session.role, "manage_class") ? "/kelola/" : "/");
    return null;
  }
  return session;
}
