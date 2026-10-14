import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.join(root, "api");
const routerPath = path.join(apiRoot, "[...path].js");
const routes = [
  ["profile/photo", "lib/api-handlers/profile/photo.js", "api/profile/photo.js"],
  ["profile/instagram", "lib/api-handlers/profile/instagram.js", "api/profile/instagram.js"],
  ["public/member-photos", "lib/api-handlers/public/member-photos.js", "api/public/member-photos.js"],
];

async function listFunctions(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith("_")) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFunctions(fullPath));
    else if (/\.(?:js|mjs|cjs|ts)$/.test(entry.name)) result.push(fullPath);
  }
  return result;
}

const functions = await listFunctions(apiRoot);
assert.ok(functions.length <= 12, `Vercel Hobby limit exceeded: ${functions.length} API Functions`);
assert.ok(functions.some((file) => file === routerPath), "Catch-all API router is missing");

const router = await readFile(routerPath, "utf8");
for (const [route, handlerPath, oldPath] of routes) {
  assert.ok(router.includes(`"${route}"`), `Router mapping missing: ${route}`);
  await stat(path.join(root, handlerPath));
  await assert.rejects(stat(path.join(root, oldPath)), { code: "ENOENT" });
}

console.log(`API Function count: ${functions.length}/12`);
console.log("Consolidated route mappings and moved handler files are present.");
