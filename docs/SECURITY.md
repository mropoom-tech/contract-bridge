# SECURITY & FAIR PLAY — Threat model and mandatory controls

## 1. Secrets and hidden cards are server-only

- Full deck, undealt cards, all concealed hands and full `PrivateGameState` exist only in DO storage/engine logic.
- Send own hand only to authenticated seat. Dummy cards become room-public **only after** a legal opening lead.
- Never serialize full private state into WS messages, HTTP error output, HTML, React hydration, localStorage, analytics, telemetry or client-accessible logs.
- Require explicit allowlisted per-seat server projection. Test all pairings, including reconnect at each phase.

## 2. Guest auth and sessions

- Create random 256-bit session bearer token via Workers Crypto; store hash only in D1 with user ID/expiry/revocation.
- Browser cookie: `HttpOnly`, `Secure` on HTTPS, `SameSite=Lax` or stricter per interaction, scoped Path, sensible expiration.
- Never use client-supplied userId / seat / host flag as authorization proof. Read identity from verified session on each REST request and WS upgrade.
- A room code is not a password: joining requires valid session and DO admission; codes must be unpredictable.
- Reconnection requires same authenticated identity/session. Regenerate session on security transitions, limit session life.

## 3. WebSocket / request integrity

- Verify `Origin` against configured origin allowlist at upgrade; deny missing/unexpected origins based on deployment policy.
- Authenticate before passing upgrade to DO. Strip caller-forged `X-User-*` and authorization assertions; use trusted internal binding arguments or integrity-protected Worker->DO claims and DO membership verification.
- Use `ctx.acceptWebSocket()` for hibernation; attach minimal identity metadata, keep current member mapping in DO persisted storage.
- Validate message length and rate, UTF-8 JSON parse, schema and enum values, replay/idempotency, version, phase, actor/seat, card ownership, follow-suit and bidding legality.
- Prevent cross-site request forgery on cookie-authenticated REST actions using Origin checking/CSRF strategy. Use HTTPS/WSS only in production.

## 4. Threat cases / negative tests

| Attack | Expected defense |
|---|---|
| Client sends another seat's card | Deny unless authenticated declarer controlling dummy at dummy turn |
| Client sends a card not in legal hand | Deny |
| Client attempts out-of-turn bid | Deny |
| Client calls DOUBLE against own contract | Deny |
| Client sends same requestId twice | Exactly one state transition; same ack |
| Client predicts/guesses another hand | No unauthorized hand in any payload |
| Client refreshes during bidding | Authenticated seat-specific snapshot, no double-action |
| Client connects using another person's room code | Still authenticated; cannot take occupied seat |
| Cross-site JS opens WSS with cookie | Reject invalid Origin |
| Forged `X-User-Id` header | Ignore/strip, derive identity server-side |
| Two tabs compete on same seat | Explicit connection-control policy and version checks |
| Worker crashes during final result write | Persist DO pending write; retry idempotent |
| User submits massive/malformed frame | Reject by size/schema/rate limits without crashing DO |

## 5. Availability and operational safeguards

- Rate limit guest creation, room creation and invalid commands. Bound number of rooms per identity; define expiry and garbage-collection policy.
- Never allow destructive administrative actions without authorization and audit.
- Do not log raw cookies, bearer tokens, entire GameState, hidden cards or database dumps.
- Ignore unsupported arbitrary user HTML, render safe text nicknames, cap length, prevent XSS.
- Configure Cloudflare spending limits/monitoring if available; Free Tier quotas may block operations when exhausted.
- For casual MVP, disconnect pauses action rather than auto-plays cards; show offline state, reconnect instructions, explicit room close policy.
- Pin dependency major versions responsibly; enable automated dependency vulnerability scanning if available.

## 6. Fair play boundaries

Tech prevents clients from receiving hidden hands, but does **not** prevent offline voice coordination, multiple accounts across devices, or human collusion. Do not claim anti-cheat is perfect. Formal tournament-grade measures (self-alert, director, cheating investigations) are outside MVP.

## 7. Security acceptance gate

No production release if secret hands show in another player's WebSocket frames/devtools, if client can successfully issue action from another unauthorized seat, if game continues twice after duplicate requests, or if signed session is not required for seat recovery.
