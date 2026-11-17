# DEPLOYMENT — GitHub + Cloudflare Workers + D1 + Durable Objects

## 0. Approach and verification

Use one GitHub repository with Cloudflare Workers for React/Vite static assets + Hono API + DO class, deployed with **GitHub Actions**. Check current official docs before implementation: Cloudflare may evolve config syntax and scaffolding. The following commands are an **operational guide**, not evidence of deployment.

## 1. Prerequisites

- GitHub account, Cloudflare account, Node.js current supported LTS, npm, Git
- Cloudflare domain optional; default `*.workers.dev` sufficient
- Permissions to create D1 database, Worker, SQLite-backed DO namespace, GitHub repository secrets
- No Cloudflare token committed into repo or pasted into application code

## 2. Scaffold (empty repo)

Official recommended starting path (see Cloudflare React guide):

```bash
npm create cloudflare@latest -- contract-bridge-online --framework=react
cd contract-bridge-online
npm install
npm run dev
```

Adapt the scaffold to workspace layout as needed. Install Hono/Zod/Zustand/Tailwind/Vitest via version-compatible packages. Use `@cloudflare/vite-plugin` from the official template, not a second incompatible Vite integration. Generated `worker/index.ts` (or equivalent) becomes Hono entrypoint. The `BridgeRoom` Durable Object class is exported by the Worker module.

## 3. Cloudflare resources

Create D1 (manually in authorized account):

```bash
npx wrangler login
npx wrangler d1 create bridge-online-db
```

Copy the **real returned database UUID** into your application Wrangler config; never use placeholders when deploying. Suggested binding: `DB`.

**Durable Object binding:** `BRIDGE_ROOMS` bound to exported class `BridgeRoom` with SQLite storage. For new projects, prefer the newer declarative `exports` mechanism if supported by current Wrangler; if using legacy `migrations`, set `new_sqlite_classes` and **do not combine both mechanisms for the same class**. Example of new-style config **fragment** (adjust to scaffold; not standalone):

```jsonc
{
  "durable_objects": {
    "bindings": [
      { "name": "BRIDGE_ROOMS", "class_name": "BridgeRoom" }
    ]
  },
  "exports": {
    "BridgeRoom": { "type": "durable-object", "storage": "sqlite" }
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "bridge-online-db",
      "database_id": "<COPY_ACTUAL_DATABASE_UUID_HERE>"
    }
  ]
}
```

The final `wrangler.jsonc` also needs real worker `name`, `main`, `compatibility_date` and any SPA assets settings from official generated template. The database UUID is a resource identifier, not a password, but do not invent it. Runtime secrets must live in secrets/local `.dev.vars` (gitignored).

## 4. D1 migrations

Create numbered `.sql` files using `docs/DATABASE_SCHEMA.md` as basis, e.g. `migrations/0001_init.sql`.

```bash
npx wrangler d1 migrations apply bridge-online-db --local
# Once verified and authorized:
npx wrangler d1 migrations apply bridge-online-db --remote
```

Remote migration is a production-impacting operation: verify target account/DB, inspect SQL, back up data, confirm authorization. Avoid automatic unreviewed production D1 migrations as part of generic PR builds.

## 5. Local tests and build

```bash
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
```

Actual scripts must be present and verified. If workspaces need `npm -w ...`, update scripts and docs accordingly. Local Cloudflare bindings should use official emulation; do not test multiplayer using static mocked WS and claim production readiness.

## 6. GitHub actions / secrets

Create a GitHub private or public repository; add Workflow permissions appropriately. In GitHub **Settings → Secrets and variables → Actions**, configure:

- `CLOUDFLARE_API_TOKEN` — scoped to the necessary Cloudflare account and resources
- `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID

Recommended `ci.yml`: checkout, setup-node, npm ci, typecheck, lint, test, build on PR and main. Recommended `deploy.yml`: on protected main after CI; `cloudflare/wrangler-action@v4` or current official compatible major. Ensure deploy workflow runs only with authorized credentials and appropriate environments.

Skeleton `deploy.yml` (Claude must reconcile workdir/build scripts with actual repo):

```yaml
name: Deploy to Cloudflare Workers
on:
  workflow_dispatch:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with:
          node-version: 'lts/*'
          cache: npm
      - run: npm ci
      - run: npm run typecheck && npm run lint && npm run test && npm run build
      - uses: cloudflare/wrangler-action@v4
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/web
          command: deploy
