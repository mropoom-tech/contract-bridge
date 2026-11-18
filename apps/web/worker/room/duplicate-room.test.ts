import { describe, expect, it } from 'vitest';
import { createSeededRandom, deal, SEATS, type Hands, type Seat } from '@bridge/game-engine';
import { PROTOCOL_VERSION, type FinishedBoard, type MutatingCommand } from '@bridge/shared';
import { duplicateView, projectRoomForUser } from './room-projection';
import { applyBotStep, createRoomState, handleCommand, joinRoom, type CommandOutcome, type RoomDeps, type RoomState } from './room-state';

let n = 0;
const rid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const deps = (seed: number): RoomDeps => ({ rng: createSeededRandom(seed), newId: () => `id-${++n}`, now: () => 'now', online: new Set() });
type Body = Pick<MutatingCommand, 'type' | 'payload'>;
const exec = (s: RoomState, user: string, body: Body, d = deps(1)): CommandOutcome =>
  handleCommand(s, user, { protocolVersion: PROTOCOL_VERSION, requestId: rid(), expectedVersion: s.version, ...body } as MutatingCommand, d);
const ok = (o: CommandOutcome) => {
  if (o.response.status !== 'accepted') throw new Error(`${o.response.code}: ${o.response.message}`);
  return o.state;
};

const deals: Hands[] = [deal(createSeededRandom(11)), deal(createSeededRandom(12))];

const table = (t: 1 | 2, prefix: string): { s: RoomState; users: Record<Seat, string> } => {
  const users = Object.fromEntries(SEATS.map((x) => [x, `${prefix}-${x}`])) as Record<Seat, string>;
  let s = createRoomState({
    roomId: `room-${t}`,
    code: t === 1 ? 'TABLEONE' : 'TABLETWO',
    host: t === 1 ? { userId: users.N, displayName: 'N' } : null,
    targetBoards: 2,
    mode: 'DUPLICATE',
    createdAt: 'x',
    duplicate: { eventId: 'ev', table: t, partnerRoomId: `room-${t === 1 ? 2 : 1}`, partnerCode: t === 1 ? 'TABLETWO' : 'TABLEONE', deals },
  });
  for (const seat of SEATS) {
    const r = joinRoom(s, { userId: users[seat], displayName: seat });
    if (!r.ok) throw new Error('join');
    s = r.state;
  }
  for (const seat of SEATS) {
    s = ok(exec(s, users[seat], { type: 'room:claimSeat', payload: { seat } }));
    s = ok(exec(s, users[seat], { type: 'room:ready', payload: { ready: true } }));
  }
  return { s: ok(exec(s, users.N, { type: 'room:start', payload: {} }, deps(t * 100))), users };
};

const finishBoardWithBots = (s0: RoomState, seed: number): RoomState => {
  let s = { ...s0, botSeats: { N: true, E: true, S: true, W: true } };
  for (let i = 0; i < 80 && s.phase !== 'BOARD_RESULT' && s.phase !== 'MATCH_COMPLETED'; i++) s = applyBotStep(s, deps(seed + i)) ?? s;
  return { ...s, botSeats: { N: false, E: false, S: false, W: false } };
};

describe('Duplicate team match (two linked tables)', () => {
  it('table 2 gets its host from the first player to join', () => {
    const t2 = table(2, 'b');
    expect(t2.s.hostUserId).toBe(t2.users.N);
  });

  it('both tables play exactly the same deal, regardless of each room RNG', () => {
    const a = table(1, 'a').s;
    const b = table(2, 'b').s;
    expect(a.board?.deal).toEqual(deals[0]);
    expect(b.board?.deal).toEqual(deals[0]);
  });

  it('the shared deals never reach a client snapshot', () => {
    const { s, users } = table(1, 'a');
    const json = JSON.stringify(projectRoomForUser(s, users.E, new Set()));
    expect(json).not.toContain('"deals"');
    // only E's own 13 cards + no other hand
    for (const seat of ['N', 'S', 'W'] as const) {
      for (const card of deals[0]?.[seat] ?? []) expect(json.includes(`"${card}"`) && !deals[0]?.E.includes(card)).toBe(false);
    }
  });

  it('compares only boards finished at both tables, with IMPs for team A (NS at T1 + EW at T2)', () => {
    let a = table(1, 'a').s;
    const b0 = table(2, 'b').s;
    a = finishBoardWithBots(a, 1);
    // T2 has not finished board 1 yet → no comparison, nothing leaked
    const early = duplicateView(a, b0.completedBoards);
    expect(early?.comparisons).toEqual([]);
    expect(early?.otherTableFinished).toBe(0);
    const fake = (ns: number): FinishedBoard[] => [{ boardNumber: 1, dealer: 'N', vulnerability: 'NONE', result: { kind: 'PASSED_OUT', nsScore: 0, ewScore: 0 }, ...{} }].map((x) => ({
      ...x,
      result: { kind: 'PLAYED', contract: { level: 4, strain: 'S', doubled: 0, declarer: 'N', dummy: 'S', openingLeader: 'E' }, declarerTricks: 10, declarerScore: ns, nsScore: ns, ewScore: -ns },
    })) as FinishedBoard[];
    const myNs = a.completedBoards[0]?.result.nsScore ?? 0;
    const v = duplicateView(a, fake(myNs - 470));
    expect(v?.comparisons).toEqual([{ boardNumber: 1, table1Ns: myNs, table2Ns: myNs - 470, impsTeamA: 10 }]);
    expect([v?.impsTeamA, v?.impsTeamB]).toEqual([10, 0]);
    // seen from table 2 the same numbers, same team orientation
    const b = { ...b0, completedBoards: fake(myNs - 470) };
    expect(duplicateView(b, a.completedBoards)?.comparisons[0]).toEqual({ boardNumber: 1, table1Ns: myNs, table2Ns: myNs - 470, impsTeamA: 10 });
  });
});
