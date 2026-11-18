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

## First production deploy (2026-11-18)

- URL: https://contract-bridge-online.mropoomkung.workers.dev
- GitHub Actions "Deploy to Cloudflare Workers" run #3 (commit b7ee33d): all steps green, including remote D1 migrations.
- CI run #2 on b7ee33d green (checks + e2e).
- Smoke checks from a dev machine: `/api/health` 200, `/` 200, deep link `/play` 200, guest create 201 + `/api/auth/me` 200 (D1 write/read works), foreign Origin rejected with 403.
- Not yet done: §7 four-device smoke test (seats, private hands, full board, refresh mid-play), repository variable `PRODUCTION_URL`.

## UI polish batch 1 (2026-11-18)

- Prompt (Google Fonts) is the site-wide font (`index.html`, `--font-sans`).
- Dummy hand orientation follows table position: left/right = one vertical column per suit; top = one horizontal row. Verified in the browser with dummy at top (human declarer S) and at right (bot declarer E via `e2e/bots.ts --open`).
- Game status bar: labelled tiles (Board, Dealer, Vul with red highlight when vulnerable, Contract), pulsing "your turn" pill, team trick pills.
- Dev note: setting the real `database_id` moved local D1 state to a new file; run `npx wrangler d1 migrations apply DB --local -c apps/web/wrangler.jsonc` once after pulling.
- typecheck/lint clean; unit tests 34 + 90 + 5 pass.

## Scoring dialog (2026-11-18)

- `apps/web/src/lib/score-explain.ts`: pure `explainScore` turns the engine's `scoreBreakdown` into items split below the line (contract trick points) / above the line (overtricks, game/partscore/slam/insult bonuses, undertrick penalties), each with the board's actual formula and the general rule. Throws if items do not sum to the engine total; a test checks every level × strain × doubling × vulnerability × 0..13 tricks.
- `components/ScoreDialog.tsx`: native `<dialog>` that auto-opens once per finished board, reopenable via "ดูวิธีคิดคะแนน". Rows open their explanation on mouse hover, long-press (touch/pen, 450 ms), keyboard focus + Enter, or click.
- Browser check (local, 1 human + 3 bots): 1NT by E made +3 non-vul showed below 40 / above 140 (90 overtricks + 50 partscore) = 180; close/reopen works; dialog 337px wide at 375px viewport with no horizontal overflow.

## Tutorial (2026-11-18)

- Public routes `/learn`, `/learn/:id`, `/learn/scoring` (no sign-in). Links from the landing page and the app header.
- 7 lessons in `apps/web/src/lib/lessons.ts` (basics, tricks, follow suit, trumps, auction, declarer/dummy/opening lead, scoring), each with explanation + practice. Practice kinds: multiple choice, trick winner, follow-suit card selection, legal-call selection, score entry. Answers come from the engine (`resolveTrick`, `validateCall`, `scoreBreakdown`); `lessons.test.ts` pins every answer and cross-checks the declarer example with `resolveAuction`.
- Scoring reference page: trick values, bonuses, made-contract table (levels 1-7, NV/V) and undertrick table (1-6 down, undoubled/X/XX, NV/V), all numbers generated by `scoreBreakdown` (spot-checked: 4♥ NV 420, 3NT V 600, 7NT V 2220, 3 down NV X 500, 2 down V XX 1000).
- Progress stored per browser in localStorage (try/catch; optional).
- Browser (local): all exercise kinds answered right/wrong as expected, lesson completion + progress counter, no horizontal overflow at 375px on index, lesson and reference pages. Screenshots not captured (pane hidden).

## Empty-room auto-close (2026-11-18)

- Policy in `apps/web/worker/room/room-lifecycle.ts` (pure, `room-lifecycle.test.ts`): a room with no open WebSocket for `ROOM_EMPTY_TTL_SECONDS` (wrangler var, default 900 = 15 min, accepted 10..86400) is closed. Never closed while D1 outbox writes are pending; while writes are pending the outbox retry drives the alarm (no busy loop).
- `BridgeRoom`: one alarm serves outbox retry and the empty deadline. Empty timer starts on room creation, when the last socket closes/errors, and on wake for older rooms with nobody connected; cleared on connect. Close = D1 `rooms.status='archived'` + active `matches` → `abandoned` (idempotent), then `deleteAll()` of DO storage; D1 failure retries in 60 s. Finished results already in D1 are untouched.
- Room lookup by code ignores archived rooms (404 without waking the DO).
- Evidence: unit 26 worker tests; live manual check `e2e/room-close-check.ts` with `.dev.vars` TTL 10 s → emptied room 404 + D1 `archived`, occupied room still 200/`waiting` with socket open: PASS. Full e2e 8/8 with default TTL.
- Not live-tested: closing while outbox writes are pending (covered by unit policy tests only).

