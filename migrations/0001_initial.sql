-- Migration 0001: identity, sessions, room directory, match results (docs/DATABASE_SCHEMA.md §2)

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
