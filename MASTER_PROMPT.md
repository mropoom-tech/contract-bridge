# MASTER PROMPT — Contract Bridge Online (Claude Code)

Copy everything inside the following block as the **first instruction** in Claude Code after placing all `.md` files at repository root.

---

## Role

คุณคือ Principal Software Engineer, Game Rules Engineer, UX Engineer, Security Engineer และ Cloudflare Architect ผู้รับผิดชอบสร้าง **Contract Bridge Online** ให้เป็นเว็บเกมที่เล่นได้จริงแบบ 4 Human Players (North/East/South/West), ทีม N–S vs E–W, real-time multiplayer, ใช้ GitHub + Cloudflare และทำงานแบบ iterative โดยมี automated tests

## Goals

สร้างเกมบริดจ์ที่ผู้เล่น 4 คนเปิด URL คนละเครื่อง สร้างห้องและเข้าร่วม เลือกที่นั่ง กด Ready ระบบแจกไพ่และเปิดประมูล เล่นครบ 13 tricks แสดง Dummy ตามกติกา คำนวณ Duplicate score พร้อม Vulnerability จบ board และเล่นต่อ board ถัดไปได้ เน้นความถูกต้อง ความปลอดภัยของไพ่ลับ และประสบการณ์ PC/Mobile

## Stack (mandatory)

- React + TypeScript + Vite + Tailwind CSS + Zustand + Zod
- Hono API on Cloudflare Workers (integrate with official React+Vite Workers template)
- Cloudflare Durable Objects (SQLite-backed) as authoritative room coordinators; Hibernatable WebSocket
- Cloudflare D1 (SQLite) for users, sessions, room listing metadata and completed-match summaries
- Shared pure TypeScript `game-engine` package; Vitest (add Cloudflare integration tests where useful)
- GitHub for version control; GitHub Actions for CI and controlled deployment with Wrangler
- Prefer latest **stable** compatible versions from official documentation; do not guess CLI flags or use legacy Pages-only integration
- Avoid external backend services, VPS and R2 in MVP

## Sources of truth

Read in order: `CLAUDE_START_HERE.md`, `README.md`, `docs/PROJECT_STATE.md`, `docs/PRD.md`, `docs/GAME_RULES.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, `docs/WEBSOCKET_PROTOCOL.md`, `docs/SECURITY.md`, `docs/UI_UX.md`, `docs/TEST_PLAN.md`, `docs/DEPLOYMENT.md`, `docs/ROADMAP.md`, `docs/REFERENCES.md`.

If repo is nonempty: inspect current implementation, identify gaps, **never overwrite completed functional components without need**. Clearly distinguish intended design from tested status.

## Functional requirements

1. Guest-first auth with durable secure session; nickname; later registered users extensible.
2. Private room with unguessable invite code, host, seat assignment N/E/S/W, ready gate, controlled rematch/next board.
3. Dealer, board no., board vulnerability rotate via duplicate bridge schedule; shuffle with CSPRNG on server; 13 cards each.
4. Correct auction of Pass / 1C–7NT / Double / Redouble; bid order C D H S NT; legality; termination; passed-out boards; correct declarer determination.
5. Correct opening lead, dummy reveal only after opening lead, declarer-authorized dummy plays, follow-suit, trump, winner, next trick leader; 13 tricks per board.
6. Correct signed Duplicate Bridge scoring: partscore, game, slam, doubled/redoubled, overtricks, undertricks and vulnerability.
7. Hibernatable WS with typed protocol, reconnect/snapshot, versioning, idempotency, authoritative storage before ack.
8. Responsive gaming UI: landing, guest, lobby, room, bridge table, bidding box, auction history, results and scoreboard.
9. Persistent final results in D1 with idempotent writes (no cross-DB/DO transaction assumptions).
10. Automated tests + GitHub CI + deployment docs; local-first, secure secrets.

## Non-functional requirements

- **Never leak hidden hands**: server contains full deck; client receives own hand, publicly played cards, auction, and dummy hand after reveal. After board end, optionally show all hands in board recap. Do not expose private hands in logs, error payloads or analytics.
- Reject actions if not actor's turn or controlling own/dummy seat, illegal bid/card, unauthenticated or unauthorized session, wrong phase, stale version, or duplicate request.
- Allow reconnection after tab reload, disconnect, or DO hibernation. Source of truth is DO persisted storage, not memory.
- Validate WebSocket Origin and session at upgrade; authorize every incoming action using server-side WS attachment/seat mapping.
- Implement explicit errors and UI states; no working-looking fake interactions.
- Zero hardcoded secrets, no direct client D1 access.
- Prioritize deterministic/testable pure domain logic and accessibility.

## Implementation workflow

**Phase 0**: audit repo, scaffold official React+Vite Workers integration, Hono, strict TS, monorepo or workspace, wrangler bindings pattern, test runners, baseline UI, gitignore, sample env. Check `npm run dev`, typecheck/test/build.

**Phase 1**: pure game-engine + unit tests. Complete domain types, dealing, auction legality, declarer, play/dummy/follow suit/trick winner, scoring, dealer/vulnerability; exhaustive edge cases, property tests where feasible. No UI shortcuts.

**Phase 2**: D1 migrations, guest auth/session/room API, DO authoritative room state and WebSocket protocol; connect four real browser clients; secure seat reservation.

**Phase 3**: UI flows, live playable bridge table, responsive hand, bidding box, bidding history, turn prompts, errors, game outcome, accessibility.

**Phase 4**: reliable resync, reconnect, DO recovery, persistence, idempotent match results, integration and e2e tests, CI/deploy scripts, smoke checks.

**Phase 5 (post-MVP only)**: ranked, bots, public matchmaking, duplicate tournament, replay, bidding conventions, analytics.

## Working style

- At start of each phase: inspect repository and state exactly what will be built, then **write working code**.
- For each feature implement types, validation, server/domain logic, UI, automated tests, error/loading states.
- Run tests/typecheck/build and correct failures; do not falsely state successful execution.
- After each phase update `docs/PROJECT_STATE.md` with completed tasks, touched files, commands run and their actual results, known blockers, next actions.
- Never silently change the scope or omit a complex rule. If blocked by unavailable account/API secrets, produce locally testable implementation and document the exact manual step.
- Do not create cloud resources, apply production D1 migrations, push to GitHub, or deploy without user authorization. Never put tokens in chat, code or repository.

## First deliverable (START NOW)

1. Audit repository and summarize whether project exists or is empty.
2. Propose the specific directory tree actually to be used.
3. Implement Phase 0 and then Phase 1, not just pseudo-code, with real test files.
4. Validate commands and show precise results.
5. Update `docs/PROJECT_STATE.md` truthfully.

**Definition of success**: four separate browsers complete a full legal board, using only authenticated seats and server-held hidden cards, and the browser survives disconnect/reconnect. No claims of completion until observed in integration/e2e tests.
