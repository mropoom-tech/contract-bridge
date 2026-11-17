# PROJECT_STATE — Verified status only

**Last reviewed:** 2026-11-17 (Phases 0–4 implemented and verified locally; nothing deployed)
**Implementation status:** Phase 0, 1, 2 done (local). Phase 3 playable UI done locally; DoD (4 humans, 4 boards, real phones) and full a11y audit open. Phase 4 hardening done locally; CI/deploy workflows written but never run; production deploy + smoke test blocked on owner's GitHub/Cloudflare setup and authorization.
**Deployment status:** NOT DEPLOYED / UNVERIFIED.
**Git:** local repository on branch `main`; initial commit `f92a5b9` (phases 0–4). No remote.
**GitHub URL:** NOT PROVIDED.
**Cloudflare URL:** NOT PROVIDED.
**Cloudflare D1 database:** binding `DB` (`contract-bridge-db`) in `wrangler.jsonc` with **no `database_id`** (local only). Remote DB not created. Local migration `0001_initial.sql` applied.
**Durable Object binding:** `BRIDGE_ROOMS` → class `BridgeRoom`, migration tag `v1` with `new_sqlite_classes`. Local only.

> IMPORTANT: This file is a progress log, not evidence. Claude must inspect repo, test outputs, and deployment before changing statuses.

## Phase checklist

- [x] Phase 0 — actual repo audit / baseline scaffold / commands pass (local)
- [x] Phase 1 — game engine rules + test suite pass
- [x] Phase 2 — 4-seat room, auth, WebSocket, DO storage + integration tests (local)
- [~] Phase 3 — complete UI and 13-trick game playable (playable locally; DoD with 4 humans on phones pending)
- [~] Phase 4 — hardening done locally; CI never run; not deployed (see "Phase 4" below)
- [ ] Phase 5 — optional post-MVP features

## Phase 4 (as implemented)

- **D1 outbox:** `RoomState.pendingWrites` (schema v2) gets `MATCH_START` (match + 4 `match_players`, room → active), `BOARD_RESULT` per finished board (stable id `<matchId>:board:<n>`, passed-out rows with NULL contract), `MATCH_END` when the final board finishes (match + room → completed). Persisted atomically with the state change. `worker/room/result-sync.ts` flushes in order with `ON CONFLICT DO NOTHING`, stops at the first failure, verifies the board row and reports (never overwrites) a conflicting score. The DO flushes right after the command and keeps an alarm armed; failures back off 2 s → 10 min.
- **Restore:** DO constructor loads `room:state` via `migrateRoomState` (v1 → v2 adds empty outbox; unknown versions throw) and re-arms the alarm if writes are pending.
- **Rate limits:** Workers Rate Limiting bindings `GUEST_LIMITER` (10/min per `CF-Connecting-IP`; skipped when the header is absent) and `ROOM_LIMITER` (20/min per user, create + join); max 5 open rooms per host in 24 h. WS frames: 60/10 s per socket (Phase 2).
- **CI/CD:** `.github/workflows/ci.yml` (checks + e2e on dev server), `.github/workflows/deploy.yml` (manual, `production` environment, refuses without real `database_id`, optional remote migrations, health smoke check). Action versions checked against GitHub tags: checkout v7, setup-node v7, wrangler-action v4.1.3.
- **Playbook:** `docs/DEPLOYMENT.md` §9a/§10.

## Phase 3 UI (as implemented)

