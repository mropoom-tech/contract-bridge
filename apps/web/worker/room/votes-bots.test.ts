import { describe, expect, it } from 'vitest';
import { createSeededRandom, SEATS, type Seat } from '@bridge/game-engine';
import { PROTOCOL_VERSION, type MutatingCommand } from '@bridge/shared';
import { chooseCard } from './bot';
import { projectRoomForUser } from './room-projection';
import {
  applyBotStep,
  createRoomState,
  handleCommand,
  joinRoom,
  migrateRoomState,
  type CommandOutcome,
  type RoomDeps,
  type RoomState,
} from './room-state';

const U: Record<Seat, string> = { N: 'u-n', E: 'u-e', S: 'u-s', W: 'u-w' };
let n = 0;
const rid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const deps = (online: Seat[] = [...SEATS], seed = 7): RoomDeps => ({
  rng: createSeededRandom(seed),
  newId: () => `id-${++n}`,
  now: () => '2026-11-18T00:00:00.000Z',
  online: new Set(online.map((s) => U[s])),
});
type Body = Pick<MutatingCommand, 'type' | 'payload'>;
const exec = (s: RoomState, user: string, body: Body, d = deps()): CommandOutcome =>
  handleCommand(s, user, { protocolVersion: PROTOCOL_VERSION, requestId: rid(), expectedVersion: s.version, ...body } as MutatingCommand, d);
const ok = (o: CommandOutcome) => {
  if (o.response.status !== 'accepted') throw new Error(`${o.response.code}: ${o.response.message}`);
  return o.state;
};
const code = (o: CommandOutcome) => (o.response.status === 'error' ? o.response.code : 'accepted');

const seated = (): RoomState => {
  let s = createRoomState({ roomId: 'r', code: 'ABCDEFGH', host: { userId: U.N, displayName: 'N' }, targetBoards: 1, createdAt: 'x' });
  for (const seat of ['E', 'S', 'W'] as const) {
    const r = joinRoom(s, { userId: U[seat], displayName: seat });
    if (!r.ok) throw new Error('join');
    s = r.state;
  }
  for (const seat of SEATS) {
    s = ok(exec(s, U[seat], { type: 'room:claimSeat', payload: { seat } }));
    s = ok(exec(s, U[seat], { type: 'room:ready', payload: { ready: true } }));
  }
  return s;
};
const started = () => ok(exec(seated(), U.N, { type: 'room:start', payload: {} }));

