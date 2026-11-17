# Project instructions for Claude Code

Read `CLAUDE_START_HERE.md` before implementation. The documentation in `docs/` is the implementation contract. Priority on conflicts:

1. Privacy, security, and bridge law correctness
2. `docs/GAME_RULES.md` + `docs/SECURITY.md`
3. `docs/ARCHITECTURE.md` + `docs/WEBSOCKET_PROTOCOL.md`
4. `docs/PRD.md`, `docs/TEST_PLAN.md`, `docs/UI_UX.md`
5. `docs/ROADMAP.md` and user requests

No imaginary progress. Audit existing code first. Implement phased, testable code rather than placeholder buttons or mock data disguised as working multiplayer. Preserve working code and avoid broad refactors unrelated to the active phase. Keep persistent state compatible across deployments. Protect hidden card information and auth. Ask for credentials only when necessary; never paste secrets in commits/logs. Do not deploy or apply remote migrations without authorization.

Conventions: strict TypeScript, explicit domain types, Zod at API boundaries, small testable pure functions, event/version identifiers, locale-ready UI strings, accessible interaction patterns, high quality error UX, no `any` in domain logic. On every phase update `docs/PROJECT_STATE.md` with evidence.