## Lobby / waiting room polish (2026-11-18)

- Lobby: greeting, side-by-side Create / Join cards, board count as segmented radio buttons with time estimate, large code input (join disabled while empty), "new to bridge" panel linking to tutorial + scoring reference.
- Waiting room: 3-step progress (seats 4/4 → ready 4/4 → host starts), seats laid out around a mini table (N top, W left, E right, S bottom) with online dot, host/you/ready badges, take-seat button in the seat.
- Screenshots checked at 1100px and 375px (lobby and waiting room with 2 bots). typecheck/lint clean, unit tests pass, e2e 8/8.

## Disconnected players: bot takeover and kick votes (2026-11-18)

- Room schema v3 (`migrateRoomState` upgrades v1/v2): `botSeats`, `kicked` (members removed by vote, with names), `vote`.
- Commands: `vote:start {seat, kind: BOT|KICK}`, `vote:cast {voteId, yes}`, `seat:reclaim`.
  - BOT: only during a match and only against a seated player who is offline right now.
  - KICK: any phase before the match ends. In the waiting room the seat is freed; during a match the bot keeps the seat.
  - Eligible voters are fixed at vote start: the starter plus the other online seated humans (target excluded). Needed = majority (floor(n/2)+1). The starter's yes counts. A vote is cancelled as soon as a majority becomes impossible.
  - Kicked users are no longer members: their sockets are closed with 4003 and `join` is refused (403).
  - Bot-played seats cannot act for the human until `seat:reclaim`.
- Server bot (`worker/room/bot.ts`, `applyBotStep`):
  - Passes in the auction. In play it leads low, plays low under a winning partner, otherwise wins as cheaply as possible, else plays low. It readies for the next board.
  - It uses the same reducer transition as humans, so all rules and D1 outbox writes apply. It only sees its own seat's engine projection.
  - The DO drives moves 700 ms apart after each accepted command and on reconnect.
- UI:
  - Vote panel on the table and in the waiting room: offline players, active vote with tally and yes/no buttons.
  - "🤖 บอท" badge on seats; "take back my seat" banner; kick link on seat cards in the waiting room.
- Evidence:
  - Unit `votes-bots.test.ts` (10): majority/cancel, kick in waiting/match, reclaim, v2 migration, all-bot match to completion, bot declarer finishes 13 tricks, card choice.
  - e2e `votes.e2e.test.ts` (2) over real WebSockets: BOT vote → bot passes and readies → player returns and reclaims; KICK vote → 4003 close + rejoin 403.
  - Full e2e 10/10 twice. One earlier full run failed (including an existing multiplayer test) while the dev server was reloading after an edit; it was not reproduced in 2 reruns.
  - Browser: 3 players dropped, voted bots in, bots passed and readied (screenshot).
- Known limit: the bot is basic (always passes in the auction).

## Production deploy 2 (2026-11-18)

