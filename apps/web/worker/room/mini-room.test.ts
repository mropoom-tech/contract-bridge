import { describe, expect, it } from 'vitest';
import { createSeededRandom, handHcp, SEATS, type Seat } from '@bridge/game-engine';
import { PROTOCOL_VERSION, type MutatingCommand } from '@bridge/shared';
import { projectRoomForUser } from './room-projection';
import { applyBotStep, chooseMiniContract, createRoomState, handleCommand, joinRoom, type CommandOutcome, type RoomDeps, type RoomState } from './room-state';

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

const miniStarted = (seed: number): RoomState => {
  let s = createRoomState({ roomId: 'r', code: 'ABCDEFGH', host: { userId: U.N, displayName: 'N' }, targetBoards: 2, mode: 'MINI', createdAt: 'x' });
  for (const seat of ['E', 'S', 'W'] as const) {
    const r = joinRoom(s, { userId: U[seat], displayName: seat });
    if (!r.ok) throw new Error('join');
    s = r.state;
  }
  for (const seat of SEATS) {
    s = ok(exec(s, U[seat], { type: 'room:claimSeat', payload: { seat } }));
    s = ok(exec(s, U[seat], { type: 'room:ready', payload: { ready: true } }));
  }
  return ok(exec(s, U.N, { type: 'room:start', payload: {} }, deps(seed)));
};

/** First seed whose board 1 is not a 20–20 pass-out. */
const declaringSeed = () => {
  for (let seed = 1; seed < 100; seed++) if (miniStarted(seed).phase === 'DECLARING') return seed;
  throw new Error('no seed');
};

describe('Mini Bridge room', () => {
  it('starts in DECLARING with public HCP; dummy is visible to everyone; no auction', () => {
    const s = miniStarted(declaringSeed());
    const declarer = s.board?.mini?.declarer as Seat;
    const others = SEATS.filter((x) => x !== declarer);
    for (const viewer of SEATS) {
      const v = projectRoomForUser(s, U[viewer], new Set());
      expect(v.public.mode).toBe('MINI');
      expect(v.public.mini?.declarer).toBe(declarer);
      expect(v.public.dummyCards).toHaveLength(13);
      expect(v.allowedActions.calls).toEqual([]);
      expect(v.allowedActions.miniChoices.length).toBe(viewer === declarer ? 10 : 0);
    }
    // HCP shown = real HCP; hidden hands still only to their owner
    expect(s.board?.mini?.hcp.N).toBe(handHcp(s.board?.deal.N ?? []));
    const v = projectRoomForUser(s, U[others[0] as Seat], new Set());
    expect(v.you.yourHand).toHaveLength(13);
    expect(JSON.stringify(v)).not.toContain(JSON.stringify(s.board?.deal[declarer]));
  });

  it('only the declarer chooses; the choice starts play with LHO to lead', () => {
    const s = miniStarted(declaringSeed());
    const declarer = s.board?.mini?.declarer as Seat;
    const someoneElse = SEATS.find((x) => x !== declarer) as Seat;
    expect(exec(s, U[someoneElse], { type: 'mini:declare', payload: { strain: 'NT', game: true } }).response).toMatchObject({ code: 'NOT_YOUR_TURN' });
    const p = ok(exec(s, U[declarer], { type: 'mini:declare', payload: { strain: 'NT', game: true } }));
    expect(p.phase).toBe('PLAYING');
    expect(p.board?.play?.contract).toMatchObject({ level: 3, strain: 'NT', declarer });
  });

  it('a whole Mini Bridge match runs with bots and writes results', () => {
    let s = miniStarted(3);
    s = { ...s, botSeats: { N: true, E: true, S: true, W: true } };
    for (let i = 0; i < 400; i++) {
      const next = applyBotStep(s, deps(i + 10));
      if (!next) break;
      s = next;
    }
    expect(s.phase).toBe('MATCH_COMPLETED');
    expect(s.completedBoards).toHaveLength(2);
    expect(s.pendingWrites.filter((w) => w.kind === 'BOARD_RESULT')).toHaveLength(2);
  });

  it('a 20–20 deal is recorded as passed out and the next board follows', () => {
    for (let seed = 1; seed < 400; seed++) {
      const s = miniStarted(seed);
      if (s.phase !== 'BOARD_RESULT') continue;
      expect(s.completedBoards[0]?.result.kind).toBe('PASSED_OUT');
      return;
    }
    throw new Error('no 20-20 seed');
  });

  it('bot contract choice: 8-card major fit, game with 25+', () => {
    expect(chooseMiniContract(['AS', 'KS', 'QS', 'JS', '2S', 'AH', 'KH', '2D', '3D', '4D', '2C', '3C', '4C'], ['3S', '4S', '5S', 'AD', 'KD', 'QD', 'AC', '5C', '6C', '7C', '3H', '4H', '5H'])).toEqual({
      strain: 'S',
      game: true,
    });
    expect(chooseMiniContract(['2S', '3S', '4S', '2H', '3H', '4H', '2D', '3D', '4D', '2C', '3C', '4C', 'AC'], ['5S', '6S', '5H', '6H', '7H', '5D', '6D', '7D', '5C', '6C', '7C', 'KC', 'QC'])).toEqual({
      strain: 'C', // 9-card club fit, only 9 points
      game: false,
    });
    expect(chooseMiniContract(['AS', 'KH', 'QD', 'JC', '2S', '3S', '4H', '5H', '6D', '7D', '8C', '9C', 'TS'], ['AH', 'KD', 'QC', 'JS', '5S', '6H', '7H', '2D', '3D', '2C', '3C', '4C', 'TH'])).toEqual({
      strain: 'NT', // no 8-card fit, 20 points
      game: false,
    });
  });
});
