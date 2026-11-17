# DATABASE_SCHEMA — D1 + Durable Object storage contract

## 1. Ownership

- **D1**: identity, secure session hash, room directory, match/board results, player aggregate statistics (later).
- **Room Durable Object**: seat reservations, ready flags, hidden hands, bids, current trick, full play log, phase, version, authoritative score, dedup log and pending D1 writes.
- D1 room listing is an eventual mirror; **it must not be consulted as the sole authority for entering/controlling seats**.

## 2. D1 draft tables (MVP)

Use SQL migrations generated inside `migrations/` and compatible with Cloudflare D1. Prefer ISO 8601 UTC strings or integer epoch consistently; below uses ISO8601 TEXT. Avoid storing raw session tokens.

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('guest','registered')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  host_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('waiting','active','completed','archived')),
  max_players INTEGER NOT NULL DEFAULT 4 CHECK (max_players=4),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_rooms_host_user_id ON rooms(host_user_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  status TEXT NOT NULL CHECK (status IN ('active','completed','abandoned')),
  target_board_count INTEGER NOT NULL CHECK(target_board_count BETWEEN 1 AND 16),
  started_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_matches_room_id ON matches(room_id);

CREATE TABLE IF NOT EXISTS match_players (
  match_id TEXT NOT NULL REFERENCES matches(id),
  seat TEXT NOT NULL CHECK(seat IN ('N','E','S','W')),
  user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY(match_id, seat),
  UNIQUE(match_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_match_players_user_id ON match_players(user_id);

CREATE TABLE IF NOT EXISTS board_results (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  board_number INTEGER NOT NULL CHECK(board_number >= 1),
  dealer TEXT NOT NULL CHECK(dealer IN ('N','E','S','W')),
  vulnerability TEXT NOT NULL CHECK(vulnerability IN ('NONE','NS','EW','BOTH')),
  declarer_seat TEXT CHECK(declarer_seat IN ('N','E','S','W')),
  contract_level INTEGER CHECK(contract_level BETWEEN 1 AND 7),
  contract_strain TEXT CHECK(contract_strain IN ('C','D','H','S','NT')),
  double_state TEXT NOT NULL CHECK(double_state IN ('NONE','DOUBLE','REDOUBLE')),
  declarer_tricks INTEGER CHECK(declarer_tricks BETWEEN 0 AND 13),
  ns_score INTEGER NOT NULL,
  finished_at TEXT NOT NULL,
  UNIQUE(match_id, board_number)
);
CREATE INDEX IF NOT EXISTS idx_board_results_match_id ON board_results(match_id);
```

**Schema semantics**:

- `room_members` is **not needed as an authoritative D1 table in MVP**. DO persists live members and seats. `match_players` is an immutable start-of-match snapshot for historical result authorization; it does not grant real-time seat control. A read-only live member mirror is optional later.
- Passed-out board must have `contract_level`, `contract_strain`, `declarer_seat`, `declarer_tricks` NULL, `ns_score=0`, `double_state='NONE'`.
- `board_results.id` must be stable across retries (e.g. deterministic UUID from matchId/boardNo or persisted generated ID). `UNIQUE(match_id, board_number)` prevents duplicate result rows.
- For production, do not blindly overwrite an existing conflicting score during result retries; detect differing payload and raise an integrity alarm.
- Session `token_hash` may be SHA-256 of a cryptographically random 256-bit bearer secret; store only hash, cookie contains raw secret; token hash compare and expiry server-side.
- Guest accounts can eventually be pruned only after retention policies and no active room membership; hard deletion without consideration of historical references is unsafe.

## 3. DO room snapshot layout (logical, not binding to one SQL design)

```ts
type RoomState = {
  schemaVersion: number;
  roomId: string;
  code: string;
  hostUserId: string;
  phase: 'WAITING'|'DEALING'|'BIDDING'|'PLAYING'|'BOARD_RESULT'|'NEXT_BOARD_READY'|'MATCH_COMPLETED';
  version: number;
  members: Partial<Record<'N'|'E'|'S'|'W', { userId: string; ready: boolean }>>;
  matchId: string | null;
  currentBoard: PrivateBoardState | null; // includes all secret hands: DO ONLY
  completedBoards: FinishedBoardResult[];
  processedRequests: ProcessedRequestRecord[];
  pendingResultWrites: PendingResultWrite[];
};
```

**DO storage keys** suggested: `room:state`, `room:schema-version`, `room:created-at`; persist canonical state and dedup metadata atomically, and add a snapshot migration mechanism for future releases. For huge long-lived logs, compact old action history after each finished board while retaining enough for recovery/integrity.

## 4. Consistency rules

- A seat claim uses DO serialized authorization; never D1 `SELECT then INSERT` as real-time seat lock.
- Do not duplicate all hidden hands to D1.
- Server builds response projections with allowlisted fields, never spreads the full private `RoomState` into outbound JSON.
- D1 deployment migrations applied explicitly locally first and reviewed before `--remote`. Never put real `database_id` or secrets in committed sample docs.