- Routes (tiny History router, no extra dependency): `/` landing, `/play?next=` nickname (open-redirect-safe `next`), `/lobby` create/join (code or invite URL), `/room/:code` waiting room → table → result.
- `stores/session.ts` (Zustand): `/auth/me`, guest login, logout.
- `stores/room.ts` (Zustand): join (idempotent) → WebSocket; one in-flight command; `requestId` reused when resending after reconnect; `STALE_VERSION` → snapshot request; exponential backoff reconnect; `session:replaced` → "use here" screen; leave → back to lobby; live-region announcements (`lib/announce.ts`).
- Table: rotate-to-self (self bottom), Thai seat names + N/E/S/W, team colors plus text, dealer/declarer/dummy badges, active-seat highlight, hidden hands as backs + counts, dummy face-up grouped by suit and playable by declarer only on dummy's turn ("กำลังเล่นจากไพ่ Dummy"), select-then-confirm card play, last trick shown with winner until the next lead, NS/EW trick counts.
- Auction: N/E/S/W column grid with dealer offset; bidding box enables only server-allowed calls; bid needs confirm; Pass/X/XX direct.
- Result: contract, declarer, vulnerability, target/actual tricks, itemized score (new engine `scoreBreakdown`), `NS: x / EW: -x`, running scoreboard, next-board readiness per seat, match-completed summary.
- Dev helper `apps/web/e2e/bots.ts <CODE>` fills empty seats with bots (local testing only).

## Repository layout (actual)

```text
package.json                 npm workspaces root (apps/*, packages/*)
tsconfig.base.json           strict TS + noUncheckedIndexedAccess (packages)
.oxlintrc.json               oxlint config (scaffold ships oxlint; used instead of ESLint)
migrations/0001_initial.sql  D1 schema from DATABASE_SCHEMA.md
packages/game-engine/        pure TS bridge rules (Phase 1), 87 tests
packages/shared/             protocol v1 Zod schemas + shared view types, REST schemas, 5 tests
apps/web/                    create-cloudflare@2.74.14 React-TS + Workers Assets scaffold
  worker/index.ts            Worker entry; exports BridgeRoom; /api/* → Hono
  worker/app.ts              Hono routes: health, auth (guest/me/logout), rooms (create/get/join/ws)
  worker/auth.ts             256-bit session token, SHA-256 hash in D1, origin allowlist
  worker/room/room-state.ts  PURE room state machine (membership, seats, ready, start, auction, play, next board, idempotency, versions)
  worker/room/room-projection.ts  allowlisted per-user snapshot (only path data leaves the DO)
  worker/room/BridgeRoom.ts  SQLite-backed DO: storage, hibernatable WS, fan-out, rate/size limits
  worker/room/*.test.ts      17 unit tests (incl. health)
  e2e/                       4 real WebSocket clients against `npm run dev` (5 tests)
  src/                       Thai landing page only (Phase 3 builds the game UI)
```

Tool versions: Node 24.19, npm 11.17, React 19.3, Vite 8.3, @cloudflare/vite-plugin 1.69, Wrangler 4.164, TypeScript 7.0, Hono 4.13, Zod 4.6, Zustand 5.1, Tailwind 4, Vitest 5.1, oxlint 1.94.

## Phase 1 engine API

`createDeck`, `shuffle`, `deal`, `createCryptoRandom` (Web Crypto + rejection sampling), `createSeededRandom` (tests only), `getBoardConfiguration`, `validateCall`/`applyCall`/`summarizeAuction`/`resolveAuction`/`legalCalls`, `validateCardPlay`/`applyCard`/`resolveTrick`/`legalCards`, `scoreDuplicate`/`toNsScore`, `createBoard`/`boardCall`/`boardPlay`, `projectBoardForSeat`.

Covered: 16-board cycle; 35 bid ranks; insufficient bids; double/redouble legality; passed-out; 3-pass termination; declarer = first of side to name strain; follow-suit; trump/NT winners; void ruff/discard; dummy control; no replay; immutability; all golden scoring vectors + full doubled/redoubled tables; EW → negative NS; 300 random full boards; projection leak tests.

## Phase 2 design (as implemented)

