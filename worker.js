import { Readable } from "node:stream";

const apiRoutes = new Map([
  ["/api/config", { load: () => import("./api/config.js"), body: "none" }],
  ["/api/profile/update", { load: () => import("./api/profile/update.js"), body: "json" }],
  ["/api/profile/photo", { load: () => import("./api/profile/photo.js"), body: "json" }],
  ["/api/profile/instagram", { load: () => import("./api/profile/instagram.js"), body: "json" }],
  ["/api/admin/create-user", { load: () => import("./api/admin/create-user.js"), body: "json" }],
  ["/api/admin/update-user", { load: () => import("./api/admin/update-user.js"), body: "json" }],
  ["/api/admin/delete-user", { load: () => import("./api/admin/delete-user.js"), body: "json" }],
  ["/api/admin/reset-password", { load: () => import("./api/admin/reset-password.js"), body: "json" }],
  ["/api/drive/upload", { load: () => import("./api/drive/upload.js"), body: "raw" }],
  ["/api/drive/download", { load: () => import("./api/drive/download.js"), body: "none" }],
  ["/api/drive/manage", { load: () => import("./api/drive/manage.js"), body: "json" }],
  ["/api/notifications/run", { load: () => import("./api/notifications/run.js"), body: "none" }],
  ["/api/public/developer-name", { load: () => import("./api/public/developer-name.js"), body: "none" }],
  ["/api/public/member-photos", { load: () => import("./api/public/member-photos.js"), body: "none" }],
]);

const JSON_BODY_LIMIT = 256 * 1024;
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function createResponseAdapter() {
  const headers = new Headers({ "Cache-Control": "no-store", ...SECURITY_HEADERS });
  let statusCode = 200;
  let body = null;
  const response = {
    get statusCode() { return statusCode; },
    set statusCode(value) { statusCode = Number(value) || 200; },
    get headersSent() { return false; },
    setHeader(name, value) { headers.set(name, String(value)); return this; },
    getHeader(name) { return headers.get(name); },
    status(code) { statusCode = Number(code) || 200; return this; },
    json(value) {
      if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=utf-8");
      body = JSON.stringify(value);
      return this;
    },
    send(value) { body = value ?? null; return this; },
    end(value) { body = value ?? null; return this; },
    toResponse() {
      const safeBody = statusCode === 204 || statusCode === 304 ? null : body;
      return new Response(safeBody, { status: statusCode, headers });
    },
  };
  return response;
}

async function createNodeRequest(request, url, bodyMode) {
  const headers = Object.fromEntries(request.headers.entries());
  const req = {
    method: request.method,
    url: request.url,
    headers,
    query: Object.fromEntries(url.searchParams.entries()),
    body: {},
  };

  if (bodyMode === "raw") {
    if (request.body) {
      const stream = Readable.fromWeb(request.body);
      Object.assign(stream, req);
      return stream;
    }
    return Object.assign(Readable.from([]), req);
  }

  if (bodyMode === "json" && request.method !== "GET" && request.method !== "HEAD") {
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > JSON_BODY_LIMIT) {
      throw Object.assign(new Error("Payload terlalu besar."), { status: 413 });
    }
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > JSON_BODY_LIMIT) {
      throw Object.assign(new Error("Payload terlalu besar."), { status: 413 });
    }
    if (text.trim()) {
      try {
        req.body = JSON.parse(text);
      } catch {
        throw Object.assign(new Error("Format JSON tidak valid."), { status: 400 });
      }
    }
  }

  return req;
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const route = apiRoutes.get(url.pathname);
      if (!route) {
        return Response.json(
          { error: "Endpoint tidak ditemukan." },
          { status: 404, headers: { "Cache-Control": "no-store", ...SECURITY_HEADERS } },
        );
      }

      try {
        const handlerModule = await route.load();
        const req = await createNodeRequest(request, url, route.body);
        const res = createResponseAdapter();
        await handlerModule.default(req, res);
        return withSecurityHeaders(res.toResponse());
      } catch (error) {
        const status = Number(error?.status) || 500;
        if (status >= 500) console.error("Cloudflare API handler failed:", url.pathname, error);
        return Response.json(
          { error: status < 500 ? error.message : "Internal server error." },
          { status, headers: { "Cache-Control": "no-store", ...SECURITY_HEADERS } },
        );
      }
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return withSecurityHeaders(assetResponse);
  },
};
