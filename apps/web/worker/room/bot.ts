/**
 * Replacement bot for a disconnected player. Deliberately simple and always
 * legal: it passes in the auction and plays a sensible legal card. It only
 * ever sees the hands its seat may see (own hand + dummy after the lead),
 * because it receives exactly the engine's seat projection.
 */
import { cardRank, cardSuit, partnerOf, rankValue, type Card, type PlayedCard, type Seat, type Suit } from '@bridge/game-engine';

const value = (c: Card) => rankValue(cardRank(c));

/** Winner of a partial trick so far (same rules as a full trick). */
export const currentWinner = (cards: readonly PlayedCard[], trump: Suit | null): PlayedCard | null => {
  const lead = cards[0];
  if (!lead) return null;
  const led = cardSuit(lead.card);
  let best = lead;
  for (const pc of cards.slice(1)) {
    const a = cardSuit(pc.card);
    const b = cardSuit(best.card);
    const beats = a === b ? value(pc.card) > value(best.card) : trump !== null && a === trump ? true : trump !== null && b === trump ? false : a === led && b !== led;
    if (beats) best = pc;
  }
  return best;
};

const lowest = (cards: readonly Card[], trump: Suit | null): Card => {
  // Prefer discarding non-trumps; then the lowest rank.
  const sorted = [...cards].sort((x, y) => {
    const tx = cardSuit(x) === trump ? 1 : 0;
    const ty = cardSuit(y) === trump ? 1 : 0;
    return tx - ty || value(x) - value(y);
  });
  const c = sorted[0];
  if (c === undefined) throw new Error('no legal card');
  return c;
};

/**
 * Pick a card for `seat` (the seat whose card is due) from `legal`.
 * Lead low.
 * Follow: if partner is winning play low, else win as cheaply as possible, else play low.
 */
export const chooseCard = (seat: Seat, legal: readonly Card[], trick: readonly PlayedCard[], trump: Suit | null): Card => {
  if (legal.length === 0) throw new Error('no legal card');
  if (trick.length === 0) return lowest(legal, trump);
  const winner = currentWinner(trick, trump);
  if (winner && winner.seat === partnerOf(seat)) return lowest(legal, trump);
  const winning = legal.filter((c) => currentWinner([...trick, { seat, card: c }], trump)?.seat === seat);
  if (winning.length > 0) return lowest(winning, trump);
  return lowest(legal, trump);
};
