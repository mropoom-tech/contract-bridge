import { cardRank, cardSuit, isCard, rankValue } from './cards.js';
import { partnershipOf, rotate } from './seats.js';
import type {
  Card,
  CompletedTrick,
  Contract,
  Hands,
  PlayedCard,
  PlayState,
  Result,
  Seat,
  Strain,
  Suit,
} from './types.js';
import { fail, ok } from './types.js';

export const TRICKS_PER_BOARD = 13;

export const createPlayState = (contract: Contract, hands: Hands): PlayState => ({
  contract,
  hands: { N: [...hands.N], E: [...hands.E], S: [...hands.S], W: [...hands.W] },
  completedTricks: [],
  currentTrick: { leader: contract.openingLeader, cards: [] },
});

export const isPlayComplete = (play: PlayState): boolean =>
  play.completedTricks.length === TRICKS_PER_BOARD;

/** Seat whose card is due next; null once all 13 tricks are played. */
export const seatToPlay = (play: PlayState): Seat | null =>
  isPlayComplete(play) ? null : rotate(play.currentTrick.leader, play.currentTrick.cards.length);

/** The seat whose user chooses the next card: declarer plays for dummy. */
export const controllingSeat = (play: PlayState): Seat | null => {
  const s = seatToPlay(play);
  if (s === null) return null;
  return s === play.contract.dummy ? play.contract.declarer : s;
};

/** Dummy is face-up once the opening lead has been made. */
export const isDummyRevealed = (play: PlayState): boolean =>
  play.completedTricks.length > 0 || play.currentTrick.cards.length > 0;

export const trumpOf = (strain: Strain): Suit | null => (strain === 'NT' ? null : strain);

/** Winner of a complete 4-card trick. */
export const resolveTrick = (cards: readonly PlayedCard[], trump: Suit | null): Seat => {
  const lead = cards[0];
  if (lead === undefined || cards.length !== 4) throw new Error('A trick needs exactly 4 cards');
  const ledSuit = cardSuit(lead.card);
  const beats = (a: Card, b: Card): boolean => {
    const sa = cardSuit(a);
    const sb = cardSuit(b);
    if (sa === sb) return rankValue(cardRank(a)) > rankValue(cardRank(b));
    if (trump !== null && sa === trump) return true;
    if (trump !== null && sb === trump) return false;
    return sa === ledSuit && sb !== ledSuit;
  };
  let best = lead;
  for (const pc of cards.slice(1)) if (beats(pc.card, best.card)) best = pc;
  return best.seat;
};

/**
 * Validates that `actor` (the authenticated seat issuing the command) may play `card`
 * from the hand of the seat currently due to play.
 */
export const validateCardPlay = (play: PlayState, actor: Seat, card: Card): Result<true> => {
  const due = seatToPlay(play);
  const controller = controllingSeat(play);
  if (due === null || controller === null) return fail('BOARD_COMPLETE', 'All tricks have been played.');
  if (actor !== controller) {
    if (actor === play.contract.dummy) {
      return fail('DUMMY_CANNOT_PLAY', 'Dummy cannot play cards; declarer plays for dummy.');
    }
    return fail('NOT_YOUR_TURN', `It is ${due}'s turn to play.`);
  }
  if (!isCard(card)) return fail('INVALID_INPUT', 'Malformed card code.');
  const hand = play.hands[due];
  if (!hand.includes(card)) return fail('CARD_NOT_IN_HAND', 'That card is not in the hand to play.');
  const lead = play.currentTrick.cards[0];
  if (lead !== undefined) {
    const ledSuit = cardSuit(lead.card);
    if (cardSuit(card) !== ledSuit && hand.some((c) => cardSuit(c) === ledSuit)) {
      return fail('MUST_FOLLOW_SUIT', 'You must follow the suit led.');
    }
  }
  return ok(true);
};

export const applyCard = (play: PlayState, actor: Seat, card: Card): Result<PlayState> => {
  const v = validateCardPlay(play, actor, card);
  if (!v.ok) return v;
  const due = seatToPlay(play) as Seat;
  const hands = { ...play.hands, [due]: play.hands[due].filter((c) => c !== card) };
  const cards = [...play.currentTrick.cards, { seat: due, card }];

  if (cards.length < 4) {
    return ok({ ...play, hands, currentTrick: { leader: play.currentTrick.leader, cards } });
  }
  const winner = resolveTrick(cards, trumpOf(play.contract.strain));
  const completed: CompletedTrick = { leader: play.currentTrick.leader, cards, winner };
  return ok({
    ...play,
    hands,
    completedTricks: [...play.completedTricks, completed],
    currentTrick: { leader: winner, cards: [] },
  });
};

export const tricksWonBy = (play: PlayState, side: 'NS' | 'EW'): number =>
  play.completedTricks.filter((t) => partnershipOf(t.winner) === side).length;

export const declarerTricks = (play: PlayState): number =>
  tricksWonBy(play, partnershipOf(play.contract.declarer));

/** Legal cards for the seat due to play (UI hint; server re-validates). */
export const legalCards = (play: PlayState): Card[] => {
  const due = seatToPlay(play);
  const controller = controllingSeat(play);
  if (due === null || controller === null) return [];
  return play.hands[due].filter((c) => validateCardPlay(play, controller, c).ok);
};