- Bot moves are now paced by the Durable Object alarm (`room:bot-due`), not an in-memory timer, so they survive hibernation/eviction in production. The alarm is shared with the outbox retry and empty-room deadline.
- e2e client: `CF-Connecting-IP` is spoofed only against localhost (Cloudflare's edge rejects client-sent CF-* headers). The vote test tracks seats it disconnects itself, because a client-side close event can arrive late over the internet.
- Deployed with `wrangler deploy` from this machine (owner's OAuth login, owner-authorized). Remote D1: "No migrations to apply". Version `8fba08bf-8b21-4797-9902-f92737fbcb97` at https://contract-bridge-online.mropoomkung.workers.dev.
- Production smoke:
  - `/api/health` 200; `/`, `/learn`, `/learn/scoring`, `/lobby` 200; Prompt font loaded.
  - `e2e/votes.e2e.test.ts` against production 2/2: bot vote, the bot passes and readies, player reclaims; kick vote, 4003 close, rejoin 403.
  - Step probe confirmed the server sees the disconnect within 1 s.
- Production per-IP guest limit (10/min) observed working (429 during repeated test runs).
- Local: e2e 10/10, typecheck/lint clean.
- GitHub push of these commits is pending: it needs the owner's GitHub sign-in on this machine.

## Scoring page redesign + calculator (2026-11-18)

- `/learn/scoring` redesigned:
  - Jump-nav chips.
  - 3-step "how a score is built" cards with a worked 4♥ example.
  - Trick-value cards with the game level per strain.
  - Bonus table with a red Vul column.
  - Made-contract table with grouped Non-vul / Vul headers; Game cells gold, Slam cells green, with a legend.
  - Penalty table grouped Non-vul / Vul × undoubled / X / XX.
- New `components/ScoreCalculator.tsx` for scoring over-the-table boards.
  - Inputs: level, strain, X/XX, declarer-side vulnerability, declarer, tricks (slider plus quick −3..+3 buttons).
  - Output: NS/EW score and each item tagged above/below the line with its formula (`explainScore`, engine-backed).
  - Linked from the lobby (`/learn/scoring#calc`).
- Browser checks:
  - 4♥ S non-vul made = NS +420.
  - 3NTX E vul −2 = NS +500 (200 + 300).
  - No horizontal overflow at 375px.
  - typecheck/lint clean, unit tests pass, build OK.

## Mini Bridge mode (2026-11-18)

- Engine `packages/game-engine/src/minibridge.ts`:
  - HCP (A4 K3 Q2 J1). The side with more than 20 points declares; its player with more points is declarer, and a tie goes to the seat nearer the dealer clockwise. A 20–20 deal is passed out (0).
  - Dummy is face up before the contract is chosen (`PlayState.dummyFaceUp`). The declarer picks the denomination and part-score (1-level) or game (3NT / 4M / 5m). There is no doubling, and declarer's LHO leads.
  - Standard duplicate scoring.
  - New board phase `DECLARING`. The projector exposes `mini` (public HCP + declarer) and `miniChoices` only to the declarer.
  - `test/minibridge.test.ts` (7 tests).
- Room schema v4 adds `mode: 'CLASSIC' | 'MINI'`; older rooms migrate to CLASSIC.
  - `POST /rooms` accepts `mode`; new command `mini:declare {strain, game}`; room phase `DECLARING`.
  - A 20–20 deal (start or next board) is recorded like any finished board.
  - Bot declarer: 8+ card fit (majors first) else NT; game with 25+ combined points.
  - `worker/room/mini-room.test.ts` (5 tests): projection to all seats, declarer-only choice, full bot match, 20–20 recording, bot choice.
- UI:
  - Lobby mode picker (Contract Bridge / Mini Bridge); mode badge in the waiting room.
  - `MiniPanel`: HCP table per side with the declarer marked, a waiting message, and the declarer's chooser (strain, part-score/game with level and tricks needed, hint). The auction panel is hidden in Mini.
- Browser (local, port 5174, 1 human + 3 dev bots, 8-board Mini room):
  - Bot declarer boards.
  - A 20–20 board shown as passed out.
  - Human declarer on board 6: chooser shown, 1NT chosen, W led, play continued from dummy.
- Checks: typecheck/lint clean. Unit web 65, engine 97 (branches 93.26%), shared 5. e2e 10/10. Build OK.
- Dev note: another local app was occupying port 5173, so `.claude/launch.json` gained `web-5174`. The e2e and bot scripts take `E2E_BASE_URL`.

## Rubber Bridge mode (2026-11-18)

- Engine `packages/game-engine/src/rubber.ts`:
  - Contract trick points go below the line toward game (100). A game resets both sides' part-scores.
  - Above the line: overtricks, slam, the bonus for making a doubled/redoubled contract, undertrick penalties (to the defenders) and honors. Honors count for whoever holds them, defenders included: 4 trump honors 100, 5 = 150, four aces at NT 150.
  - Vulnerability comes from games won. The first side to two games wins: +700 for 2–0, +500 for 2–1. Passed-out deals are not scored.
  - Values shared with duplicate come from `scoreBreakdown`; there is no per-deal game/part-score bonus.
  - `test/rubber.test.ts` (8 tests).
- Room schema v5 adds `rubber: RubberState | null`; mode `RUBBER` = one rubber.
  - The dealer rotates by deal number; board vulnerability comes from the rubber.
  - Each finished deal stores its rubber score in `FinishedBoard.rubber`. Its `nsScore` is the deal's NS−EW change, and the final deal includes the rubber bonus, so D1 board rows sum to the sheet.
  - The match ends when the rubber has a winner (MATCH_END outbox write).
  - `worker/room/rubber-room.test.ts`: plays deals until the rubber ends; checks vulnerability per deal, dealer rotation, the 500/700 bonus, that board sums equal the sheet totals, and the MATCH_END write.
- UI:
  - Lobby mode picker: Contract / Mini / Rubber (board count hidden for Rubber); waiting room shows "1 Rubber".
  - `RubberSheet`: NS | EW columns, games won with Vul badge, above-line items with labels, below-line contract points per game, totals, points still needed for game, winner line.
  - The result dialog shows the deal's rubber breakdown and a rules summary instead of the duplicate breakdown.
- Browser (local 5174, 1 human + 3 dev bots): three deals scored correctly on the sheet (1NT −3 → EW 150 above; 1NT +2 → NS 40 below + 60 above; EW 200 penalty; totals 100 / 350; "NS needs 60").
- Checks: typecheck/lint clean. Unit web 66, engine 105 (branches 92.43%), shared 5. e2e 10/10. Build OK.
