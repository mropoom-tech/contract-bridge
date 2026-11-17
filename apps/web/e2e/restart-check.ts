/**
 * Manual DO-restore check across a full dev-server restart (workerd process dies,
 * DO storage persists in .wrangler/state):
 *
 *   node apps/web/e2e/restart-check.ts before   # sets up a game mid-play, saves state to a temp file
 *   (restart `npm run dev`)
 *   node apps/web/e2e/restart-check.ts after    # reconnects, verifies identical state, continues play
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { api, createGuest, ORIGIN, RoomClient, type Guest } from './client.ts';

type Seat = 'N' | 'E' | 'S' | 'W';
const SEATS: Seat[] = ['N', 'E', 'S', 'W'];
const FILE = join(tmpdir(), 'bridge-restart-check.json');
const mode = process.argv[2];

interface Saved {
  code: string;
  guests: Record<Seat, Guest>;
  version: number;
  hands: Record<Seat, string[]>;
  trickCards: number;
  pendingRequestId: string;
}

const connectAll = async (code: string, guests: Record<Seat, Guest>) => {
  const c = {} as Record<Seat, RoomClient>;
  for (const s of SEATS) c[s] = await RoomClient.connect(code, { Cookie: guests[s].cookie, Origin: ORIGIN });
  return c;
};
const sync = (c: Record<Seat, RoomClient>) => {
  const v = Math.max(...SEATS.map((s) => c[s].version));
  return Promise.all(SEATS.map((s) => c[s].waitFor(() => c[s].version >= v)));
};
const act = async (c: Record<Seat, RoomClient>, seat: Seat, type: Parameters<RoomClient['command']>[0], payload: unknown, requestId?: string) => {
  await sync(c);
  const m = await c[seat].command(type, payload, requestId ? { requestId } : {});
  if (m.type !== 'command:ack') throw new Error(`${seat} ${type} rejected: ${JSON.stringify(m)}`);
  return m;
};
const playOne = async (c: Record<Seat, RoomClient>, requestId?: string) => {
  await sync(c);
  const seat = SEATS.find((s) => c[s].snapshot!.allowedActions.play)!;
  const p = c[seat].snapshot!.allowedActions.play!;
  return act(c, seat, 'card:play', { fromSeat: p.fromSeat, card: p.cards[0] }, requestId);
};

if (mode === 'before') {
  const guests = {} as Record<Seat, Guest>;
  for (const s of SEATS) guests[s] = await createGuest(`restart-${s}`);
  const code = (await api('/rooms', { method: 'POST', body: { targetBoards: 1 }, cookie: guests.N.cookie })).json.code as string;
  for (const s of ['E', 'S', 'W'] as const) await api(`/rooms/${code}/join`, { method: 'POST', cookie: guests[s].cookie });
  const c = await connectAll(code, guests);
  for (const s of SEATS) await act(c, s, 'room:claimSeat', { seat: s });
  for (const s of SEATS) await act(c, s, 'room:ready', { ready: true });
  await act(c, 'N', 'room:start', {});
  await act(c, 'N', 'auction:call', { kind: 'BID', level: 3, strain: 'NT' });
  for (const s of ['E', 'S', 'W'] as const) await act(c, s, 'auction:call', { kind: 'PASS' });
  for (let i = 0; i < 5; i++) await playOne(c);
  // one more card whose requestId we will replay after the restart (simulates a lost ack)
  const pendingRequestId = crypto.randomUUID();
  await playOne(c, pendingRequestId);
  await sync(c);
  const saved: Saved = {
    code,
    guests,
    version: c.N.version,
    hands: Object.fromEntries(SEATS.map((s) => [s, [...c[s].snapshot!.you.yourHand]])) as Record<Seat, string[]>,
    trickCards: 6,
    pendingRequestId,
  };
  writeFileSync(FILE, JSON.stringify(saved));
  SEATS.forEach((s) => c[s].close());
  console.log(`saved room ${code} at version ${saved.version}`);
  process.exit(0);
}

if (mode === 'after') {
  const saved = JSON.parse(readFileSync(FILE, 'utf8')) as Saved;
  const c = await connectAll(saved.code, saved.guests);
  await sync(c);
  const checks: [string, boolean][] = [];
  checks.push(['version preserved', c.N.version === saved.version]);
  for (const s of SEATS) checks.push([`${s} hand preserved`, JSON.stringify(c[s].snapshot!.you.yourHand) === JSON.stringify(saved.hands[s])]);
  const pub = c.N.snapshot!.public;
  checks.push(['phase PLAYING', pub.phase === 'PLAYING']);
  checks.push(['contract 3NT by N', pub.contract?.level === 3 && pub.contract.strain === 'NT' && pub.contract.declarer === 'N']);
  checks.push(['6 cards played', pub.completedTricks.length * 4 + pub.currentTrick.length === saved.trickCards]);
  // Replay the last request id (expectedVersion from before): must return the original ack, no new card.
  const seat = SEATS.find((s) => c[s].snapshot!.allowedActions.play) ?? 'N';
  const replay = await c[seat].command('card:play', { fromSeat: 'N', card: '2C' }, { requestId: saved.pendingRequestId, expectedVersion: saved.version - 1 });
  // The id belongs to whoever sent it; if that was another user, the server treats it as new and rejects it by rules.
  checks.push(['replay did not advance state', c.N.version === saved.version]);
  void replay;
  await playOne(c);
  await sync(c);
  checks.push(['play continues after restart', c.N.version === saved.version + 1]);
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  SEATS.forEach((s) => c[s].close());
  process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
}

console.error('usage: node apps/web/e2e/restart-check.ts before|after');
process.exit(2);
