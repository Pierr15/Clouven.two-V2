import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import configHandler from '../api/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Process environment wins over .env.local; .env.local wins over .env.
for (const filename of ['.env.local', '.env']) {
  const supplied = {...process.env};
  try { loadEnvFile(path.join(root, filename)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  Object.assign(process.env, supplied);
}
const port = Number(process.env.PORT || 3000);
const routes = new Set(['', 'jadwal', 'tugas', 'tools', 'penyimpanan', 'anggota', 'profile', 'login', 'admin', 'admin/login', 'kelola']);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const apiRoutes = new Map([
  ['/api/drive/upload', {module: '../api/drive/upload.js', raw: true}],
  ['/api/drive/download', {module: '../api/drive/download.js'}],
  ['/api/drive/manage', {module: '../api/drive/manage.js', json: true}],
  ['/api/public/developer-name', {module: '../api/public/developer-name.js'}],
]);
const handlers = new Map();

async function readJson(req, limit = 64 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Payload terlalu besar.'), {status: 413});
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Format JSON tidak valid.'), {status: 400}); }
}

function adaptResponse(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = value => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(value)); return res;
  };
  res.send = value => { res.end(value); return res; };
  return res;
}

async function serveApi(pathname, requestUrl, req, res) {
  const route = apiRoutes.get(pathname);
  if (!route) return false;
  try {
    let handler = handlers.get(pathname);
    if (!handler) {
      handler = (await import(route.module)).default;
      handlers.set(pathname, handler);
    }
    req.query = Object.fromEntries(requestUrl.searchParams);
    if (route.json) req.body = await readJson(req);
    await handler(req, adaptResponse(res));
  } catch (error) {
    console.error(error);
    if (!res.writableEnded) adaptResponse(res).status(error.status || 500).json({error:error.message || 'Internal server error'});
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname === '/api/config') {
      if (req.method !== 'GET') { res.writeHead(405); return res.end('Method not allowed'); }
      const adapter = {
        setHeader: (name,value) => res.setHeader(name,value),
        status(code) { res.statusCode=code;return this; },
        json(value) { res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return this; },
      };
      return configHandler(req, adapter);
    }
    if (await serveApi(pathname, requestUrl, req, res)) return;
    if (pathname.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({error:'Endpoint tidak ditemukan.'})); }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end('Method not allowed'); }
    const route = pathname.replace(/^\/+|\/+$/g, '').replace(/\/?index\.html$/, '');
    let relative;
    if (routes.has(route)) relative = path.join(route, 'index.html');
    else if (pathname.startsWith('/assets/') && !pathname.includes('..')) relative = pathname.slice(1);
    else { res.writeHead(404); return res.end('Not found'); }
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !(await stat(file)).isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} sedang dipakai. Gunakan PORT lain.` : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}\nCtrl+C untuk berhenti.\nKonfigurasi publik dan API Google Drive lokal sudah aktif. Endpoint admin lainnya tetap memerlukan Vercel Functions.`));
