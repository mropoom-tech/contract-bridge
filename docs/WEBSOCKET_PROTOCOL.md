# WEBSOCKET_PROTOCOL — Bridge realtime protocol v1

## 1. Transport & authority

- Same-origin HTTPS REST for guest auth, room creation/join/list; WSS endpoint `/api/rooms/:roomCode/ws` for authoritative gameplay.
- Main Worker validates secure HttpOnly cookie, request Origin, room membership and seat on upgrade, then forwards authenticated context over internal DO channel; DO revalidates role with persisted seat mapping.
- Browser WebSocket cannot set arbitrary Authorization headers; **do not put a long-lived bearer secret in query string**. Use same-site secure cookie and Origin validation.
- All messages JSON, UTF-8, `protocolVersion: 1`; enforce max length, rate limits, strict schema (Zod), and error responses with safe code/detail.
- Only DO broadcasts authoritative state. No direct client-to-client event acceptance.

## 2. Envelope

### Client command

```json
{
  "protocolVersion": 1,
  "requestId": "9d75cde9-7d59-4bde-b99b-edf7d75ac6d9",
  "expectedVersion": 12,
  "type": "auction:call",
  "payload": { "kind": "BID", "level": 1, "strain": "S" }
}
```

`requestId` generated once per user intent and reused on retry. `expectedVersion` is authoritative room version last confirmed on that client. Server derives acting identity/seat from its session, never trusts `userId` in payload.

### Server acknowledgement

```json
{
  "protocolVersion": 1,
  "type": "command:ack",
  "requestId": "9d75cde9-7d59-4bde-b99b-edf7d75ac6d9",
  "stateVersion": 13,
  "status": "accepted"
}
```

### Server rejection

```json
{
  "protocolVersion": 1,
  "type": "command:error",
  "requestId": "9d75cde9-7d59-4bde-b99b-edf7d75ac6d9",
  "stateVersion": 13,
  "code": "NOT_YOUR_TURN",
  "message": "ยังไม่ถึงตาของคุณ"
}
```

`STATE_CONFLICT` must include current `stateVersion` and cause client to request/reconcile a fresh seat-specific snapshot. Duplicate `requestId` must resend original ack/error without replaying the action.

## 3. Commands (Client -> DO)

| Type | Payload | Auth/phase | Effect |
|---|---|---|---|
| `room:claimSeat` | `{ seat: 'N'|'E'|'S'|'W' }` | Member/WAITING, seat vacant | Seat claim |
| `room:ready` | `{ ready: boolean }` | Claimed seat, WAITING/NEXT_BOARD_READY | Toggle ready |
| `room:start` | `{}` | Host, 4 seats ready | Begin board/session |
| `auction:call` | `{ kind:'PASS' }` | Current bidder/BIDDING | Pass |
| `auction:call` | `{ kind:'BID', level:1..7, strain:'C'|'D'|'H'|'S'|'NT' }` | Current bidder/BIDDING | Bid |
| `auction:call` | `{ kind:'DOUBLE'|'REDOUBLE' }` | Current bidder/BIDDING | Call |
| `card:play` | `{ fromSeat:'N'|'E'|'S'|'W', card:'AS' }` | PLAYING and authorized owner/declarer | Play 1 card |
| `board:readyNext` | `{ ready:boolean }` | BOARD_RESULT / NEXT_BOARD_READY | Next-board ready |
| `room:leave` | `{}` | WAITING or explicit end policy | Leaves seat / closes as specified |
| `state:requestSnapshot` | `{}` | Authenticated room member | Resync read only; no mutation |

**Control of dummy:** sender must be Declarer identity if `fromSeat === dummySeat`; if `fromSeat === ownSeat`, normal acting-seat rules apply. Dummy's connected account never has authority to play dummy cards once playing begins.

## 4. Events (DO -> Client)

| Event | Data (selected) | Visibility |
|---|---|---|
| `session:snapshot` | seat-specific `ViewState`, `stateVersion` | recipient only |
| `room:presence` | seats, online statuses, ready, host | room public |
| `board:started` | boardNo, dealer, vulnerability, handCount, own hand | **personalized per seat** |
| `auction:updated` | accepted call, bidder, auction history, next seat | all players |
| `contract:decided` | level, strain, dbl status, declarer, dummy, openingLeader | all players |
| `card:played` | fromSeat, public card, trick index | all players |
| `dummy:revealed` | dummy seat, its 13 cards adjusted for opening lead state | all players after lead |
| `trick:completed` | trick cards, winner, team trick tally | all players |
| `board:completed` | board result, scoring breakdown, NS signed score | all players |
| `match:completed` | session boards and aggregate | all players |
| `command:ack/error` | request ID, version, result | requesting player |

Important: `board:started` contains **different data for each seat**. Never `broadcast(JSON.stringify(fullRoomState))`. A player that reconnects should receive projection as of current game phase, not replay full secret events.

## 5. ViewState projection

```ts
type PublicViewState = {
  roomId: string;
  phase: GamePhase;
  version: number;
  members: Array<{ seat: Seat; displayName: string; online: boolean; ready: boolean }>;
  boardNumber: number | null;
  dealer: Seat | null;
  vulnerability: Vulnerability | null;
  turnSeat: Seat | null;
  auctionHistory: PublicCall[];
  contract: PublicContract | null;
  dummySeat: Seat | null;
  dummyCards: Card[] | null;  // must remain null until opening lead
  cardCounts: Record<Seat, number>;
  currentTrick: PublicPlayedCard[];
  completedTricks: PublicTrick[];
  nsScore: number | null;
  result: PublicBoardResult | null;
};

type SeatSpecificSnapshot = {
  public: PublicViewState;
  you: { userId: string; seat: Seat | null; yourHand: Card[] };
  allowedActions: AllowedActionDescriptor[];
};
```

`allowedActions` is a UI convenience only. Server must redo full checks for every requested action.

## 6. Version, ordering, reliability

- Monotonic per-room version increments once per successfully committed logical mutation.
- For reconnect: WS handshake -> `session:snapshot` with current version -> client replaces derived room state, discards stale transient events.
- For duplicate retries: persist per-user requestId with ack metadata; retry sends same ack, not duplicate card.
- For conflicting requests: reject stale version and force sync. Do **not** reorder historical actions in client to hide bugs.
- Protect against overlapping browser tabs sharing one session; define only one active control connection per seat, or keep safe idempotency across tabs and indicate active-session change.
- Reconnecting client never triggers a second room join or seat claim.

## 7. Error code set

`UNAUTHENTICATED`, `FORBIDDEN`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `SEAT_TAKEN`, `INVALID_PHASE`, `NOT_YOUR_TURN`, `ILLEGAL_BID`, `ILLEGAL_CARD`, `MUST_FOLLOW_SUIT`, `STALE_VERSION`, `DUPLICATE_REQUEST`, `RATE_LIMITED`, `INVALID_PAYLOAD`, `ROOM_CLOSED`, `INTERNAL_ERROR`.

Document client UX for each error. `DUPLICATE_REQUEST` may be handled as idempotent accepted ack instead of UI error.

## 8. REST endpoints (MVP)

```text
GET    /api/health
POST   /api/auth/guest          {displayName}
GET    /api/auth/me
POST   /api/auth/logout
POST   /api/rooms               {targetBoards:4}
GET    /api/rooms/:code
POST   /api/rooms/:code/join
GET    /api/rooms/:code/ws      (WebSocket upgrade)
GET    /api/matches/:id/summary (authorize members only)
```

All mutating HTTP endpoints should require appropriate same-origin origin checks and CSRF protections for cookie-based auth, plus strict Zod validation. D1 is not public.
