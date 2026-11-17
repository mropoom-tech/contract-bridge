import { RANKS, sortHand } from '../src/cards.js';
import type { BidLevel, Call, Card, Hands, Strain, Suit } from '../src/types.js';

export const P: Call = { type: 'PASS' };
export const X: Call = { type: 'DOUBLE' };
export const XX: Call = { type: 'REDOUBLE' };
export const bid = (level: BidLevel, strain: Strain): Call => ({ type: 'BID', level, strain });

const suitCards = (suit: Suit): Card[] => RANKS.map((r): Card => `${r}${suit}`);

/** N = all spades, E = all hearts, S = all diamonds, W = all clubs. */
export const SUIT_PER_SEAT_DEAL: Hands = {
  N: sortHand(suitCards('S')),
  E: sortHand(suitCards('H')),
  S: sortHand(suitCards('D')),
  W: sortHand(suitCards('C')),
};

/** Mixed deal: each seat holds ranks 2-4 / 5-7 / 8-T / J-A blocks... built per suit with rotation. */
export const MIXED_DEAL: Hands = (() => {
  const blocks: Card[][] = [[], [], [], []];
  (['S', 'H', 'D', 'C'] as Suit[]).forEach((suit, si) => {
    suitCards(suit).forEach((card, ri) => {
      // Distribute 13 cards of each suit 4/3/3/3 rotating which seat gets 4.
      const owner = ri < 4 ? si : (si + 1 + Math.floor((ri - 4) / 3)) % 4;
      blocks[owner]?.push(card);
    });
  });
  return { N: sortHand(blocks[0] ?? []), E: sortHand(blocks[1] ?? []), S: sortHand(blocks[2] ?? []), W: sortHand(blocks[3] ?? []) };
})();
