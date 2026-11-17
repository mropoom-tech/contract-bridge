# ROADMAP — Ship working slices, not mock screens

## Phase 0 — Repository & Cloudflare-ready foundation

- [x] Audit current repo and dependencies; preserve existing code
- [x] Official current-stable Cloudflare React + Vite Workers starter
- [x] Hono API integrated with the generated Worker
- [x] npm workspaces (`apps/web`, `packages/game-engine`; `packages/shared` added in Phase 2)
- [x] Tailwind, Zustand, Zod, Vitest, strict TS, oxlint (scaffold default, used instead of ESLint)
- [ ] Wrangler D1/DO bindings — deferred to Phase 2; status documented in PROJECT_STATE (no fake IDs)
- [x] Local commands pass: install, dev, typecheck, lint, test, build
- [x] README developer setup and `.gitignore` for `.dev.vars`, artifacts, node_modules

**DoD:** landing renders locally, `/api/health` returns success, lint/typecheck/build/test pass.

## Phase 1 — Correct Bridge Engine (highest risk)

- [x] Types: Suit, Strain, Rank, Card, Seat, Partnership, Board, Contract, State, Call
- [x] RNG-safe dealer/deck, deterministically injectable RNG for unit tests
- [x] Board dealer and 16-board vulnerability rotation
- [x] Auction legal calls, passed-out and terminal conditions
- [x] Correct declarer; opening leader; dummy reveal/controlling player
- [x] Follow-suit and winning trick, all 13 tricks, duplicate card detection
- [x] Duplicate scoring + all vulnerability/double levels
- [x] 90%+ meaningful branch coverage on core rules (92.4% branches, enforced threshold)

**DoD:** pure engine passes golden test vectors and edge-case tests with no Cloudflare dependency.

## Phase 2 — Server Multiplayer

- [x] Guest secure cookie session (create, resume, expiry)
- [x] D1 local schema migration; room registry and minimal summary tables (result writes to D1: Phase 4)
- [x] Create room, join by code, choose seat, ready, host rights
- [x] One durable object per room with persisted private full game state
- [x] Hibernatable WS upgrade; per-seat authenticated attachment
- [x] Typed command validation, request idempotency, stateVersion
- [x] Private snapshots; public event fanout (per-seat snapshot per mutation); refuse unauthorized seat or hidden hand
- [x] Four simulation clients over real WebSockets (Node e2e against local dev server)

**DoD:** 4 independent clients join, ready, deal, and exchange lawful calls without leaked hands.

## Phase 3 — Full UI gameplay

- [x] Landing / nickname / rooms / waiting lobby
- [x] Bridge table with rotate-to-self viewpoint + correct seat names
- [x] Hand sorting, playable card highlights, dummy visual
- [x] Auction box legal actions, history, pass/double/redouble
- [x] Trick visualization / previous trick / active player
- [x] Complete board, signed NS score, next board, multi-board scoreboard
- [x] Clear disabled/loading/offline/reconnect/error states (reconnect overlay not yet exercised in a browser)
- [ ] Keyboard, readable card labels, high-contrast and responsive UI — labels, focus rings, live region and 375px layout done; full keyboard/200% zoom/screen-reader audit pending

DoD status: one human (browser) + 3 bots completed a 2-board session (13-trick board + passed-out board) on desktop; mobile layout checked at 375px. A 4-human, 4-board session on real phones is still pending.

**DoD:** real four-player 13-trick board and 4-board session completed on mobile+desktop.

## Phase 4 — Ship & harden

- [x] DO state restore after re-instantiation (unit: structured-clone restore + schema migration; local: full dev-server restart mid-play)
- [x] Client WS retry/backoff, snapshot recovery, duplicate requests
- [x] DO->D1 final summary idempotent write and retry after failure (outbox + alarm backoff; node:sqlite failure-injection tests; e2e reads local D1)
- [x] Auth, origin, rate-limit, no hidden-information regression tests
- [~] GitHub Actions CI, controlled deploy, local/remote D1 migration procedure — workflows written, never run (no GitHub repo yet)
- [ ] Cloudflare release smoke test with 4 devices and live logs redacted — blocked: needs owner's Cloudflare account + authorization
- [ ] Docs, failure playbook and verified production URL — playbook in DEPLOYMENT.md §10; no production URL

**DoD:** successful production smoke tests and no known critical security/rules regressions.

## Deferred Phase 5 — explicitly NOT MVP

- AI players, matchmaking, ranked ELO, spectators, tournament, matchpoint/IMP scoring across tables, PBN, board replay, self-alert/convention settings, disconnect time controls, claim/concede, Rubber Bridge.

## Work order policy

Do not advance a phase just because UI looks finished. Every checked item requires actual code and evidence in `PROJECT_STATE.md`. If task blocked, document exactly what failed and continue independent work.
