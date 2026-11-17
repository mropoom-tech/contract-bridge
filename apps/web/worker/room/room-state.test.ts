import { describe, expect, it } from 'vitest';
import { createSeededRandom, isDummyRevealed, SEATS, type Card, type Seat } from '@bridge/game-engine';
import { PROTOCOL_VERSION, type MutatingCommand } from '@bridge/shared';
import { projectRoomForUser } from './room-projection';
import {
  acknowledgeWrites,
  createRoomState,
  handleCommand,
  migrateRoomState,
  joinRoom,
  MAX_PROCESSED_REQUESTS,
  type CommandOutcome,
  type RoomDeps,
  type RoomState,
} from './room-state';

const USERS: Record<Seat, string> = { N: 'u-north', E: 'u-east', S: 'u-south', W: 'u-west' };
let counter = 0;
const rid = (): string => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
const deps = (seed = 1): RoomDeps => ({ rng: createSeededRandom(seed), newId: () => 'match-1', now: () => '2026-11-17T00:00:00.000Z' });

type Body = Pick<MutatingCommand, 'type' | 'payload'>;
const cmd = (state: RoomState, body: Body, requestId = rid()): MutatingCommand =>
  ({ protocolVersion: PROTOCOL_VERSION, requestId, expectedVersion: state.version, ...body }) as MutatingCommand;

const must = (o: CommandOutcome): RoomState => {
  if (o.response.status !== 'accepted') throw new Error(`${o.response.code}: ${o.response.message}`);
  return o.state;
};
const run = (state: RoomState, user: string, body: Body, d = deps()): RoomState => must(handleCommand(state, user, cmd(state, body), d));
const codeOf = (o: CommandOutcome) => (o.response.status === 'error' ? o.response.code : 'accepted');

const newRoom = (): RoomState =>
  createRoomState({
    roomId: 'room-1',
    code: 'ABCDEFGH',
    host: { userId: USERS.N, displayName: 'เหนือ' },
    targetBoards: 2,
    createdAt: '2026-11-17T00:00:00.000Z',
  });

const join = (s: RoomState, userId: string): RoomState => {
  const r = joinRoom(s, { userId, displayName: userId });
  if (!r.ok) throw new Error(r.error.code);
  return r.state;
};

const seatedReady = (): RoomState => {
  let s = newRoom();
  for (const seat of ['E', 'S', 'W'] as const) s = join(s, USERS[seat]);
  for (const seat of SEATS) {
    s = run(s, USERS[seat], { type: 'room:claimSeat', payload: { seat } });
    s = run(s, USERS[seat], { type: 'room:ready', payload: { ready: true } });
  }
  return s;
};

const started = (seed = 1): RoomState => run(seatedReady(), USERS.N, { type: 'room:start', payload: {} }, deps(seed));

describe('membership', () => {
  it('admits up to four, idempotent for existing members, closed after start', () => {
    let s = newRoom();
    s = join(s, 'a');
    const again = joinRoom(s, { userId: 'a', displayName: 'a' });
    expect(again.ok && !again.changed).toBe(true);
    s = join(join(s, 'b'), 'c');
    expect(joinRoom(s, { userId: 'd', displayName: 'd' })).toMatchObject({ ok: false, error: { code: 'ROOM_FULL' } });
    expect(joinRoom(started(), { userId: 'x', displayName: 'x' })).toMatchObject({ ok: false, error: { code: 'ROOM_CLOSED' } });
  });

  it('non-members are forbidden and nothing is persisted', () => {
    const s = newRoom();
    const o = handleCommand(s, 'stranger', cmd(s, { type: 'room:claimSeat', payload: { seat: 'N' } }), deps());
    expect(codeOf(o)).toBe('FORBIDDEN');
    expect(o.persist).toBe(false);
  });

  it('host leaving transfers host; leaving is blocked mid-match', () => {
    let s = join(newRoom(), USERS.E);
    s = run(s, USERS.N, { type: 'room:leave', payload: {} });
    expect(s.hostUserId).toBe(USERS.E);
    expect(s.members.map((m) => m.userId)).toEqual([USERS.E]);
    const g = started();
    expect(codeOf(handleCommand(g, USERS.E, cmd(g, { type: 'room:leave', payload: {} }), deps()))).toBe('INVALID_PHASE');
  });
});

