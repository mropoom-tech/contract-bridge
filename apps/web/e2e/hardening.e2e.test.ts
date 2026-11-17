/**
 * Phase 4 e2e against `npm run dev`: rate limits and D1 summary persistence.
 * D1 rows are read back with `wrangler d1 execute --local` (same local state as the dev server).
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SEATS, type Seat } from '@bridge/game-engine';
import { api, createGuest, ORIGIN, RoomClient, type Guest } from './client';

const WEB_DIR = fileURLToPath(new URL('..', import.meta.url));

const WRANGLER = join(dirname(createRequire(import.meta.url).resolve('wrangler')), '..', 'bin', 'wrangler.js');

/** Query local D1. Wrangler may exit non-zero on Windows after printing valid JSON, so parse stdout. */
const d1 = <T,>(sql: string): T[] => {
  const r = spawnSync(process.execPath, [WRANGLER, 'd1', 'execute', 'DB', '--local', '--json', '--command', sql], {
    cwd: WEB_DIR,
    encoding: 'utf8',
  });
  const start = r.stdout.indexOf('[');
  if (start < 0) throw new Error(`wrangler d1 failed: ${r.stderr.slice(0, 500)}`);
  const parsed = JSON.parse(r.stdout.slice(start)) as { results: T[] }[];
  return parsed[0]?.results ?? [];
};

const waitUntil = async (pred: () => boolean, ms = 15_000) => {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 300));
  }
};

describe('rate limits', () => {
  it('limits guest creation per client IP', async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await fetch(`${ORIGIN}/api/auth/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': ip },
        body: JSON.stringify({ displayName: `rl-${i}` }),
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it('caps open rooms per host', async () => {
    const g = await createGuest('เจ้าของหลายห้อง');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await api('/rooms', { method: 'POST', body: { targetBoards: 1 }, cookie: g.cookie })).status);
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });
});

describe('D1 match summary', () => {
  it('a finished 1-board match is persisted exactly once', async () => {
    const guests = {} as Record<Seat, Guest>;
    const clients = {} as Record<Seat, RoomClient>;
    for (const s of SEATS) guests[s] = await createGuest(`สรุป-${s}`);
    const code = (await api('/rooms', { method: 'POST', body: { targetBoards: 1 }, cookie: guests.N.cookie })).json.code as string;
    for (const s of ['E', 'S', 'W'] as const) await api(`/rooms/${code}/join`, { method: 'POST', cookie: guests[s].cookie });
    for (const s of SEATS) clients[s] = await RoomClient.connect(code, { Cookie: guests[s].cookie, Origin: ORIGIN });

    const latest = () => Math.max(...SEATS.map((s) => clients[s].version));
    const act = async (seat: Seat, type: Parameters<RoomClient['command']>[0], payload: unknown) => {
      await Promise.all(SEATS.map((s) => clients[s].waitFor(() => clients[s].version >= latest())));
      const m = await clients[seat].command(type, payload);
      if (m.type !== 'command:ack') throw new Error(`${seat} ${type} rejected`);
    };
    for (const s of SEATS) await act(s, 'room:claimSeat', { seat: s });
    for (const s of SEATS) await act(s, 'room:ready', { ready: true });
    await act('N', 'room:start', {});
    await act('N', 'auction:call', { kind: 'BID', level: 2, strain: 'C' });
    for (const s of ['E', 'S', 'W'] as const) await act(s, 'auction:call', { kind: 'PASS' });
    for (let i = 0; i < 52; i++) {
      await Promise.all(SEATS.map((s) => clients[s].waitFor(() => clients[s].version >= latest())));
      const seat = SEATS.find((s) => clients[s].snapshot!.allowedActions.play)!;
      const p = clients[seat].snapshot!.allowedActions.play!;
      await act(seat, 'card:play', { fromSeat: p.fromSeat, card: p.cards[0] });
    }
    await Promise.all(SEATS.map((s) => clients[s].waitFor(() => clients[s].version >= latest())));
    const pub = clients.N.snapshot!.public;
    expect(pub.phase).toBe('BOARD_RESULT');
    const ns = pub.completedBoards[0]!.result.nsScore;

    const rooms = d1<{ id: string }>(`SELECT id FROM rooms WHERE code = '${code}'`);
    const roomId = rooms[0]!.id;
    let rows: { ns_score: number; status: string; players: number }[] = [];
    await waitUntil(() => {
      rows = d1(`SELECT b.ns_score, m.status, (SELECT count(*) FROM match_players p WHERE p.match_id = m.id) AS players
                 FROM matches m JOIN board_results b ON b.match_id = m.id WHERE m.room_id = '${roomId}'`);
      return rows.length > 0 && rows[0]!.status === 'completed';
    });
    expect(rows).toEqual([{ ns_score: ns, status: 'completed', players: 4 }]);
    expect(d1<{ status: string }>(`SELECT status FROM rooms WHERE id = '${roomId}'`)).toEqual([{ status: 'completed' }]);
    SEATS.forEach((s) => clients[s].close());
  });
});
