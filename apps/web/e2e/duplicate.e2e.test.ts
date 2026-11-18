/**
 * e2e (against `npm run dev`): a Duplicate team match creates two linked
 * tables that receive the SAME deal; results are compared only after both
 * tables finish a board.
 */
import { describe, expect, it } from 'vitest';
import { SEATS, type Seat } from '@bridge/game-engine';
import { api, createGuest, ORIGIN, RoomClient, type Guest } from './client';

type Table = { clients: Record<Seat, RoomClient>; guests: Record<Seat, Guest> };

const fillTable = async (code: string, host: Guest | null, prefix: string): Promise<Table> => {
  const guests = {} as Record<Seat, Guest>;
  const clients = {} as Record<Seat, RoomClient>;
  for (const s of SEATS) {
    guests[s] = s === 'N' && host ? host : await createGuest(`${prefix}-${s}`);
    if (!(s === 'N' && host)) expect((await api(`/rooms/${code}/join`, { method: 'POST', cookie: guests[s].cookie })).status).toBe(200);
    clients[s] = await RoomClient.connect(code, { Cookie: guests[s].cookie, Origin: ORIGIN });
  }
  for (const s of SEATS) {
    await clients[s].command('room:claimSeat', { seat: s }, { expectedVersion: Math.max(...SEATS.filter((x) => clients[x]).map((x) => clients[x].version)) });
  }
  return { clients, guests };
};

const act = async (t: Table, seat: Seat, type: Parameters<RoomClient['command']>[0], payload: unknown) => {
  const v = Math.max(...SEATS.map((s) => t.clients[s].version));
  await Promise.all(SEATS.map((s) => t.clients[s].waitFor(() => t.clients[s].version >= v)));
  const m = await t.clients[seat].command(type, payload);
  if (m.type !== 'command:ack') throw new Error(`${seat} ${type} -> ${m.type === 'command:error' ? m.code : m.type}`);
};

describe('Duplicate team match over real WebSockets', () => {
  it('two tables, same deal, comparison only after both finish', async () => {
    const host = await createGuest('dup-host');
    const created = await api('/rooms', { method: 'POST', body: { targetBoards: 1, mode: 'DUPLICATE' }, cookie: host.cookie });
    expect(created.status).toBe(201);
    const code1 = created.json.code as string;
    const code2 = created.json.otherTableCode as string;
    expect(code2).toMatch(/^[A-Z2-9]{8}$/);

    const t1 = await fillTable(code1, host, 'd1');
    const t2 = await fillTable(code2, null, 'd2');
    for (const t of [t1, t2]) {
      for (const s of SEATS) await act(t, s, 'room:ready', { ready: true });
      await act(t, 'N', 'room:start', {});
    }
    // Same deal at both tables: each seat's hand is identical.
    for (const s of SEATS) {
      await t2.clients[s].waitFor(() => (t2.clients[s].snapshot?.you.yourHand.length ?? 0) === 13);
      expect([...(t1.clients[s].snapshot?.you.yourHand ?? [])].sort()).toEqual([...(t2.clients[s].snapshot?.you.yourHand ?? [])].sort());
    }
    // Table 1 passes the board out; table 2 has not finished → no comparison yet.
    const dealer = t1.clients.N.snapshot?.public.dealer as Seat;
    let seat = dealer;
    for (let i = 0; i < 4; i++) {
      await act(t1, seat, 'auction:call', { kind: 'PASS' });
      seat = SEATS[(SEATS.indexOf(seat) + 1) % 4] as Seat;
    }
    await t1.clients.N.waitFor(() => t1.clients.N.snapshot?.public.phase === 'BOARD_RESULT');
    expect(t1.clients.N.snapshot?.public.duplicate?.comparisons).toEqual([]);
    expect(t2.clients.N.snapshot?.public.duplicate?.comparisons).toEqual([]);
    // Table 2 finishes too → both tables see the comparison.
    seat = dealer;
    for (let i = 0; i < 4; i++) {
      await act(t2, seat, 'auction:call', { kind: 'PASS' });
      seat = SEATS[(SEATS.indexOf(seat) + 1) % 4] as Seat;
    }
    const expected = [{ boardNumber: 1, table1Ns: 0, table2Ns: 0, impsTeamA: 0 }];
    await t1.clients.E.waitFor(() => (t1.clients.E.snapshot?.public.duplicate?.comparisons.length ?? 0) === 1, 8000);
    await t2.clients.W.waitFor(() => (t2.clients.W.snapshot?.public.duplicate?.comparisons.length ?? 0) === 1, 8000);
    expect(t1.clients.E.snapshot?.public.duplicate?.comparisons).toEqual(expected);
    expect(t2.clients.W.snapshot?.public.duplicate?.comparisons).toEqual(expected);
    for (const t of [t1, t2]) for (const s of SEATS) t.clients[s].close();
  }, 60_000);
});