describe('seats, ready and start', () => {
  it('rejects taken seats, allows switching seats in WAITING, resets ready', () => {
    let s = join(newRoom(), USERS.E);
    s = run(s, USERS.N, { type: 'room:claimSeat', payload: { seat: 'N' } });
    expect(codeOf(handleCommand(s, USERS.E, cmd(s, { type: 'room:claimSeat', payload: { seat: 'N' } }), deps()))).toBe('SEAT_TAKEN');
    s = run(s, USERS.N, { type: 'room:ready', payload: { ready: true } });
    s = run(s, USERS.N, { type: 'room:claimSeat', payload: { seat: 'W' } });
    expect(s.seats.N).toBeNull();
    expect(s.seats.W).toEqual({ userId: USERS.N, ready: false });
  });

  it('ready requires a seat', () => {
    const s = join(newRoom(), USERS.E);
    expect(codeOf(handleCommand(s, USERS.E, cmd(s, { type: 'room:ready', payload: { ready: true } }), deps()))).toBe('FORBIDDEN');
  });

  it('only the host starts, and only with four ready seats', () => {
    const s = seatedReady();
    expect(codeOf(handleCommand(s, USERS.E, cmd(s, { type: 'room:start', payload: {} }), deps()))).toBe('FORBIDDEN');
    const notReady = run(s, USERS.W, { type: 'room:ready', payload: { ready: false } });
    expect(codeOf(handleCommand(notReady, USERS.N, cmd(notReady, { type: 'room:start', payload: {} }), deps()))).toBe('INVALID_PHASE');
    const g = started();
    expect(g.phase).toBe('BIDDING');
    expect(g.matchId).toBe('match-1');
    expect(g.board?.boardNumber).toBe(1);
    expect(codeOf(handleCommand(g, USERS.E, cmd(g, { type: 'room:claimSeat', payload: { seat: 'E' } }), deps()))).toBe('INVALID_PHASE');
  });
});

describe('versioning and idempotency', () => {
  it('stale expectedVersion is rejected and not remembered; retry with same requestId succeeds', () => {
    const s = join(newRoom(), USERS.E);
    const id = rid();
    const stale = { ...cmd(s, { type: 'room:claimSeat', payload: { seat: 'E' } }, id), expectedVersion: s.version - 1 };
    const o1 = handleCommand(s, USERS.E, stale, deps());
    expect(codeOf(o1)).toBe('STALE_VERSION');
    expect(o1.response.stateVersion).toBe(s.version);
    expect(o1.persist).toBe(false);
    const o2 = handleCommand(s, USERS.E, cmd(s, { type: 'room:claimSeat', payload: { seat: 'E' } }, id), deps());
    expect(codeOf(o2)).toBe('accepted');
  });

  it('duplicate requestId yields the same ack and exactly one transition', () => {
    const g = started();
    const c = cmd(g, { type: 'auction:call', payload: { kind: 'BID', level: 1, strain: 'C' } });
    const o1 = handleCommand(g, USERS.N, c, deps());
    expect(o1.response).toEqual({ status: 'accepted', stateVersion: g.version + 1 });
    const o2 = handleCommand(o1.state, USERS.N, c, deps());
    expect(o2.response).toEqual(o1.response);
    expect(o2.persist).toBe(false);
    expect(o2.state).toBe(o1.state);
    expect(o2.state.board?.auction.calls).toHaveLength(1);
  });

  it('same requestId from a different user is a different request', () => {
    const g = started();
    const id = rid();
    const o1 = handleCommand(g, USERS.E, cmd(g, { type: 'auction:call', payload: { kind: 'PASS' } }, id), deps());
    expect(codeOf(o1)).toBe('NOT_YOUR_TURN');
    const o2 = handleCommand(o1.state, USERS.N, cmd(o1.state, { type: 'auction:call', payload: { kind: 'PASS' } }, id), deps());
    expect(codeOf(o2)).toBe('accepted');
  });

  it('rule rejections are remembered without bumping the version; dedup log is bounded', () => {
    let g = started();
    const v = g.version;
    for (let i = 0; i < MAX_PROCESSED_REQUESTS + 10; i++) {
      g = handleCommand(g, USERS.E, cmd(g, { type: 'auction:call', payload: { kind: 'PASS' } }), deps()).state;
    }
    expect(g.version).toBe(v);
    expect(g.processedRequests).toHaveLength(MAX_PROCESSED_REQUESTS);
  });
});

