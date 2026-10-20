// Preflight for local Supabase credentials: fails loudly when a key is
// duplicated inside one env file or when a key does not belong to the project
// its SUPABASE_URL points at. Prints statuses only, never secret values.
//
// Resolution mirrors scripts/serve.mjs: OS environment wins, then .env.local
// over .env; inside one file the last occurrence wins.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
];

function parseFile(name) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) return null;
  const rows = fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .map(line => {
      const index = line.indexOf("=");
      if (index === -1) return null;
      return {
        key: line.slice(0, index).trim(),
        value: line.slice(index + 1).trim().replace(/^"|"$/g, ""),
      };
    })
    .filter(Boolean);
  return { name, rows };
}

const problems = [];
// Base-first order so .env.local entries overwrite .env, like serve.mjs.
const files = [parseFile(".env"), parseFile(".env.local")].filter(Boolean);

for (const { name, rows } of files) {
  for (const key of KEYS) {
    const count = rows.filter(row => row.key === key).length;
    if (count > 1) {
      problems.push(
        `${key} appears ${count} times in ${name}; with duplicates the active value depends on line order.`,
      );
    }
  }
}

const effective = {};
for (const { rows } of files) {
  for (const { key, value } of rows) effective[key] = value;
}
for (const key of KEYS) {
  if (process.env[key]) effective[key] = process.env[key];
}

const url = effective.SUPABASE_URL;
const secret = effective.SUPABASE_SECRET_KEY || effective.SUPABASE_SERVICE_ROLE_KEY;
const rootUrl = url ? url.replace(/\/$/, "") : "";

if (!url || !secret) {
  problems.push("SUPABASE_URL / SUPABASE_SECRET_KEY is missing; handlers cannot start.");
} else {
  let host = url;
  try { host = new URL(url).host; } catch { problems.push(`SUPABASE_URL is not a valid URL: ${url}`); }
  if (!problems.some(problem => problem.startsWith("SUPABASE_URL is not"))) {
    const admin = await fetch(`${rootUrl}/auth/v1/admin/users?per_page=1`, {
      headers: { apikey: secret, Authorization: `Bearer ${secret}` },
    });
    if (admin.status === 200) {
      console.log(`PASS  service key pairs with ${host}`);
    } else {
      problems.push(`secret key does not pair with ${host} (admin probe HTTP ${admin.status}).`);
    }
  }
}

const publishable = effective.SUPABASE_PUBLISHABLE_KEY;
if (publishable && rootUrl && !problems.some(problem => problem.startsWith("SUPABASE_URL is not"))) {
  const health = await fetch(`${rootUrl}/auth/v1/health`, { headers: { apikey: publishable } });
  const rest = await fetch(`${rootUrl}/rest/v1/`, {
    headers: { apikey: publishable, Authorization: `Bearer ${publishable}` },
  });
  if (health.ok || rest.ok) {
    console.log(`PASS  publishable key pairs with ${new URL(url).host}`);
  } else {
    problems.push(
      `publishable key does not pair with ${new URL(url).host} (health HTTP ${health.status}, REST HTTP ${rest.status}); it likely belongs to another project.`,
    );
  }
} else if (!publishable) {
  console.log("SKIP  SUPABASE_PUBLISHABLE_KEY not set; browser-auth pairing unchecked.");
}

if (problems.length > 0) {
  console.log("FAIL");
  for (const problem of problems) console.log("  - " + problem);
  process.exit(1);
}
console.log("PASS  Supabase credential set is consistent.");