describe('votes', () => {
  it('BOT vote only against an offline player during a match; majority of online voters', () => {
    const s = started();
    const online: Seat[] = ['N', 'E', 'S']; // W disconnected
    expect(code(exec(s, U.N, { type: 'vote:start', payload: { seat: 'E', kind: 'BOT' } }, deps(online)))).toBe('FORBIDDEN');
    const s1 = ok(exec(s, U.N, { type: 'vote:start', payload: { seat: 'W', kind: 'BOT' } }, deps(online)));
    expect(s1.vote).toMatchObject({ seat: 'W', needed: 2, yes: [U.N] });
    // target cannot vote; double voting rejected
    expect(code(exec(s1, U.W, { type: 'vote:cast', payload: { voteId: s1.vote?.id ?? '', yes: true } }, deps(online)))).toBe('FORBIDDEN');
    expect(code(exec(s1, U.N, { type: 'vote:cast', payload: { voteId: s1.vote?.id ?? '', yes: true } }, deps(online)))).toBe('FORBIDDEN');
    const s2 = ok(exec(s1, U.E, { type: 'vote:cast', payload: { voteId: s1.vote?.id ?? '', yes: true } }, deps(online)));
    expect(s2.vote).toBeNull();
    expect(s2.botSeats.W).toBe(true);
    expect(s2.members.some((m) => m.userId === U.W)).toBe(true);
  });

  it('a vote is cancelled once a majority is impossible', () => {
    const s = started();
    const online: Seat[] = ['N', 'E', 'S'];
    const s1 = ok(exec(s, U.N, { type: 'vote:start', payload: { seat: 'W', kind: 'BOT' } }, deps(online)));
    const s2 = ok(exec(s1, U.E, { type: 'vote:cast', payload: { voteId: s1.vote?.id ?? '', yes: false } }, deps(online)));
    expect(s2.vote).not.toBeNull();
    const s3 = ok(exec(s2, U.S, { type: 'vote:cast', payload: { voteId: s1.vote?.id ?? '', yes: false } }, deps(online)));
    expect(s3.vote).toBeNull();
    expect(s3.botSeats.W).toBe(false);
  });

  it('KICK in the waiting room frees the seat and blocks rejoining', () => {
    const s = seated();
    let k = ok(exec(s, U.N, { type: 'vote:start', payload: { seat: 'E', kind: 'KICK' } }));
    k = ok(exec(k, U.S, { type: 'vote:cast', payload: { voteId: k.vote?.id ?? '', yes: true } }));
    // 3 eligible voters (N, S, W) → 2 needed: N + S applies it
    expect(k.vote).toBeNull();
    expect(k.seats.E).toBeNull();
    expect(k.members.some((m) => m.userId === U.E)).toBe(false);
    expect(joinRoom(k, { userId: U.E, displayName: 'E' })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('KICK during a match: member removed, bot keeps the seat, socket-level access gone', () => {
    const s = started();
    let k = ok(exec(s, U.N, { type: 'vote:start', payload: { seat: 'E', kind: 'KICK' } }));
    k = ok(exec(k, U.S, { type: 'vote:cast', payload: { voteId: k.vote?.id ?? '', yes: true } }));
    expect(k.vote).toBeNull();
    expect(k.members.some((m) => m.userId === U.E)).toBe(false);
    expect(k.botSeats.E).toBe(true);
    expect(code(exec(k, U.E, { type: 'auction:call', payload: { kind: 'PASS' } }))).toBe('FORBIDDEN');
    expect(joinRoom(k, { userId: U.E, displayName: 'E' })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    // name still shown for the bot seat
    expect(projectRoomForUser(k, U.N, new Set()).public.seats.E?.displayName).toBe('E');
  });

  it('reclaim: a returning player takes the seat back; until then they cannot act', () => {
    const s = started();
    const online: Seat[] = ['N', 'E', 'S'];
    let v = ok(exec(s, U.N, { type: 'vote:start', payload: { seat: 'W', kind: 'BOT' } }, deps(online)));
    v = ok(exec(v, U.E, { type: 'vote:cast', payload: { voteId: v.vote?.id ?? '', yes: true } }, deps(online)));
    const view = projectRoomForUser(v, U.W, new Set([U.W]));
    expect(view.allowedActions.reclaim).toBe(true);
    expect(view.allowedActions.calls).toEqual([]);
    const back = ok(exec(v, U.W, { type: 'seat:reclaim', payload: {} }));
    expect(back.botSeats.W).toBe(false);
  });

  it('migrates v2 snapshots', () => {
    const { botSeats: _b, kicked: _k, vote: _v, ...v2 } = started();
    const m = migrateRoomState({ ...v2, schemaVersion: 2 });
    expect(m.schemaVersion).toBe(5);
    expect(m.rubber).toBeNull();
    expect(m.mode).toBe('CLASSIC');
    expect(m.botSeats).toEqual({ N: false, E: false, S: false, W: false });
  });
});

describe('server bot', () => {
  it('plays a whole match legally when every seat is a bot', () => {
    let s = started();
    s = { ...s, botSeats: { N: true, E: true, S: true, W: true } };
    let steps = 0;
    for (;;) {
      const next = applyBotStep(s, deps());
      if (!next) break;
      expect(next.version).toBe(s.version + 1);
      s = next;
      if (++steps > 500) throw new Error('bot loop');
    }
    expect(s.phase).toBe('MATCH_COMPLETED');
    expect(s.completedBoards).toHaveLength(1);
    // all passing → passed out board
    expect(s.completedBoards[0]?.result.kind).toBe('PASSED_OUT');
  });

  it('finishes 13 tricks as declarer when humans bid and then drop', () => {
    let s = started();
    // Dealer of board 1 is N: N opens 1NT, others pass → N declares; then N's seat becomes a bot.
    s = ok(exec(s, U.N, { type: 'auction:call', payload: { kind: 'BID', level: 1, strain: 'NT' } }));
    for (const seat of ['E', 'S', 'W'] as const) s = ok(exec(s, U[seat], { type: 'auction:call', payload: { kind: 'PASS' } }));
    s = { ...s, botSeats: { N: true, E: true, S: true, W: true } };
    for (let i = 0; i < 60 && s.phase === 'PLAYING'; i++) {
      const next = applyBotStep(s, deps());
      if (!next) break;
      s = next;
    }
    expect(s.phase).toBe('BOARD_RESULT');
    expect(s.completedBoards[0]?.result.kind).toBe('PLAYED');
  });

  it('does nothing when no bot must act', () => {
    expect(applyBotStep(started(), deps())).toBeNull();
  });

  it('chooseCard: wins cheaply, plays low under a winning partner', () => {
    // E led ♠5, S (partner of N) played ♠K; W to play holding ♠A ♠2 → wins with A
    expect(chooseCard('W', ['AS', '2S'], [{ seat: 'E', card: '5S' }, { seat: 'S', card: 'KS' }], null)).toBe('AS');
    // N to play, partner S is winning with ♠K → play low
    expect(chooseCard('N', ['AS', '2S'], [{ seat: 'E', card: '5S' }, { seat: 'S', card: 'KS' }, { seat: 'W', card: '3S' }], null)).toBe('2S');
    // void in led suit with trumps: ruff with lowest trump
    expect(chooseCard('W', ['9H', '3H', '4C'], [{ seat: 'S', card: 'AD' }], 'H')).toBe('3H');
  });
});
