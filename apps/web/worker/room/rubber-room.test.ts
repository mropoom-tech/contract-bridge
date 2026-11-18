import { describe, expect, it } from 'vitest';
import { createSeededRandom, nextSeat, rubberTotals, SEATS, type Seat } from '@bridge/game-engine';
import { PROTOCOL_VERSION, type MutatingCommand } from '@bridge/shared';
import { projectRoomForUser } from './room-projection';
import { applyBotStep, createRoomState, handleCommand, joinRoom, type CommandOutcome, type RoomDeps, type RoomState } from './room-state';

const U: Record<Seat, string> = { N: 'u-n', E: 'u-e', S: 'u-s', W: 'u-w' };
let n = 0;
const rid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const deps = (seed: number): RoomDeps => ({ rng: createSeededRandom(seed), newId: () => `id-${++n}`, now: () => 'now', online: new Set(Object.values(U)) });
type Body = Pick<MutatingCommand, 'type' | 'payload'>;
const exec = (s: RoomState, user: string, body: Body, d = deps(1)): CommandOutcome =>
  handleCommand(s, user, { protocolVersion: PROTOCOL_VERSION, requestId: rid(), expectedVersion: s.version, ...body } as MutatingCommand, d);
const ok = (o: CommandOutcome) => {
  if (o.response.status !== 'accepted') throw new Error(`${o.response.code}: ${o.response.message}`);
  return o.state;
};

const rubberStarted = (): RoomState => {
  let s = createRoomState({ roomId: 'r', code: 'ABCDEFGH', host: { userId: U.N, displayName: 'N' }, targetBoards: 4, mode: 'RUBBER', createdAt: 'x' });
  for (const seat of ['E', 'S', 'W'] as const) {
    const r = joinRoom(s, { userId: U[seat], displayName: seat });
    if (!r.ok) throw new Error('join');
    s = r.state;
  }
  for (const seat of SEATS) {
    s = ok(exec(s, U[seat], { type: 'room:claimSeat', payload: { seat } }));
    s = ok(exec(s, U[seat], { type: 'room:ready', payload: { ready: true } }));
  }
  return ok(exec(s, U.N, { type: 'room:start', payload: {} }, deps(5)));
};

/** Dealer opens 1NT, everyone passes; bots play the cards; all ready for the next deal. */
const playDeal = (s0: RoomState, seed: number): RoomState => {
  let s = s0;
  const dealer = s.board?.dealer as Seat;
  s = ok(exec(s, U[dealer], { type: 'auction:call', payload: { kind: 'BID', level: 1, strain: 'NT' } }));
  for (let i = 1, seat = nextSeat(dealer); i < 4; i++, seat = nextSeat(seat)) s = ok(exec(s, U[seat], { type: 'auction:call', payload: { kind: 'PASS' } }));
  s = { ...s, botSeats: { N: true, E: true, S: true, W: true } };
  for (let i = 0; i < 60 && s.phase === 'PLAYING'; i++) s = applyBotStep(s, deps(seed + i)) ?? s;
  return { ...s, botSeats: { N: false, E: false, S: false, W: false } };
};

describe('Rubber room', () => {
  it('starts non-vulnerable with an empty sheet; vulnerability follows games won; ends when a side wins two games', () => {
    let s = rubberStarted();
    expect(s.rubber?.gamesWon).toEqual({ NS: 0, EW: 0 });
    expect(s.board?.vulnerability).toBe('NONE');
    expect(projectRoomForUser(s, U.E, new Set()).public.rubber).toEqual(s.rubber);
    let deals = 0;
    while (s.phase !== 'MATCH_COMPLETED') {
      s = playDeal(s, deals * 100);
      expect(s.phase).toBe('BOARD_RESULT');
      const r = s.rubber;
      if (!r) throw new Error('no rubber');
      if (!r.winner) {
        for (const seat of SEATS) s = ok(exec(s, U[seat], { type: 'board:readyNext', payload: { ready: true } }));
        const expected = r.gamesWon.NS && r.gamesWon.EW ? 'BOTH' : r.gamesWon.NS ? 'NS' : r.gamesWon.EW ? 'EW' : 'NONE';
        expect(s.board?.vulnerability).toBe(expected);
        // dealer rotates every deal
        expect(s.board?.dealer).toBe(SEATS[(s.board?.boardNumber ?? 1) - 1 - 4 * Math.floor(((s.board?.boardNumber ?? 1) - 1) / 4)]);
      } else {
        for (const seat of SEATS) s = ok(exec(s, U[seat], { type: 'board:readyNext', payload: { ready: true } }));
      }
      if (++deals > 80) throw new Error('rubber did not finish: ' + JSON.stringify(s.rubber?.entries.map((e) => [e.contract?.declarer, e.declarerTricks, e.score.below?.points ?? 0]).slice(0, 8)) + JSON.stringify(s.rubber?.gamesWon));
    }
    const r = s.rubber;
    if (!r?.winner) throw new Error('no winner');
    expect(r.gamesWon[r.winner]).toBe(2);
    expect([500, 700]).toContain(r.rubberBonus);
    // Board nsScores add up to the sheet totals (NS − EW)
    const totals = rubberTotals(r);
    expect(s.completedBoards.reduce((a, b) => a + b.result.nsScore, 0)).toBe(totals.NS - totals.EW);
    expect(s.pendingWrites.some((w) => w.kind === 'MATCH_END')).toBe(true);
  });
});