describe('auction and play authority (SECURITY threat cases)', () => {
  it('out-of-turn bid and doubling own side are denied', () => {
    let g = started(); // board 1 dealer N
    expect(codeOf(handleCommand(g, USERS.E, cmd(g, { type: 'auction:call', payload: { kind: 'PASS' } }), deps()))).toBe('NOT_YOUR_TURN');
    g = run(g, USERS.N, { type: 'auction:call', payload: { kind: 'BID', level: 1, strain: 'H' } });
    g = run(g, USERS.E, { type: 'auction:call', payload: { kind: 'PASS' } });
    expect(codeOf(handleCommand(g, USERS.S, cmd(g, { type: 'auction:call', payload: { kind: 'DOUBLE' } }), deps()))).toBe('ILLEGAL_BID');
    expect(codeOf(handleCommand(g, USERS.S, cmd(g, { type: 'auction:call', payload: { kind: 'BID', level: 1, strain: 'D' } }), deps()))).toBe('ILLEGAL_BID');
    expect(codeOf(handleCommand(g, USERS.S, cmd(g, { type: 'card:play', payload: { fromSeat: 'S', card: '2C' } }), deps()))).toBe('INVALID_PHASE');
  });

  it('dummy cannot play; declarer plays dummy only on dummy turn; other seats denied', () => {
    let g = started(3);
    g = run(g, USERS.N, { type: 'auction:call', payload: { kind: 'BID', level: 1, strain: 'NT' } });
    for (const seat of ['E', 'S', 'W'] as const) g = run(g, USERS[seat], { type: 'auction:call', payload: { kind: 'PASS' } });
    expect(g.phase).toBe('PLAYING'); // declarer N, dummy S, leader E
    const play = g.board!.play!;
    const eLead = play.hands.E[0] as Card;
    // N tries to play E's card
    expect(codeOf(handleCommand(g, USERS.N, cmd(g, { type: 'card:play', payload: { fromSeat: 'E', card: eLead } }), deps()))).toBe('NOT_YOUR_TURN');
    // E plays a card it doesn't hold
    const notHeld = play.hands.W[0] as Card;
    expect(codeOf(handleCommand(g, USERS.E, cmd(g, { type: 'card:play', payload: { fromSeat: 'E', card: notHeld } }), deps()))).toBe('ILLEGAL_CARD');
    g = run(g, USERS.E, { type: 'card:play', payload: { fromSeat: 'E', card: eLead } });
    // dummy S's own account cannot play
    const sView = projectRoomForUser(g, USERS.N, new Set()).allowedActions.play;
    expect(sView?.fromSeat).toBe('S');
    const dummyCard = sView!.cards[0] as Card;
    expect(codeOf(handleCommand(g, USERS.S, cmd(g, { type: 'card:play', payload: { fromSeat: 'S', card: dummyCard } }), deps()))).toBe('FORBIDDEN');
    // declarer can't play own hand on dummy's turn
    expect(codeOf(handleCommand(g, USERS.N, cmd(g, { type: 'card:play', payload: { fromSeat: 'N', card: play.hands.N[0] as Card } }), deps()))).toBe('NOT_YOUR_TURN');
    g = run(g, USERS.N, { type: 'card:play', payload: { fromSeat: 'S', card: dummyCard } });
    expect(g.board!.play!.currentTrick.cards).toHaveLength(2);
  });
});

