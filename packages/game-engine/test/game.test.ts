import { describe, expect, it } from 'vitest';
import {
  boardCall,
  boardPlay,
  createBoard,
  createBoardWithDeal,
  createSeededRandom,
  projectBoardForSeat,
  SEATS,
  summarizeAuction,
  type BoardState,
  type Call,
  type Card,
  type RandomSource,
  type Seat,
} from '../src/index.js';
import { bid, MIXED_DEAL, P, X } from './helpers.js';

const callAll = (board: BoardState, calls: Call[]): BoardState =>
  calls.reduce((b, call) => {
    const seat = summarizeAuction(b.auction).toAct as Seat;
    const r = boardCall(b, seat, call);
    if (!r.ok) throw new Error(r.error.code);
    return r.value;
  }, board);

/** Play out all 13 tricks choosing random legal cards via the projected view. */
const playOut = (board: BoardState, rng: RandomSource): BoardState => {
  let b = board;
  while (b.phase === 'PLAYING') {
    const controller = projectBoardForSeat(b, null).controller as Seat;
    const view = projectBoardForSeat(b, controller);
    const card = view.legalCards[rng.nextInt(view.legalCards.length)] as Card;
    const r = boardPlay(b, controller, card);
    if (!r.ok) throw new Error(r.error.code);
    b = r.value;
  }
  return b;
};

describe('board lifecycle', () => {
  it('passed-out board scores zero and skips play', () => {
    const b = callAll(createBoard(1, createSeededRandom(1)), [P, P, P, P]);
    expect(b.phase).toBe('COMPLETED');
    expect(b.play).toBeNull();
    expect(b.result).toEqual({ kind: 'PASSED_OUT', nsScore: 0, ewScore: 0 });
    expect(boardCall(b, 'N', P)).toMatchObject({ ok: false, error: { code: 'WRONG_PHASE' } });
    expect(boardPlay(b, 'N', '2C')).toMatchObject({ ok: false, error: { code: 'WRONG_PHASE' } });
  });

  it('cannot play cards during the auction', () => {
    const b = createBoard(1, createSeededRandom(2));
    expect(boardPlay(b, 'N', b.deal.N[0] as Card)).toMatchObject({ ok: false, error: { code: 'WRONG_PHASE' } });
  });

  it('createBoardWithDeal rejects invalid deals', () => {
    expect(() => createBoardWithDeal(1, { ...MIXED_DEAL, N: MIXED_DEAL.E })).toThrow();
  });

  it('plays 300 random full boards with consistent invariants', () => {
    const rng = createSeededRandom(12345);
    for (let i = 0; i < 300; i++) {
      const boardNumber = (i % 16) + 1;
      let b = createBoard(boardNumber, rng);
      const dealer = b.dealer;
      const levelIdx = rng.nextInt(7);
      const strain = (['C', 'D', 'H', 'S', 'NT'] as const)[rng.nextInt(5)] ?? 'NT';
      const dbl = rng.nextInt(3);
      const calls: Call[] = [bid((levelIdx + 1) as 1, strain)];
      if (dbl >= 1) calls.push(X);
      if (dbl === 2) calls.push({ type: 'REDOUBLE' });
      b = callAll(b, [...calls, P, P, P]);
      expect(b.phase).toBe('PLAYING');
      expect(b.play?.contract.declarer).toBe(dealer);

      b = playOut(b, rng);
      expect(b.phase).toBe('COMPLETED');
      const play = b.play!;
      expect(play.completedTricks).toHaveLength(13);
      SEATS.forEach((s) => expect(play.hands[s]).toHaveLength(0));
      const played = play.completedTricks.flatMap((t) => t.cards.map((c) => c.card));
      expect(new Set(played).size).toBe(52);
      // each trick: 4 distinct seats in clockwise order from leader, next leader = previous winner
      play.completedTricks.forEach((t, idx) => {
        expect(t.cards.map((c) => c.seat)).toEqual(
          [0, 1, 2, 3].map((k) => SEATS[(SEATS.indexOf(t.leader) + k) % 4]),
        );
        if (idx > 0) expect(t.leader).toBe(play.completedTricks[idx - 1]!.winner);
        else expect(t.leader).toBe(play.contract.openingLeader);
      });
      const r = b.result;
      if (r?.kind !== 'PLAYED') throw new Error('expected played result');
      expect(r.nsScore + r.ewScore).toBe(0);
      expect(r.declarerTricks).toBeGreaterThanOrEqual(0);
      expect(r.declarerTricks).toBeLessThanOrEqual(13);
      const nsDeclares = r.contract.declarer === 'N' || r.contract.declarer === 'S';
      expect(r.nsScore).toBe(nsDeclares ? r.declarerScore : -r.declarerScore);
      expect(boardPlay(b, 'N', '2C')).toMatchObject({ ok: false, error: { code: 'WRONG_PHASE' } });
    }
  });

  it('EW declarer made contract produces negative NS score', () => {
    // Board 2: dealer E, NS vulnerable. E opens 1NT.
    let b = createBoardWithDeal(2, MIXED_DEAL);
    b = callAll(b, [bid(1, 'NT'), P, P, P]);
    expect(b.play?.contract).toMatchObject({ declarer: 'E', dummy: 'W', openingLeader: 'S' });
    b = playOut(b, createSeededRandom(9));
    const r = b.result;
    if (r?.kind !== 'PLAYED') throw new Error('expected played');
    expect(r.nsScore).toBe(-r.declarerScore);
    expect(r.ewScore).toBe(r.declarerScore);
  });
});

