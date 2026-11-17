# TEST_PLAN — Automated correctness, isolation, end-to-end

## Recommended test pyramid

1. **Game engine unit tests** — Vitest (pure TypeScript), deterministic test fixtures, exhaustive boundary cases.
2. **Server/DO integration tests** — actual Workers local runtime via supported Cloudflare testing tools; D1 bindings, multiple WS clients, DO persistence.
3. **Browser e2e** — Playwright with 4 isolated browser contexts (N/E/S/W), separate cookies/identities, mobile viewport variant.
4. **Production smoke** — real Cloudflare deployed URL with 4 physical devices or isolated contexts; no secrets logged.

## Phase 1 rule suites

| Suite | Cases |
|---|---|
| Deal | 52 unique cards; 13/seat; no invalid rank; deterministic fixture; server-only visibility |
| Board | Dealer every board; full 16-vulnerability schedule; wrap to board 17 |
| Bid ordering | All 35 bids; higher bid lawful; same/lower bid unlawful; 1S->1NT, 1NT->2C |
| Calls | PASS legal on turn; Double by opponent only; Redouble by owners only; new bid resets status |
| Auction end | 4 all-pass passed out; 3 passes after last nonpass; passes interrupted by bids/doubles |
| Declarer | first bidder of final strain on winning partnership; opening leader LHO |
| Dummy | concealed until opening lead; player cannot self-play dummy; declarer can play on dummy turn |
| Card play | follow suit mandatory; void allows any card; NT/trump winners; 13 tricks exactly |
| Scoring | golden vectors and broad matrix for suits/levels/vulnerability/double/make/down |
| Signed scores | if EW declares, NS is negative of EW declaring result; passed out zero |

## Golden scoring assertions

```ts
expect(score({ level:4,strain:'S',doubled:'NONE',vulnerable:false,tricks:10 })).toBe(420);
expect(score({ level:4,strain:'S',doubled:'NONE',vulnerable:true,tricks:10 })).toBe(620);
expect(score({ level:3,strain:'NT',doubled:'NONE',vulnerable:false,tricks:9 })).toBe(400);
expect(score({ level:2,strain:'H',doubled:'DOUBLE',vulnerable:false,tricks:8 })).toBe(470);
expect(score({ level:4,strain:'S',doubled:'DOUBLE',vulnerable:false,tricks:8 })).toBe(-300);
expect(score({ level:7,strain:'NT',doubled:'NONE',vulnerable:true,tricks:13 })).toBe(2220);
```

These are **specifications**, not executable code until functions/types are implemented; adapt exact API names.

## Multiplayer integration matrix

- 4 distinct identities join same room; fifth cannot take seat; 2 simultaneous requests for same seat -> one winner.
- 4 separate sockets receive own 13 cards only; no payload contains another hidden hand.
- Only current bidder can call; only proper actor can play from current seat; declarer can control dummy but no one else.
- Restart/recreate DO instance while preserving storage; reconnect restores same board, hands, auction, turn, version.
- Concurrent repeated `requestId` -> one transition; stale `expectedVersion` -> error+snapshot.
- Network drop during `auction:call` and `card:play` with retry -> no double action.
- Passed-out board -> no card play, zero result stored once.
- Correct board completion -> exactly 52 played cards and 13 tricks, D1 result row exactly once.
- Inject D1 write failure after finishing board -> pending DO outbox eventually retries without duplicate/mismatched score.
- Origin mismatch, expired/forged session, malformed JSON, huge frame, invalid card -> errors without room corruption.

## Four-browser e2e happy path

1. Open 4 isolated browser contexts, create 4 guest identities.
2. Host creates room, copies code; other three join; each claims distinct seat.
3. All Ready, start board 1; assert each has 13 cards and no unauthorized private payload.
4. Deterministic test fixture lets game proceed with accepted legal auction and 13 tricks. Drive clicks through UI.
5. During trick 3 refresh one client and reconnect; assert same hand and current state.
6. Assert exact contract, declarer, trick counts and score.
7. Next board starts with dealer/vulnerability shift, no stale ready states.
8. Finish target boards; assert summary and D1 persisted idempotent results.

## CI required commands (actual scripts may differ)

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
```

Use actual package.json scripts. If a command is absent, add script and implement it rather than claiming success. Record exact outcomes in `PROJECT_STATE.md`.

## Definition of Done

All critical rules and security tests green; no unhandled client error during full game; 4 players can complete the game on the deployed Worker; refresh/reconnect preserves state; no secret cards leak; D1 summaries consistent; CI passes; URL and smoke test evidence recorded.
