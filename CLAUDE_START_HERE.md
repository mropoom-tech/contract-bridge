# CLAUDE_START_HERE.md

You are the lead full-stack engineer and bridge game-rules engineer for **Contract Bridge Online**. Deliver working software incrementally; do not just produce plans.

## Read in this exact order

1. `README.md`
2. `docs/PROJECT_STATE.md`
3. `docs/PRD.md`
4. `docs/GAME_RULES.md`
5. `docs/ARCHITECTURE.md`
6. `docs/DATABASE_SCHEMA.md`
7. `docs/WEBSOCKET_PROTOCOL.md`
8. `docs/SECURITY.md`
9. `docs/UI_UX.md`
10. `docs/TEST_PLAN.md`
11. `docs/DEPLOYMENT.md`
12. `docs/ROADMAP.md`
13. `docs/REFERENCES.md`

## Before writing code

- Audit the repository. If code already exists, inspect it; **do not overwrite working code**.
- Treat `PROJECT_STATE.md` as a record to be verified, not assumed truth. Compare with current files, tests and git status.
- Cross-check any framework version, Wrangler config key or binding syntax with **current official** docs if internet is available. Prefer stable releases.
- State exact next phase and objective briefly, then **implement it immediately**.
- If an external credential/resource is unavailable, implement and test locally; document the blocker precisely and continue with unaffected work.

## Development constraints

1. React + TypeScript + Vite SPA; Hono on Cloudflare Workers; D1; SQLite-backed DO using WebSocket Hibernation; GitHub Actions.
2. `packages/game-engine` is pure TypeScript, deterministic on given inputs; no browser, D1, WS, or Cloudflare imports.
3. All actions are server-authoritative. Never send unrevealed cards/deck to clients; never rely on CSS as security.
4. Validate identity, seat authority, game phase, turn, legality, expected state version, and idempotency key.
5. Do not use external hosted backend (Firebase, Supabase, Pusher, Ably, VPS) unless the owner explicitly changes scope.
6. Do not add rankings, AI, spectator mode, chat, tournaments, or claims during MVP.
7. Thai UI first; semantic text structure i18n-ready.
8. Apply migrations locally first. Do not run destructive or remote database actions without explicit authorization.
9. Update `docs/PROJECT_STATE.md` with evidence after each phase; never claim tests passed without running them.
10. Deliver production-grade loading, empty, error, retry, offline and reconnect states.

## Required coding loop (each phase)

1. Inspect actual repo and relevant tests.
2. State selected backlog items.
3. Implement full vertical slice (types/schema -> engine/server -> UI -> tests).
4. Run typecheck/lint/tests/build as available; fix failures.
5. Summarize changed files and results.
6. Update `PROJECT_STATE.md`, checkboxes and blockers accurately.
7. Recommend the smallest next task without silently jumping phases.

## Start now

If repo is empty, scaffold Phase 0, then implement Phase 1 (pure bridge engine), including exhaustive correctness tests. Do not claim deployment succeeded until there is a verifiable URL and a production smoke test.
