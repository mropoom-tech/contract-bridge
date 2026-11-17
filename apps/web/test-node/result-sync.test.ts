/**
 * Outbox flush against a real SQLite database (node:sqlite) loaded with the
 * actual D1 migration, including failure injection and idempotent retries.
 */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { FinishedBoard } from '@bridge/shared';
import { flushWrites, retryDelayMs, type ResultStore } from '../worker/room/result-sync';
import type { PendingWrite } from '../worker/room/room-state';

const MIGRATION = readFileSync(new URL('../../../migrations/0001_initial.sql', import.meta.url), 'utf8');

const setup = () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(MIGRATION);
  const now = '2026-11-17T00:00:00.000Z';
  for (const u of ['u1', 'u2', 'u3', 'u4']) {
    db.prepare("INSERT INTO users VALUES (?, ?, 'guest', ?, ?)").run(u, u, now, now);
  }
  db.prepare("INSERT INTO rooms (id, code, host_user_id, status, created_at, updated_at) VALUES ('r1','ABCD2345','u1','waiting',?,?)").run(now, now);
  let failNext = 0;
  const store: ResultStore = {
    batch: async (stmts) => {
      if (failNext > 0) {
        failNext--;
        throw new Error('injected D1 failure');
      }
      db.exec('BEGIN');
      try {
        for (const s of stmts) db.prepare(s.sql).run(...s.params);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    first: async <T,>(sql: string, params: readonly (string | number | null)[]) => (db.prepare(sql).get(...params) as T) ?? null,
  };
  return { db, store, failTimes: (n: number) => (failNext = n) };
};

const board = (n: number, ns: number): FinishedBoard => ({
  boardNumber: n,
  dealer: 'N',
  vulnerability: 'NONE',
  result:
    ns === 0
      ? { kind: 'PASSED_OUT', nsScore: 0, ewScore: 0 }
      : {
          kind: 'PLAYED',
          contract: { level: 4, strain: 'S', doubled: 1, declarer: 'N', dummy: 'S', openingLeader: 'E' },
          declarerTricks: 10,
          declarerScore: ns,
          nsScore: ns,
          ewScore: -ns,
        },
});

const AT = '2026-11-17T01:00:00.000Z';
const writes: PendingWrite[] = [
  {
    kind: 'MATCH_START', id: 'm1:start', matchId: 'm1', roomId: 'r1', targetBoards: 2, at: AT,
    players: [{ seat: 'N', userId: 'u1' }, { seat: 'E', userId: 'u2' }, { seat: 'S', userId: 'u3' }, { seat: 'W', userId: 'u4' }],
  },
  { kind: 'BOARD_RESULT', id: 'm1:board:1', matchId: 'm1', board: board(1, 590), at: AT },
  { kind: 'BOARD_RESULT', id: 'm1:board:2', matchId: 'm1', board: board(2, 0), at: AT },
  { kind: 'MATCH_END', id: 'm1:end', matchId: 'm1', roomId: 'r1', at: AT },
];

describe('D1 outbox flush', () => {
  it('writes match, players, results and statuses', async () => {
    const { db, store } = setup();
    const r = await flushWrites(store, writes);
    expect(r.error).toBeNull();
    expect([...r.done]).toEqual(writes.map((w) => w.id));
    expect(db.prepare('SELECT status, completed_at FROM matches').get()).toEqual({ status: 'completed', completed_at: AT });
    expect(db.prepare('SELECT count(*) AS n FROM match_players').get()).toEqual({ n: 4 });
    expect(db.prepare('SELECT status FROM rooms').get()).toEqual({ status: 'completed' });
    expect(db.prepare('SELECT board_number, double_state, contract_level, declarer_seat, ns_score FROM board_results ORDER BY board_number').all()).toEqual([
      { board_number: 1, double_state: 'DOUBLE', contract_level: 4, declarer_seat: 'N', ns_score: 590 },
      { board_number: 2, double_state: 'NONE', contract_level: null, declarer_seat: null, ns_score: 0 },
    ]);
  });

  it('stops at the first failure, then a retry completes without duplicates', async () => {
    const { db, store, failTimes } = setup();
    const first = await flushWrites(store, writes.slice(0, 1));
    expect(first.done.has('m1:start')).toBe(true);
    failTimes(1);
    const failed = await flushWrites(store, writes.slice(1));
    expect(failed.error).toBeInstanceOf(Error);
    expect(failed.done.size).toBe(0); // nothing after the failure was attempted
    expect(db.prepare('SELECT count(*) AS n FROM board_results').get()).toEqual({ n: 0 });
    const retry = await flushWrites(store, writes.slice(1));
    expect(retry.error).toBeNull();
    // re-deliver everything again (e.g. ack lost before DO saved): still exactly once
    const again = await flushWrites(store, writes);
    expect(again.error).toBeNull();
    expect(again.conflicts).toEqual([]);
    expect(db.prepare('SELECT count(*) AS n FROM board_results').get()).toEqual({ n: 2 });
    expect(db.prepare('SELECT count(*) AS n FROM matches').get()).toEqual({ n: 1 });
  });

  it('never overwrites a conflicting existing score and reports it', async () => {
    const { db, store } = setup();
    await flushWrites(store, writes.slice(0, 2));
    const tampered: PendingWrite = { kind: 'BOARD_RESULT', id: 'm1:board:1', matchId: 'm1', board: board(1, -200), at: AT };
    const r = await flushWrites(store, [tampered]);
    expect(r.conflicts).toEqual(['m1:board:1']);
    expect(db.prepare('SELECT ns_score FROM board_results').get()).toEqual({ ns_score: 590 });
  });

  it('backoff grows and is capped', () => {
    expect(retryDelayMs(0)).toBe(2000);
    expect(retryDelayMs(3)).toBe(16000);
    expect(retryDelayMs(30)).toBe(600000);
  });
});
