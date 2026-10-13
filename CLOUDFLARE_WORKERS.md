# Cloudflare Workers migration

This branch adds a Cloudflare Workers deployment path while leaving the existing Vercel setup intact for rollback. It does not change Supabase schema/data or move Google Drive files.

## What changed

- `worker.js` routes the known `/api/*` endpoints through a compatibility adapter for the repository's existing Vercel-style `(req, res)` handlers.
- `wrangler.jsonc` configures Workers, Node.js compatibility, and static assets.
- `scripts/build-cloudflare.mjs` creates `dist/` from an explicit allowlist of public page folders and `assets/`. It intentionally excludes `api/`, `scripts/`, `supabase/`, tests, and environment/configuration files from the public asset bundle.
- `npm run build:cloudflare` builds those public assets.

## Required environment

Configure these values in the Cloudflare Worker settings before using authenticated or Google Drive features:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Public browser key used by `/api/config`; `SUPABASE_ANON_KEY` is accepted as a legacy fallback |
| `SUPABASE_SECRET_KEY` | Server-side Supabase secret key; `SUPABASE_SERVICE_ROLE_KEY` is accepted as a legacy fallback |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for Drive integration |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | Google Drive refresh token |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Root folder ID for class files |
| `CRON_SECRET` | Bearer secret required by `/api/notifications/run` |

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as Worker variables if desired. Store `SUPABASE_SECRET_KEY`, Google OAuth secrets, the refresh token, and `CRON_SECRET` as Cloudflare secrets. Never commit actual credentials in this repository.

For local development, create a private `.dev.vars` file with the same key/value pairs. It is ignored by Git.

## Local build and test

1. Install dependencies with `npm install`.
2. Build public assets: `npm run build:cloudflare`.
3. Run a local Worker preview: `npx wrangler@latest dev`.
4. Check the homepage and every route: `/`, `/jadwal/`, `/kalender/`, `/tugas/`, `/tools/`, `/tools/spinning-wheel/`, `/penyimpanan/`, `/anggota/`, `/profile/`, `/login/`, `/admin/`, `/admin/login/`, and `/kelola/`.
5. Check `GET /api/config`, then test login/session, role authorization, profile edits/photo actions, Instagram edits, member photos, user administration, Google Drive upload/download/manage, and notification execution with a non-production test account and test Drive folder.

The JSON request adapter rejects payloads larger than 256 KiB. The raw Google Drive upload endpoint retains its existing 3 MiB application limit. The frontend bundle is generated from an allowlist so repository internals are not exposed as static files.

## Configure and deploy

From a terminal authenticated to the intended Cloudflare account:

```sh
npm run build:cloudflare
npx wrangler@latest secret put SUPABASE_SECRET_KEY
npx wrangler@latest secret put GOOGLE_CLIENT_ID
npx wrangler@latest secret put GOOGLE_CLIENT_SECRET
npx wrangler@latest secret put GOOGLE_DRIVE_REFRESH_TOKEN
npx wrangler@latest secret put GOOGLE_DRIVE_ROOT_FOLDER_ID
npx wrangler@latest secret put CRON_SECRET
npx wrangler@latest deploy
```

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as Worker variables in the Cloudflare dashboard (or use the secrets interface if preferred). If the project uses the legacy key name, set `SUPABASE_ANON_KEY` instead. Confirm the variable names are available to Node.js compatibility's `process.env` before testing the endpoints.

Do not point `clouventwo.my.id` to this Worker until all checks pass. Keep the Vercel deployment and DNS unchanged during validation. No Supabase SQL migration should be rerun for this hosting change.

## Important validation note

This is a deployment scaffold and runtime adapter, not a claim that production migration is already validated. Before switching the custom domain, verify all API handlers and Node.js compatibility in Cloudflare's local preview and deployed test Worker. In particular, test streaming uploads/downloads, Google OAuth/Drive, Supabase admin operations, and the notification endpoint. Keep production secrets out of logs and source control.