```

**Note:** The `workingDirectory: apps/web` example assumes the proposed directory layout. If the generated template keeps Wrangler at repository root, remove/change this field. Action versions, Node LTS, and the actual build/deploy directories require verification at implementation time. For strict security, use a protected GitHub Environment and require manual approval on production deployment.

## 7. First production smoke checklist

- [ ] `GET /api/health` responds with expected version/status
- [ ] React asset loads on `*.workers.dev` and deep-link refresh works
- [ ] D1 migrations present in correct production database
- [ ] DO class deployed and bound; no migration/export errors
- [ ] Four distinct browsers create/join/seats; identity persists
- [ ] WS upgrade secure WSS/Origin allowed, no unauthorized access
- [ ] Four private hands visible only to owner; Dummy reveal correct
- [ ] One full board, scoring and board result persisted
- [ ] Refresh one browser in middle of play -> same state
- [ ] Repeat request does not duplicate bid/card
- [ ] No runtime secrets or hidden hands in logging/network payloads

## 8. Cost and operational safeguards

Workers, D1 and SQLite-backed DO have Free tiers as of Nov 2026 with limits; workloads exceeding free limits can be rejected. Hibernatable WS reduces idle duration charges but messages/storage still have quotas. Monitor resource usage; do not promise zero cost under arbitrary player concurrency. Use Cloudflare limits and pricing docs linked in `REFERENCES.md`.

## 9a. As implemented in this repo (2026-11-17)

- Wrangler config: `apps/web/wrangler.jsonc`. DO uses `migrations` with `new_sqlite_classes: ["BridgeRoom"]` (tag `v1`), not `exports` — do not add both. D1 binding `DB` (`contract-bridge-db`) has **no `database_id`** until the owner creates the database.
- Rate limiting uses the Workers Rate Limiting binding (`ratelimits`: `GUEST_LIMITER` 10/min per IP, `ROOM_LIMITER` 20/min per user). Hosts may have at most 5 open rooms created in the last 24 h.
- `.github/workflows/ci.yml`: typecheck, lint, unit tests, coverage, build, then e2e against a dev server with local D1.
- `.github/workflows/deploy.yml`: **manual** (`workflow_dispatch`), GitHub Environment `production` (add required reviewers), refuses to run without a real `database_id`, optional remote migrations checkbox, `cloudflare/wrangler-action@v4.1.3`, optional `/api/health` smoke check via repository variable `PRODUCTION_URL`.
- First deploy steps for the owner: create repo + push; `npx wrangler login`; `npx wrangler d1 create contract-bridge-db`; put the returned id in `apps/web/wrangler.jsonc` as `database_id`; add secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; create Environment `production`; run "Deploy to Cloudflare Workers" with "apply migrations" ticked the first time; then run the §7 smoke checklist with 4 devices.

## 10. Failure playbook

| Symptom | Check | Action |
|---|---|---|
| Players stuck on "กำลังเชื่อมต่อใหม่" | `/api/health`; Worker logs for `unhandled_error` | Client retries with backoff automatically; if Worker is down, roll back to the previous deployment in the Cloudflare dashboard. |
| `d1_sync_failed` in logs | D1 status/quotas | Nothing is lost: results stay in the room DO outbox and the DO alarm retries with backoff (2 s → 10 min cap). Game play is unaffected. |
| `d1_result_conflict` in logs | Compare `board_results` row with DO state | Integrity alarm: an existing row differs. Rows are never overwritten automatically; investigate manually. |
| Many `RATE_LIMITED` | Who/what is calling | Limits are in `wrangler.jsonc` (`ratelimits`); adjust and redeploy if legitimate. |
| DO throws `Unsupported room schemaVersion` | A deploy rolled back below the stored schema | Redeploy the newer version; add a migration in `migrateRoomState` for every schema change. |
| Bad deploy | Smoke checklist fails | Cloudflare dashboard → Worker → Deployments → roll back. D1 migrations are additive; never apply destructive SQL without a backup. |

## 9. Maintenance

- Keep `PROJECT_STATE.md` with exact live URL, environment, latest migration and tested commit SHA.
- Plan schemaVersion upgrades for old persisted DO snapshots.
- Roll out during low-activity times, test reconnect across deploys, and preserve ongoing games across new code.
- Avoid indiscriminately deleting room DO objects or resetting user sessions during maintenance.
