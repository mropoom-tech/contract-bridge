/**
 * Rubber bridge scoring (Laws of Contract Bridge, rubber scoring table).
 *
 * - Trick points for the contract go BELOW the line and count toward game
 *   (100). A game ends the current "game": both sides' part-scores below the
 *   line no longer count toward the next game.
 * - Everything else goes ABOVE the line: overtricks, slam bonuses, the bonus
 *   for making a doubled/redoubled contract, undertrick penalties (to the
 *   defenders) and honors.
 * - Honors (held by any one player, declarer's side or defenders): four of
 *   the five trump honors 100, all five 150; at no-trump all four aces 150.
 * - A side that has won a game is vulnerable. The first side to win two games
 *   wins the rubber: +700 if the opponents won none, +500 if they won one.
 * - A passed-out deal is not scored; the next dealer deals.
 *
 * Penalty/overtrick/slam values are the same as duplicate, so they come from
 * the shared `scoreBreakdown`.
 */
import { cardRank, cardSuit } from './cards.js';
import { scoreBreakdown } from './scoring.js';
import { partnershipOf, SEATS } from './seats.js';
import type { Contract, Hands, Partnership } from './types.js';

export type RubberItemKind = 'overtricks' | 'slam' | 'insult' | 'undertricks' | 'honors' | 'rubber';

export interface RubberAboveItem {
  readonly side: Partnership;
  readonly kind: RubberItemKind;
  readonly points: number;
}

export interface RubberDealScore {
  /** Contract trick points below the line (0 when the contract failed). */
  readonly below: { readonly side: Partnership; readonly points: number } | null;
  readonly above: readonly RubberAboveItem[];
}

export interface RubberEntry {
  readonly dealNumber: number;
  readonly contract: Contract | null;
  readonly declarerTricks: number | null;
  readonly score: RubberDealScore;
  /** Index of the game (0, 1, 2) during which this deal was played. */
  readonly game: number;
  /** Set when this deal completed a game for that side. */
  readonly wonGame: Partnership | null;
}

export interface RubberState {
  readonly entries: readonly RubberEntry[];
  readonly gamesWon: Readonly<Record<Partnership, number>>;
  /** Below-the-line points toward the current game. */
  readonly currentBelow: Readonly<Record<Partnership, number>>;
  readonly gameIndex: number;
  readonly winner: Partnership | null;
  readonly rubberBonus: number;
}

export const createRubber = (): RubberState => ({
  entries: [],
  gamesWon: { NS: 0, EW: 0 },
  currentBelow: { NS: 0, EW: 0 },
  gameIndex: 0,
  winner: null,
  rubberBonus: 0,
});

export const isRubberVulnerable = (r: RubberState, side: Partnership): boolean => r.gamesWon[side] >= 1;

/** Vulnerability in the board's terms, derived from games won. */
export const rubberVulnerability = (r: RubberState): 'NONE' | 'NS' | 'EW' | 'BOTH' => {
  const ns = isRubberVulnerable(r, 'NS');
  const ew = isRubberVulnerable(r, 'EW');
  return ns && ew ? 'BOTH' : ns ? 'NS' : ew ? 'EW' : 'NONE';
};

const TRUMP_HONORS = ['A', 'K', 'Q', 'J', 'T'] as const;

/** Honors held in one hand at the start of play (scored to that hand's side). */
export const honorsBonus = (contract: Contract, deal: Hands): RubberAboveItem | null => {
  for (const seat of SEATS) {
    const hand = deal[seat];
    if (contract.strain === 'NT') {
      if (hand.filter((c) => cardRank(c) === 'A').length === 4) return { side: partnershipOf(seat), kind: 'honors', points: 150 };
    } else {
      const trump = contract.strain;
      const held = TRUMP_HONORS.filter((r) => hand.some((c) => cardSuit(c) === trump && cardRank(c) === r)).length;
      if (held === 5) return { side: partnershipOf(seat), kind: 'honors', points: 150 };
      if (held === 4) return { side: partnershipOf(seat), kind: 'honors', points: 100 };
    }
  }
  return null;
};

const other = (s: Partnership): Partnership => (s === 'NS' ? 'EW' : 'NS');

export const scoreRubberDeal = (contract: Contract, vulnerable: boolean, tricks: number, deal: Hands): RubberDealScore => {
  const side = partnershipOf(contract.declarer);
  const b = scoreBreakdown(contract, vulnerable, tricks);
  const above: RubberAboveItem[] = [];
  const honors = honorsBonus(contract, deal);
  if (!b.made) {
    above.push({ side: other(side), kind: 'undertricks', points: -b.undertrickPenalty });
    if (honors) above.push(honors);
    return { below: null, above };
  }
  if (b.overtrickPoints > 0) above.push({ side, kind: 'overtricks', points: b.overtrickPoints });
  if (b.slamBonus > 0) above.push({ side, kind: 'slam', points: b.slamBonus });
  if (b.insultBonus > 0) above.push({ side, kind: 'insult', points: b.insultBonus });
  if (honors) above.push(honors);
  return { below: { side, points: b.contractPoints }, above };
};

/** Record one deal (null contract = passed out, nothing scored). */
export const applyRubberDeal = (
  r: RubberState,
  dealNumber: number,
  played: { contract: Contract; declarerTricks: number; deal: Hands } | null,
): RubberState => {
  if (r.winner) throw new Error('The rubber is already finished.');
  if (!played) {
    const entry: RubberEntry = { dealNumber, contract: null, declarerTricks: null, score: { below: null, above: [] }, game: r.gameIndex, wonGame: null };
    return { ...r, entries: [...r.entries, entry] };
  }
  const side = partnershipOf(played.contract.declarer);
  const score = scoreRubberDeal(played.contract, isRubberVulnerable(r, side), played.declarerTricks, played.deal);
  const currentBelow = { ...r.currentBelow };
  if (score.below) currentBelow[score.below.side] += score.below.points;
  const wonGame = score.below && currentBelow[score.below.side] >= 100 ? score.below.side : null;
  const entry: RubberEntry = { dealNumber, contract: played.contract, declarerTricks: played.declarerTricks, score, game: r.gameIndex, wonGame };
  if (!wonGame) return { ...r, entries: [...r.entries, entry], currentBelow };

  const gamesWon = { ...r.gamesWon, [wonGame]: r.gamesWon[wonGame] + 1 };
  const winner = gamesWon[wonGame] >= 2 ? wonGame : null;
  return {
    entries: [...r.entries, entry],
    gamesWon,
    currentBelow: { NS: 0, EW: 0 },
    gameIndex: r.gameIndex + 1,
    winner,
    rubberBonus: winner ? (gamesWon[other(winner)] === 0 ? 700 : 500) : 0,
  };
};

/** Totals per side: below + above + rubber bonus. */
export const rubberTotals = (r: RubberState): Record<Partnership, number> => {
  const t: Record<Partnership, number> = { NS: 0, EW: 0 };
  for (const e of r.entries) {
    if (e.score.below) t[e.score.below.side] += e.score.below.points;
    for (const a of e.score.above) t[a.side] += a.points;
  }
  if (r.winner) t[r.winner] += r.rubberBonus;
  return t;
};

/** NS-minus-EW change caused by one deal (used as the board's nsScore). */
export const rubberDealNsDelta = (s: RubberDealScore): number => {
  let d = 0;
  if (s.below) d += s.below.side === 'NS' ? s.below.points : -s.below.points;
  for (const a of s.above) d += a.side === 'NS' ? a.points : -a.points;
  return d;
};