/** Every card string visible anywhere in a payload. */
const visibleCards = (payload: unknown): Set<string> =>
  new Set(JSON.stringify(payload).match(/"[2-9TJQKA][CDHS]"/g)?.map((s) => s.slice(1, 3)) ?? []);

/** Assert no viewer can see any concealed (unplayed, non-public) card of another seat. */
const assertNoLeak = (s: RoomState): void => {
  const board = s.board;
  if (!board) return;
  const play = board.play;
  const remaining = play ? play.hands : board.deal;
  const dummy = play && isDummyRevealed(play) ? play.contract.dummy : null;
  for (const viewerSeat of SEATS) {
    const snap = projectRoomForUser(s, USERS[viewerSeat], new Set(Object.values(USERS)));
    const seen = visibleCards(snap);
    for (const other of SEATS) {
      if (other === viewerSeat || other === dummy) continue;
      for (const c of remaining[other]) expect(seen.has(c), `${viewerSeat} sees ${other}'s ${c}`).toBe(false);
    }
  }
  expect(visibleCards(projectRoomForUser(s, 'stranger', new Set())).size).toBe(0);
};

describe('full match through projections only', () => {
  it('plays a 2-board match to MATCH_COMPLETED with no hidden-card leak at any step', () => {
    const rng = createSeededRandom(77);
    let s = started(5);
    assertNoLeak(s);
    let steps = 0;
    while (s.phase !== 'MATCH_COMPLETED' && steps++ < 1000) {
      // find the user who has an action
      const actor = SEATS.map((seat) => USERS[seat]).find((u) => {
        const a = projectRoomForUser(s, u, new Set()).allowedActions;
        return a.calls.length > 0 || a.play !== null || (a.readyNext && s.nextBoardReady?.[SEATS.find((x) => USERS[x] === u)!] === false);
      });
      if (!actor) throw new Error(`no actor in phase ${s.phase}`);
      const a = projectRoomForUser(s, actor, new Set()).allowedActions;
      let body: Body;
      if (a.calls.length > 0) {
        // mostly pass, sometimes the cheapest bid, so auctions end quickly but vary
        const bids = a.calls.filter((c) => c.kind === 'BID');
        body = { type: 'auction:call', payload: rng.nextInt(3) === 0 && bids[0] ? bids[0] : { kind: 'PASS' } };
      } else if (a.play) {
        body = { type: 'card:play', payload: { fromSeat: a.play.fromSeat, card: a.play.cards[rng.nextInt(a.play.cards.length)] as Card } };
      } else {
        body = { type: 'board:readyNext', payload: { ready: true } };
      }
      s = run(s, actor, body, deps(steps));
      assertNoLeak(s);
    }
    expect(s.phase).toBe('MATCH_COMPLETED');
    expect(s.completedBoards).toHaveLength(2);
    expect(s.completedBoards.map((b) => b.boardNumber)).toEqual([1, 2]);
    const snap = projectRoomForUser(s, USERS.E, new Set());
    expect(snap.public.totalNsScore).toBe(s.completedBoards.reduce((t, b) => t + b.result.nsScore, 0));
    expect(snap.allowedActions.readyNext).toBe(false);
  });
});