- **Auth:** `POST /api/auth/guest {displayName}` creates user + session; cookie `bridge_session` (HttpOnly, SameSite=Lax, Secure on https, 30 days); D1 stores only SHA-256 of the token; lookup checks expiry and revocation. `GET /auth/me`, `POST /auth/logout` (revokes).
- **CSRF / WS origin:** every non-GET request and every WS upgrade must carry an `Origin` equal to the request origin or listed in `ALLOWED_ORIGINS`.
- **Rooms:** `POST /api/rooms {targetBoards}` → 8-char code (unambiguous alphabet, CSPRNG, unique in D1) + DO `initialize` RPC. `GET /api/rooms/:code`, `POST /api/rooms/:code/join` (DO admits ≤4 distinct identities, closed after start).
- **WS:** `GET /api/rooms/:code/ws` → Worker verifies session, then builds a **fresh** internal request carrying only `Upgrade` + `X-Bridge-Internal-User-Id`, so forged client headers never reach the DO. DO re-checks persisted membership, `ctx.acceptWebSocket(server, [userId])`, attachment `{userId}` only.
- **Commands:** Zod strict schemas (unknown fields rejected; ≤4096 chars; ≤60 frames/10 s per socket). Order: membership → dedup `(userId, requestId)` → `expectedVersion` → pure transition → `storage.put` (state + dedup record in one key) → ack → per-user snapshots. Rule rejections are remembered (same response on retry); `STALE_VERSION` is not (so retry after resync works). Dedup log bounded at 256.
- **Events:** after each committed mutation every open socket receives its **own** `session:snapshot` (`SeatSpecificSnapshot`). The granular events in WEBSOCKET_PROTOCOL §4 (`auction:updated`, `card:played`, …) are not emitted yet — snapshots carry the same data, seat-filtered. Revisit in Phase 3 if animation needs deltas.
- **Tabs:** one live connection per user; newer connection sends `session:replaced` to older sockets then closes them (protocol addition).
- **Phases:** `WAITING → BIDDING → PLAYING → BOARD_RESULT → (BIDDING next board | MATCH_COMPLETED)`; passed-out goes straight to BOARD_RESULT. Seats locked after start.

## Actual verification log

| Date | Phase | Evidence / command / output | Result | Notes |
|---|---|---|---|---|
| 2026-11-17 | Spec | Documentation kit authored | Docs only | |
| 2026-11-17 | 0 | Audit: folder had docs only, no code, not a git repo | Empty | Scaffolded fresh |
| 2026-11-17 | 0 | `npx create-cloudflare@2.74.14 web --framework=react --platform=workers --variant=react-ts --no-deploy --no-git` | Created | |
| 2026-11-17 | 1 | engine `vitest run --coverage` | 87 passed; Stmts 97.13%, Branch 92.43%, Lines 99.64% | thresholds 90% enforced |
| 2026-11-17 | 0 | `npm run dev` → browser `GET /api/health` | 200; Thai landing page shows "ออนไลน์" | |
| 2026-11-17 | 2 | `wrangler d1 migrations apply DB --local` | 0001_initial.sql ✅ (14 commands) | local only |
| 2026-11-17 | 2 | root `npm run typecheck` | exit 0 (engine, shared, web app/worker/e2e) | |
| 2026-11-17 | 2 | root `npm run lint` | 0 warnings, 0 errors | |
| 2026-11-17 | 2 | root `npm test` | web 17/17, engine 87/87, shared 5/5 | |
| 2026-11-17 | 2 | `npm run test:e2e -w @bridge/web` (dev server running) | 5/5 passed, twice in a row | see below |
| 2026-11-17 | 2 | root `npm run build` | client + worker bundles built | |
| 2026-11-17 | 3 | root `npm test` | web 27/27, engine 90/90 (adds scoreBreakdown), shared 5/5 | |
| 2026-11-17 | 3 | typecheck + oxlint | 0 errors, 0 warnings | |
| 2026-11-17 | 3 | `npm run test:e2e -w @bridge/web` | 5/5 | |
| 2026-11-17 | 3 | `npm run build` | JS 354.6 kB (108.5 kB gzip), CSS 31.6 kB | |
| 2026-11-17 | 3 | Browser (in-app) + `node apps/web/e2e/bots.ts`: nickname → create room (2 boards) → seat S → ready → start → bid 1NT → play from dummy and own hand → board 1 result 1NT −5 = NS −250 / EW +250 → board 2 passed out (dealer E, vul NS) → MATCH_COMPLETED with scoreboard | Worked | 1 human + 3 bots, desktop |
| 2026-11-17 | 3 | 375×812 emulation: `scrollWidth === innerWidth` (375) after fix | No horizontal overflow | hand strip scrolls deliberately |
| 2026-11-17 | 4 | root typecheck / oxlint | 0 errors / 0 warnings | |
| 2026-11-17 | 4 | root `npm test` | web 34/34 (incl. node:sqlite outbox tests with failure injection, restore + schema migration), engine 90/90, shared 5/5 | |
| 2026-11-17 | 4 | `npm run test:coverage` (engine) | Stmts 97.1%, Branch 92.49%, Lines 99.65% | |
| 2026-11-17 | 4 | `npm run test:e2e -w @bridge/web` | 8/8: Phase 2 suite + guest limit (10 OK then 429,429), 6th open room 429, finished match → local D1 has 1 match `completed`, 4 players, 1 board row with matching NS score, room `completed` | |
| 2026-11-17 | 4 | `node apps/web/e2e/restart-check.ts before` → stop/start dev server → `after` | 10/10 PASS: version, 4 hands, phase, contract, 6 played cards preserved; play continues | full workerd restart, storage in `.wrangler/state` |
| 2026-11-17 | 4 | `npm run build` | built | |

