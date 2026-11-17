/**
 * DO → D1 outbox flush. There is no transaction spanning DO storage and D1, so
 * every write is idempotent (stable ids, ON CONFLICT DO NOTHING) and retried
 * until confirmed. A conflicting existing board row is never overwritten.
 */
import type { PendingWrite } from './room-state';

export interface SqlStatement {
  readonly sql: string;
  readonly params: readonly (string | number | null)[];
}

/** Minimal store abstraction: D1 in production, node:sqlite in tests. */
export interface ResultStore {
  /** Execute statements atomically (D1 batch = implicit transaction). */
  batch(statements: readonly SqlStatement[]): Promise<void>;
  first<T>(sql: string, params: readonly (string | number | null)[]): Promise<T | null>;
}

const DOUBLE_STATE = ['NONE', 'DOUBLE', 'REDOUBLE'] as const;

export const statementsFor = (w: PendingWrite): SqlStatement[] => {
  switch (w.kind) {
    case 'MATCH_START':
      return [
        {
          sql: `INSERT INTO matches (id, room_id, status, target_board_count, started_at)
                VALUES (?, ?, 'active', ?, ?) ON CONFLICT(id) DO NOTHING`,
          params: [w.matchId, w.roomId, w.targetBoards, w.at],
        },
        ...w.players.map((p) => ({
          sql: 'INSERT INTO match_players (match_id, seat, user_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
          params: [w.matchId, p.seat, p.userId],
        })),
        {
          sql: `UPDATE rooms SET status = 'active', updated_at = ? WHERE id = ? AND status = 'waiting'`,
          params: [w.at, w.roomId],
        },
      ];
    case 'BOARD_RESULT': {
      const b = w.board;
      const r = b.result;
      const played = r.kind === 'PLAYED' ? r : null;
      return [
        {
          sql: `INSERT INTO board_results (id, match_id, board_number, dealer, vulnerability, declarer_seat,
                  contract_level, contract_strain, double_state, declarer_tricks, ns_score, finished_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
          params: [
            w.id,
            w.matchId,
            b.boardNumber,
            b.dealer,
            b.vulnerability,
            played?.contract.declarer ?? null,
            played?.contract.level ?? null,
            played?.contract.strain ?? null,
            played ? DOUBLE_STATE[played.contract.doubled] : 'NONE',
            played?.declarerTricks ?? null,
            r.nsScore,
            w.at,
          ],
        },
      ];
    }
    case 'MATCH_END':
      return [
        {
          sql: `UPDATE matches SET status = 'completed', completed_at = ? WHERE id = ? AND completed_at IS NULL`,
          params: [w.at, w.matchId],
        },
        {
          sql: `UPDATE rooms SET status = 'completed', updated_at = ? WHERE id = ? AND status IN ('waiting','active')`,
          params: [w.at, w.roomId],
        },
      ];
  }
};

export interface FlushResult {
  /** Ids confirmed in D1 (safe to drop from the outbox). */
  readonly done: Set<string>;
  /** First failure, if any; later writes are not attempted (FK ordering). */
  readonly error: unknown;
  /** Board rows that already existed with a different score (integrity alarm). */
  readonly conflicts: string[];
}

/** Flush in order; stop at the first failure so dependent rows are never written out of order. */
export const flushWrites = async (store: ResultStore, writes: readonly PendingWrite[]): Promise<FlushResult> => {
  const done = new Set<string>();
  const conflicts: string[] = [];
  for (const w of writes) {
    try {
      await store.batch(statementsFor(w));
      if (w.kind === 'BOARD_RESULT') {
        const row = await store.first<{ id: string; ns_score: number }>(
          'SELECT id, ns_score FROM board_results WHERE match_id = ? AND board_number = ?',
          [w.matchId, w.board.boardNumber],
        );
        if (!row) throw new Error('board result not visible after write');
        if (row.id !== w.id || row.ns_score !== w.board.result.nsScore) conflicts.push(w.id);
      }
      done.add(w.id);
    } catch (error) {
      return { done, error, conflicts };
    }
  }
  return { done, error: null, conflicts };
};

/** Retry delay for the n-th consecutive failure (capped at 10 minutes). */
export const retryDelayMs = (attempt: number): number => Math.min(10 * 60_000, 2_000 * 2 ** Math.max(0, attempt));