describe('projection basics', () => {
  it('waiting room shows seats, lobby, presence and allowed actions', () => {
    let s = join(newRoom(), USERS.E);
    s = run(s, USERS.N, { type: 'room:claimSeat', payload: { seat: 'S' } });
    const snap = projectRoomForUser(s, USERS.E, new Set([USERS.N]));
    expect(snap.public.seats.S).toEqual({ displayName: 'เหนือ', online: true, ready: false, isHost: true });
    expect(snap.public.lobby).toEqual([{ displayName: USERS.E, online: false, isHost: false }]);
    expect(snap.allowedActions.claimSeat).toEqual(['N', 'E', 'W']);
    expect(snap.allowedActions.ready).toBe(false);
    expect(snap.you).toMatchObject({ userId: USERS.E, seat: null, isHost: false, yourHand: [] });
    expect(snap.public.dummyCards).toBeNull();
  });

  it('bidding snapshot gives own hand and legal calls only to the bidder', () => {
    const g = started(9);
    const n = projectRoomForUser(g, USERS.N, new Set());
    expect(n.you.yourHand).toEqual(g.board!.deal.N);
    expect(n.allowedActions.calls).toHaveLength(36);
    expect(projectRoomForUser(g, USERS.E, new Set()).allowedActions.calls).toHaveLength(0);
    expect(n.public.cardCounts).toEqual({ N: 13, E: 13, S: 13, W: 13 });
  });
});

describe('D1 outbox and persistence', () => {
  it('start, board results and final board enqueue idempotent writes (no hidden cards)', () => {
    let s = started(5);
    expect(s.pendingWrites.map((w) => w.id)).toEqual(['match-1:start']);
    const start = s.pendingWrites[0];
    expect(start?.kind === 'MATCH_START' && start.players.map((p) => p.userId)).toEqual(SEATS.map((x) => USERS[x]));
    // pass out board 1 (dealer N)
    for (const seat of SEATS) s = run(s, USERS[seat], { type: 'auction:call', payload: { kind: 'PASS' } });
    expect(s.pendingWrites.map((w) => w.id)).toEqual(['match-1:start', 'match-1:board:1']);
    for (const seat of SEATS) s = run(s, USERS[seat], { type: 'board:readyNext', payload: { ready: true } });
    // board 2 dealer E; pass out -> final board -> MATCH_END
    for (const seat of ['E', 'S', 'W', 'N'] as const) s = run(s, USERS[seat], { type: 'auction:call', payload: { kind: 'PASS' } });
    expect(s.pendingWrites.map((w) => w.id)).toEqual(['match-1:start', 'match-1:board:1', 'match-1:board:2', 'match-1:end']);
    const json = JSON.stringify(s.pendingWrites);
    for (const c of s.board!.deal.N) expect(json.includes(`"${c}"`)).toBe(false);
    const acked = acknowledgeWrites(s, new Set(['match-1:start', 'match-1:board:1']));
    expect(acked.pendingWrites.map((w) => w.id)).toEqual(['match-1:board:2', 'match-1:end']);
  });

  it('restores from persisted storage (structured clone) and continues identically', () => {
    let s = started(11);
    s = run(s, USERS.N, { type: 'auction:call', payload: { kind: 'BID', level: 1, strain: 'NT' } });
    const restored = migrateRoomState(structuredClone(s));
    expect(restored).toEqual(s);
    for (const seat of SEATS) {
      expect(projectRoomForUser(restored, USERS[seat], new Set())).toEqual(projectRoomForUser(s, USERS[seat], new Set()));
    }
    const next = run(restored, USERS.E, { type: 'auction:call', payload: { kind: 'PASS' } });
    expect(next.version).toBe(s.version + 1);
    // a retried request already processed before the restart is still deduplicated
    const id = rid();
    const once = handleCommand(next, USERS.S, cmd(next, { type: 'auction:call', payload: { kind: 'PASS' } }, id), deps());
    const afterRestart = migrateRoomState(structuredClone(once.state));
    const dup = handleCommand(afterRestart, USERS.S, cmd(next, { type: 'auction:call', payload: { kind: 'PASS' } }, id), deps());
    expect(dup.response).toEqual(once.response);
    expect(dup.persist).toBe(false);
  });

  it('migrates schema v1 snapshots and rejects unknown versions', () => {
    const v2 = newRoom();
    const { pendingWrites: _drop, ...rest } = v2;
    void _drop;
    const v1 = { ...rest, schemaVersion: 1 };
    expect(migrateRoomState(v1)).toEqual(v2);
    expect(() => migrateRoomState({ ...v2, schemaVersion: 99 })).toThrow();
  });
});