E2E covers: 4 guests, create/join, 5th player `ROOM_FULL`, unauthenticated 401, missing/foreign Origin 403 on POST and WS, non-member WS refused, forged `X-Bridge-Internal-User-Id` ignored, newer tab replaces older, seat taken, non-host start refused, duplicate `requestId` → identical ack and one transition, `STALE_VERSION`, malformed/oversize frames → `INVALID_PAYLOAD`, deal 4×13 disjoint = 52, out-of-turn double refused, dummy's own account refused, declarer plays dummy, mid-board reconnect gets fresh snapshot with no extra action, all 52 cards played, BOARD_RESULT → MATCH_COMPLETED, and an audit of **every frame each client received** for concealed cards.

## Known blockers / notes

- GitHub repository, Cloudflare account, remote D1 ID, secrets, production domain not supplied. Nothing deployed.
- npm 11 blocks install scripts; `workerd` and `esbuild` approved via `npm approve-scripts`.
- In local dev (Vite + Miniflare), a server `close()` issued from the DO's `fetch()` on an older socket was not delivered to the client; `close()` from `webSocketMessage` was. Mitigated by the explicit `session:replaced` message. Re-check on real Cloudflare in Phase 4.
- CI and deploy workflows have never run (no GitHub repo). The Linux `npm ci` with a Windows-generated lockfile is untested.
- No production deploy, smoke test, or real-Cloudflare check of WS close delivery / rate-limit behaviour.
- E2E clients send a random `CF-Connecting-IP` per simulated player so the local per-IP limit treats them as separate devices (Cloudflare overwrites this header in production).
- `restart-check.ts` is a manual two-step check, not part of CI.
- `GET /api/matches/:id/summary` (WEBSOCKET_PROTOCOL §8) is not implemented yet; results are written to D1 but not exposed.
- `apps/web/README.md` is the scaffold default.

- Phase 3 gaps: reconnect overlay and "replaced" screen not exercised in a browser; no 4-human or real-phone session yet; keyboard-only/200% zoom/screen-reader audit not done; on mobile the bidding box sits below the table rather than in a bottom drawer.

## Next exact action

Owner: create the GitHub repo and Cloudflare D1 database (see DEPLOYMENT.md §9a), then authorize the first deploy. After deploy: run the §7 smoke checklist with 4 devices (also closes Phase 3 DoD) and record the URL + commit SHA here. Code-side leftovers: `/api/matches/:id/summary`, accessibility audit, mobile bidding drawer.
