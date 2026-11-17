/**
 * End-to-end: four independent clients against a running dev server
 * (`npm run dev`, local D1 migrated). Run with `npm run test:e2e -w @bridge/web`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEATS, type Card, type Seat } from '@bridge/game-engine';
import type { ServerMessage } from '@bridge/shared';
import { api, createGuest, ORIGIN, RoomClient, type Guest } from './client';

const cardsIn = (s: string): string[] => s.match(/"[2-9TJQKA][CDHS]"/g)?.map((x) => x.slice(1, 3)) ?? [];
const codeOf = (m: ServerMessage) => (m.type === 'command:error' ? m.code : m.type);

describe('four-player room over real WebSockets', () => {
  const guests = {} as Record<Seat, Guest>;
  const clients = {} as Record<Seat, RoomClient>;
  let code = '';
  const initialHands = {} as Record<Seat, Set<string>>;

  const latest = () => Math.max(...SEATS.map((s) => clients[s].version));
  const sync = () => Promise.all(SEATS.map((s) => clients[s].waitFor(() => clients[s].version >= latest())));
  const act = async (seat: Seat, type: Parameters<RoomClient['command']>[0], payload: unknown) => {
    await sync();
    const m = await clients[seat].command(type, payload);
    if (m.type !== 'command:ack') throw new Error(`${seat} ${type} -> ${codeOf(m)}`);
    return m;
  };
  const headersFor = (g: Guest) => ({ Cookie: g.cookie, Origin: ORIGIN });

  beforeAll(async () => {
    const health = await api('/health');
    if (health.status !== 200) throw new Error('Dev server not running: start `npm run dev` first');
    for (const s of SEATS) guests[s] = await createGuest(`ผู้เล่น-${s}`);
    const created = await api('/rooms', { method: 'POST', body: { targetBoards: 1 }, cookie: guests.N.cookie });
    expect(created.status).toBe(201);
    code = created.json.code as string;
    for (const s of ['E', 'S', 'W'] as const) {
      expect((await api(`/rooms/${code}/join`, { method: 'POST', cookie: guests[s].cookie })).status).toBe(200);
    }
    for (const s of SEATS) clients[s] = await RoomClient.connect(code, headersFor(guests[s]));
  });

  afterAll(() => SEATS.forEach((s) => clients[s]?.close()));

  it('REST auth: me, unauthenticated, CSRF origin, validation, room full', async () => {
    expect((await api('/auth/me', { cookie: guests.E.cookie })).json).toMatchObject({ user: { id: guests.E.id } });
    expect((await api('/auth/me')).status).toBe(401);
    expect((await api('/rooms', { method: 'POST', body: {}, cookie: guests.N.cookie, origin: null })).status).toBe(403);
    expect((await api('/rooms', { method: 'POST', body: {}, cookie: guests.N.cookie, origin: 'https://evil.example' })).status).toBe(403);
    expect((await api('/auth/guest', { method: 'POST', body: { displayName: '<script>' } })).status).toBe(400);
    const fifth = await createGuest('คนที่ห้า');
    const j = await api(`/rooms/${code}/join`, { method: 'POST', cookie: fifth.cookie });
    expect(j.status).toBe(409);
    expect(j.json).toMatchObject({ error: { code: 'ROOM_FULL' } });
    expect((await api('/rooms/ZZZZZZZZ', { cookie: fifth.cookie })).status).toBe(404);
    const summary = await api(`/rooms/${code}`, { cookie: guests.E.cookie });
    expect(summary.json).toMatchObject({ code, memberCount: 4, isMember: true, phase: 'WAITING' });
  });

  it('WS upgrade rejects bad origin, no cookie, non-members; ignores forged identity header', async () => {
    await expect(RoomClient.connect(code, { Cookie: guests.E.cookie, Origin: 'https://evil.example' })).rejects.toThrow();
    await expect(RoomClient.connect(code, { Origin: ORIGIN })).rejects.toThrow();
    const outsider = await createGuest('คนนอก');
    await expect(RoomClient.connect(code, headersFor(outsider))).rejects.toThrow();
    // E presents N's id in the internal header: must still be E, and N's older socket must be untouched
    const forged = await RoomClient.connect(code, { ...headersFor(guests.E), 'X-Bridge-Internal-User-Id': guests.N.id });
    expect(forged.snapshot?.you.userId).toBe(guests.E.id);
    // newest connection wins: the original E socket is told it was replaced
    await clients.E.waitFor(() => clients.E.replaced);
    await clients.E.waitFor(() => clients.E.closed !== null);
    clients.E = forged;
  });

  it('seats, ready, start; duplicate requestId and malformed frames', async () => {
    for (const s of SEATS) await act(s, 'room:claimSeat', { seat: s });
    await sync();
    const taken = await clients.E.command('room:claimSeat', { seat: 'N' });
    expect(codeOf(taken)).toBe('SEAT_TAKEN');
    for (const s of SEATS) await act(s, 'room:ready', { ready: true });

    const notHost = await (async () => {
      await sync();
      return clients.E.command('room:start', {});
    })();
    expect(codeOf(notHost)).toBe('FORBIDDEN');

    await sync();
    const rid = crypto.randomUUID();
    const v = clients.N.version;
    const first = await clients.N.command('room:start', {}, { requestId: rid, expectedVersion: v });
    expect(first).toMatchObject({ type: 'command:ack', stateVersion: v + 1 });
    const dup = await clients.N.command('room:start', {}, { requestId: rid, expectedVersion: v });
    expect(dup).toEqual(first);
    await sync();
    expect(latest()).toBe(v + 1);

    const stale = await clients.N.command('auction:call', { kind: 'PASS' }, { expectedVersion: 1 });
    expect(stale).toMatchObject({ code: 'STALE_VERSION', stateVersion: v + 1 });

    clients.W.sendRaw('{not json');
    clients.W.sendRaw(JSON.stringify({ protocolVersion: 1, requestId: crypto.randomUUID(), type: 'card:play', expectedVersion: 1, payload: { fromSeat: 'W', card: 'XX' } }));
    clients.W.sendRaw('x'.repeat(10_000));
    await clients.W.waitFor(() => clients.W.frames.filter((f) => f.includes('INVALID_PAYLOAD')).length >= 3);

    for (const s of SEATS) {
      const snap = clients[s].snapshot!;
      expect(snap.public.phase).toBe('BIDDING');
      expect(snap.you.yourHand).toHaveLength(13);
      initialHands[s] = new Set(snap.you.yourHand);
    }
    expect(new Set(SEATS.flatMap((s) => [...initialHands[s]])).size).toBe(52);
  });

  it('plays a full board with dummy control and reconnect; no frame leaks a concealed card', async () => {
    await act('N', 'auction:call', { kind: 'BID', level: 1, strain: 'NT' });
    await sync();
    expect(codeOf(await clients.S.command('auction:call', { kind: 'DOUBLE' }))).toBe('NOT_YOUR_TURN');
    for (const s of ['E', 'S', 'W'] as const) await act(s, 'auction:call', { kind: 'PASS' });
    await sync();
    expect(clients.N.snapshot!.public.contract).toMatchObject({ declarer: 'N', dummy: 'S', openingLeader: 'E' });
    expect(clients.W.snapshot!.public.dummyCards).toBeNull();

    let played = 0;
    while (latest() > 0 && clients.N.snapshot!.public.phase === 'PLAYING') {
      await sync();
      const actor = SEATS.find((s) => clients[s].snapshot!.allowedActions.play !== null);
      if (!actor) throw new Error('no player can act');
      const play = clients[actor].snapshot!.allowedActions.play!;
      if (play.fromSeat === 'S') {
        // dummy's own account is refused
        expect(codeOf(await clients.S.command('card:play', { fromSeat: 'S', card: play.cards[0] }))).toBe('FORBIDDEN');
      }
      await act(actor, 'card:play', { fromSeat: play.fromSeat, card: play.cards[0] as Card });
      played++;
      if (played === 6) {
        // E refreshes mid-board: new socket gets a fresh seat-specific snapshot, no extra action
        const before = latest();
        clients.E.close();
        clients.E = await RoomClient.connect(code, headersFor(guests.E));
        expect(clients.E.version).toBe(before);
        expect(clients.E.snapshot!.you.yourHand.every((c) => initialHands.E.has(c))).toBe(true);
      }
    }
    await sync();
    expect(played).toBe(52);
    const pub = clients.E.snapshot!.public;
    expect(pub.phase).toBe('BOARD_RESULT');
    expect(pub.result).toMatchObject({ kind: 'PLAYED' });
    expect(pub.completedTricks).toHaveLength(13);

    // Leak audit over every frame each client received
    for (const s of SEATS) {
      const publicSoFar = new Set<string>();
      for (const raw of clients[s].frames) {
        const msg = JSON.parse(raw) as ServerMessage;
        if (msg.type !== 'session:snapshot') {
          expect(cardsIn(raw)).toEqual([]);
          continue;
        }
        const p = msg.snapshot.public;
        p.dummyCards?.forEach((c) => publicSoFar.add(c));
        p.currentTrick.forEach((t) => publicSoFar.add(t.card));
        p.completedTricks.forEach((t) => t.cards.forEach((c) => publicSoFar.add(c.card)));
        msg.snapshot.you.yourHand.forEach((c) => expect(initialHands[s].has(c)).toBe(true));
        for (const c of cardsIn(raw)) {
          expect(initialHands[s].has(c) || publicSoFar.has(c), `${s} saw concealed ${c}`).toBe(true);
        }
      }
    }
  });

  it('next-board readiness completes the 1-board match', async () => {
    for (const s of SEATS) await act(s, 'board:readyNext', { ready: true });
    await sync();
    for (const s of SEATS) expect(clients[s].snapshot!.public.phase).toBe('MATCH_COMPLETED');
    expect(clients.N.snapshot!.public.completedBoards).toHaveLength(1);
  });
});
