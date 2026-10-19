import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationDir = join(process.cwd(), "supabase", "migrations");
const nestedDir = join(migrationDir, "supabase", "migrations");
const files = readdirSync(migrationDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^\d{14}_.+\.sql$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

assert.equal(existsSync(nestedDir), false, "Migrations must not be nested under supabase/migrations.");
assert.ok(files.length > 0, "At least one canonical migration is required.");
assert.equal(new Set(files.map((file) => file.slice(0, 14))).size, files.length, "Migration version prefixes must be unique.");
assert.ok(files.includes("202609250001_member_nicknames.sql"), "Nickname migration must be canonical.");
assert.ok(files.includes("202609290001_fix_replace_subject_teachers.sql"), "Subject-teacher migration must be canonical.");
assert.ok(files.includes("202610160001_clouven_drive_metadata.sql"), "Clouven Drive metadata migration must be canonical.");
console.log(`Supabase migration layout passed (${files.length} canonical migrations).`);
