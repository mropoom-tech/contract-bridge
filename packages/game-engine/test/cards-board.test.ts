import { describe, expect, it } from 'vitest';
import {
  createCryptoRandom,
  createDeck,
  createSeededRandom,
  deal,
  getBoardConfiguration,
  isCard,
  isValidDeal,
  nextSeat,
  partnerOf,
  partnershipOf,
  isVulnerable,
  shuffle,
  sortHand,
  SEATS,
} from '../src/index.js';

describe('cards', () => {
  it('creates 52 unique valid cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
    expect(deck.every(isCard)).toBe(true);
    expect(deck).toContain('AS');
    expect(deck).toContain('TD');
  });

  it('rejects malformed card codes', () => {
    for (const bad of ['1S', 'AX', 'as', '10D', '', 'ASS', 42, null]) expect(isCard(bad)).toBe(false);
  });

  it('shuffle is a permutation and deterministic for a seeded RNG', () => {
    const a = shuffle(createDeck(), createSeededRandom(7));
    const b = shuffle(createDeck(), createSeededRandom(7));
    const c = shuffle(createDeck(), createSeededRandom(8));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect([...a].sort()).toEqual([...createDeck()].sort());
  });

  it('deals 4 x 13 unique cards across many seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const hands = deal(createSeededRandom(seed));
      expect(isValidDeal(hands)).toBe(true);
    }
  });

  it('crypto random deals are valid and stay in range', () => {
    const rng = createCryptoRandom();
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(52);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(52);
    }
    expect(isValidDeal(deal(rng))).toBe(true);
    expect(() => rng.nextInt(0)).toThrow(RangeError);
  });

  it('isValidDeal rejects duplicates and wrong counts', () => {
    const hands = deal(createSeededRandom(1));
    expect(isValidDeal({ ...hands, N: [...hands.N.slice(1), hands.E[0]!] })).toBe(false);
    expect(isValidDeal({ ...hands, N: hands.N.slice(1) })).toBe(false);
  });

  it('sorts hands S,H,D,C high to low', () => {
    expect(sortHand(['2C', 'AH', 'KS', 'TD', 'AS'])).toEqual(['AS', 'KS', 'AH', 'TD', '2C']);
  });
});

describe('seats', () => {
  it('rotates clockwise and pairs partners', () => {
    expect(SEATS.map(nextSeat)).toEqual(['E', 'S', 'W', 'N']);
    expect(SEATS.map(partnerOf)).toEqual(['S', 'W', 'N', 'E']);
    expect(SEATS.map(partnershipOf)).toEqual(['NS', 'EW', 'NS', 'EW']);
  });
  it('vulnerability membership', () => {
    expect(isVulnerable('NONE', 'NS')).toBe(false);
    expect(isVulnerable('BOTH', 'EW')).toBe(true);
    expect(isVulnerable('NS', 'NS')).toBe(true);
    expect(isVulnerable('NS', 'EW')).toBe(false);
  });
});

describe('board configuration', () => {
  const expected: [number, string, string][] = [
    [1, 'N', 'NONE'], [2, 'E', 'NS'], [3, 'S', 'EW'], [4, 'W', 'BOTH'],
    [5, 'N', 'NS'], [6, 'E', 'EW'], [7, 'S', 'BOTH'], [8, 'W', 'NONE'],
    [9, 'N', 'EW'], [10, 'E', 'BOTH'], [11, 'S', 'NONE'], [12, 'W', 'NS'],
    [13, 'N', 'BOTH'], [14, 'E', 'NONE'], [15, 'S', 'NS'], [16, 'W', 'EW'],
  ];
  it.each(expected)('board %i: dealer %s, vul %s', (n, dealer, vul) => {
    expect(getBoardConfiguration(n)).toEqual({ boardNumber: n, dealer, vulnerability: vul });
  });
  it('repeats every 16 boards', () => {
    for (let n = 1; n <= 16; n++) {
      const a = getBoardConfiguration(n);
      const b = getBoardConfiguration(n + 16);
      expect([b.dealer, b.vulnerability]).toEqual([a.dealer, a.vulnerability]);
    }
  });
  it('rejects invalid board numbers', () => {
    expect(() => getBoardConfiguration(0)).toThrow(RangeError);
    expect(() => getBoardConfiguration(1.5)).toThrow(RangeError);
  });
});