describe('projection hides concealed cards', () => {
  const cardsIn = (json: string): Set<string> =>
    new Set(json.match(/"[2-9TJQKA][CDHS]"/g)?.map((s) => s.slice(1, 3)) ?? []);

  it('during bidding each seat sees only its own hand', () => {
    const b = createBoard(1, createSeededRandom(3));
    for (const viewer of SEATS) {
      const v = projectBoardForSeat(b, viewer);
      expect(v.ownHand).toEqual(b.deal[viewer]);
      expect(v.dummyHand).toBeNull();
      expect(v.handCounts).toEqual({ N: 13, E: 13, S: 13, W: 13 });
      const visible = cardsIn(JSON.stringify(v));
      for (const other of SEATS.filter((s) => s !== viewer)) {
        b.deal[other].forEach((c) => expect(visible.has(c)).toBe(false));
      }
      expect(v.legalCalls.length > 0).toBe(viewer === 'N');
    }
    const spectator = projectBoardForSeat(b, null);
    expect(cardsIn(JSON.stringify(spectator)).size).toBe(0);
  });

  it('dummy is hidden before the opening lead and public after it', () => {
    let b = createBoardWithDeal(1, MIXED_DEAL);
    b = callAll(b, [bid(4, 'S'), P, P, P]); // N declares, E leads, S dummy
    const before = projectBoardForSeat(b, 'E');
    expect(before.dummyHand).toBeNull();
    MIXED_DEAL.S.forEach((c) => expect(cardsIn(JSON.stringify(before)).has(c)).toBe(false));
    expect(before.legalCards.length).toBe(13);

    const r = boardPlay(b, 'E', '2H');
    if (!r.ok) throw new Error(r.error.code);
    b = r.value;
    for (const viewer of SEATS) {
      const v = projectBoardForSeat(b, viewer);
      expect(v.dummyHand).toEqual(b.play!.hands.S);
      // concealed hands (not viewer, not dummy) never leak
      const visible = cardsIn(JSON.stringify(v));
      for (const other of SEATS.filter((s) => s !== viewer && s !== 'S')) {
        b.play!.hands[other].forEach((c) => expect(visible.has(c)).toBe(false));
      }
    }
    // declarer (not dummy) gets dummy's legal cards on dummy's turn
    expect(projectBoardForSeat(b, 'N').legalCards).toEqual(['8H', '7H', '6H']);
    expect(projectBoardForSeat(b, 'S').legalCards).toEqual([]);
    expect(projectBoardForSeat(b, 'S').controller).toBe('N');
  });
});
