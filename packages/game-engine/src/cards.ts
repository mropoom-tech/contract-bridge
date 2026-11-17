import { SEATS } from './seats.js';
import type { Card, Hands, Rank, Seat, Suit } from './types.js';

export const SUITS: readonly Suit[] = ['C', 'D', 'H', 'S'];
export const RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

const CARD_PATTERN = /^[2-9TJQKA][CDHS]$/;

export const isCard = (value: unknown): value is Card =>
  typeof value === 'string' && CARD_PATTERN.test(value);

export const cardSuit = (card: Card): Suit => card[1] as Suit;
export const cardRank = (card: Card): Rank => card[0] as Rank;
/** 0 for `2` ... 12 for `A`. */
export const rankValue = (rank: Rank): number => RANKS.indexOf(rank);

/** Fresh ordered 52-card deck. */
export const createDeck = (): Card[] =>
  SUITS.flatMap((suit) => RANKS.map((rank): Card => `${rank}${suit}`));

/**
 * Source of uniform random integers. Production must use a CSPRNG
 * (`createCryptoRandom`); tests inject a deterministic source.
 */
export interface RandomSource {
  /** Uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
}

interface CryptoLike {
  getRandomValues<T extends Uint32Array>(array: T): T;
}

/** CSPRNG-backed source using Web Crypto, with rejection sampling to avoid modulo bias. */
export const createCryptoRandom = (
  crypto: CryptoLike = (globalThis as unknown as { crypto: CryptoLike }).crypto,
): RandomSource => ({
  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
      throw new RangeError('maxExclusive must be an integer in [1, 2^32]');
    }
    const limit = 2 ** 32 - (2 ** 32 % maxExclusive);
    const buf = new Uint32Array(1);
    for (;;) {
      crypto.getRandomValues(buf);
      const v = buf[0] ?? 0;
      if (v < limit) return v % maxExclusive;
    }
  },
});

/** Deterministic PRNG (mulberry32). FOR TESTS ONLY — never for real deals. */
export const createSeededRandom = (seed: number): RandomSource => {
  let a = seed >>> 0;
  return {
    nextInt(maxExclusive: number): number {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      return Math.floor(r * maxExclusive);
    },
  };
};

/** Fisher–Yates shuffle; returns a new array. */
export const shuffle = <T>(items: readonly T[], rng: RandomSource): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
};

/** Display/sort order within a hand: spades, hearts, diamonds, clubs; high to low. */
const DISPLAY_SUIT_ORDER: Readonly<Record<Suit, number>> = { S: 0, H: 1, D: 2, C: 3 };

export const sortHand = (cards: readonly Card[]): Card[] =>
  [...cards].sort(
    (a, b) =>
      DISPLAY_SUIT_ORDER[cardSuit(a)] - DISPLAY_SUIT_ORDER[cardSuit(b)] ||
      rankValue(cardRank(b)) - rankValue(cardRank(a)),
  );

/** Shuffle a full deck and deal 13 cards to each seat. */
export const deal = (rng: RandomSource): Hands => {
  const deck = shuffle(createDeck(), rng);
  const hands = {} as Record<Seat, Card[]>;
  SEATS.forEach((seat, i) => {
    hands[seat] = sortHand(deck.slice(i * 13, i * 13 + 13));
  });
  return hands;
};

/** Validates 4 hands x 13 cards forming exactly one 52-card deck. */
export const isValidDeal = (hands: Hands): boolean => {
  const all = SEATS.flatMap((s) => hands[s]);
  return (
    SEATS.every((s) => hands[s].length === 13) &&
    all.every(isCard) &&
    new Set(all).size === 52
  );
};
