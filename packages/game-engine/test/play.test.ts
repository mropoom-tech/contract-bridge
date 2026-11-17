import { describe, expect, it } from 'vitest';
import {
  applyCard,
  controllingSeat,
  createPlayState,
  isDummyRevealed,
  legalCards,
  resolveTrick,
  seatToPlay,
  validateCardPlay,
  type Card,
  type Contract,
  type PlayState,
  type Seat,
} from '../src/index.js';
import { MIXED_DEAL, SUIT_PER_SEAT_DEAL } from './helpers.js';

const contract = (declarer: Seat, dummy: Seat, openingLeader: Seat, strain: Contract['strain'] = 'S'): Contract => ({
  level: 4,
  strain,
  doubled: 0,
  declarer,
  dummy,
  openingLeader,
});

const play = (state: PlayState, actor: Seat, card: Card): PlayState => {
  const r = applyCard(state, actor, card);
  if (!r.ok) throw new Error(`${r.error.code} ${actor} ${card}`);
  return r.value;
};

describe('resolveTrick', () => {
  const trick = [
    { seat: 'W' as const, card: '2C' as const },
    { seat: 'N' as const, card: 'AS' as const },
    { seat: 'E' as const, card: '3H' as const },
    { seat: 'S' as const, card: 'AD' as const },
  ];
  it('trump beats led suit', () => expect(resolveTrick(trick, 'H')).toBe('E'));
  it('off-suit aces lose to the led suit without trump (NT)', () => expect(resolveTrick(trick, null)).toBe('W'));
  it('higher trump beats lower trump', () => {
    expect(resolveTrick([...trick.slice(0, 3), { seat: 'S', card: '4H' }], 'H')).toBe('S');
  });
  it('highest of led suit wins', () => {
    expect(
      resolveTrick(
        [
          { seat: 'N', card: 'TS' },
          { seat: 'E', card: 'KS' },
          { seat: 'S', card: 'AH' },
          { seat: 'W', card: 'QS' },
        ],
        null,
      ),
    ).toBe('E');
  });
  it('rejects incomplete tricks', () => expect(() => resolveTrick(trick.slice(0, 3), null)).toThrow());
});

describe('card play legality (4S by N, dummy S, E leads)', () => {
  // N: 2-5S QKA H 9TJ D 678C | E: 678S 2-5H QKA D 9TJ C | S: 9TJS 678H 2-5D QKA C | W: QKA S 9TJ H 678D 2-5C
  const start = createPlayState(contract('N', 'S', 'E'), MIXED_DEAL);

  it('opening leader acts first; dummy not yet revealed', () => {
    expect(seatToPlay(start)).toBe('E');
    expect(isDummyRevealed(start)).toBe(false);
    expect(validateCardPlay(start, 'N', '2S')).toMatchObject({ ok: false, error: { code: 'NOT_YOUR_TURN' } });
    expect(validateCardPlay(start, 'E', 'AS')).toMatchObject({ ok: false, error: { code: 'CARD_NOT_IN_HAND' } });
    expect(validateCardPlay(start, 'E', 'ZZ' as Card)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  const afterLead = play(start, 'E', '2H');

  it('dummy revealed after opening lead; declarer controls dummy', () => {
    expect(isDummyRevealed(afterLead)).toBe(true);
    expect(seatToPlay(afterLead)).toBe('S');
    expect(controllingSeat(afterLead)).toBe('N');
    expect(validateCardPlay(afterLead, 'S', '6H')).toMatchObject({ ok: false, error: { code: 'DUMMY_CANNOT_PLAY' } });
    expect(validateCardPlay(afterLead, 'W', '9H')).toMatchObject({ ok: false, error: { code: 'NOT_YOUR_TURN' } });
  });

  it('must follow suit when able; declarer cannot play own card on dummy turn', () => {
    expect(validateCardPlay(afterLead, 'N', '2D')).toMatchObject({ ok: false, error: { code: 'MUST_FOLLOW_SUIT' } });
    expect(validateCardPlay(afterLead, 'N', 'AH')).toMatchObject({ ok: false, error: { code: 'CARD_NOT_IN_HAND' } });
    expect(legalCards(afterLead)).toEqual(['8H', '7H', '6H']);
  });

  it('completes a trick, winner leads next, card cannot be replayed', () => {
    let s = play(afterLead, 'N', '6H'); // S (dummy) plays via declarer
    s = play(s, 'W', '9H');
    expect(controllingSeat(s)).toBe('N');
    expect(validateCardPlay(s, 'N', '9S')).toMatchObject({ ok: false, error: { code: 'CARD_NOT_IN_HAND' } });
    s = play(s, 'N', 'AH');
    expect(s.completedTricks).toHaveLength(1);
    expect(s.completedTricks[0]?.winner).toBe('N');
    expect(seatToPlay(s)).toBe('N');
    expect(s.hands.E).not.toContain('2H');
    expect(s.hands.E).toHaveLength(12);
    // N leads; later E cannot replay 2H
    s = play(s, 'N', '2S');
    expect(validateCardPlay(s, 'E', '2H')).toMatchObject({ ok: false, error: { code: 'CARD_NOT_IN_HAND' } });
    expect(validateCardPlay(s, 'E', '6S').ok).toBe(true);
  });

  it('a void player may discard or ruff', () => {
    const st = createPlayState(contract('S', 'N', 'W', 'H'), SUIT_PER_SEAT_DEAL);
    let s = play(st, 'W', '2C');
    expect(legalCards(s)).toHaveLength(13); // N (dummy) void in clubs
    s = play(s, 'S', 'AS'); // declarer plays for dummy N
    s = play(s, 'E', '3H'); // ruff
    s = play(s, 'S', 'AD');
    expect(s.completedTricks[0]?.winner).toBe('E');
    expect(seatToPlay(s)).toBe('E');
  });

  it('applyCard never mutates the input state', () => {
    const snapshot = JSON.stringify(start);
    play(start, 'E', '2H');
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});
