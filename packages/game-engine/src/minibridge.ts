/**
 * Mini Bridge (simplified bridge for learners, as taught by national bridge
 * unions): no auction. Every player announces high-card points (A=4, K=3,
 * Q=2, J=1). The partnership with more points (21+) declares; its player with
 * more points is declarer (tie: the one nearer the dealer, clockwise). Dummy
 * goes face up at once, then declarer chooses the denomination and whether to
 * play a part-score (1-level) or a game (3NT, 4♥/4♠, 5♣/5♦). Declarer's
 * left-hand opponent leads. A 20–20 deal is passed out (no score).
 */
import { getBoardConfiguration } from './board.js';
import { cardRank, deal as dealHands, isValidDeal, type RandomSource } from './cards.js';
import { createAuction } from './auction.js';
import { createPlayState } from './play.js';
import { nextSeat, partnerOf, partnershipOf, rotate, SEATS } from './seats.js';
import type { BidLevel, BoardState, Card, Contract, Hands, MiniInfo, Result, Seat, Strain } from './types.js';
import { fail, ok } from './types.js';

const HCP: Readonly<Record<string, number>> = { A: 4, K: 3, Q: 2, J: 1 };

export const handHcp = (cards: readonly Card[]): number => cards.reduce((sum, c) => sum + (HCP[cardRank(c)] ?? 0), 0);

/** Contract choices offered to the Mini Bridge declarer. */
export const MINI_CHOICES: readonly { readonly strain: Strain; readonly game: boolean }[] = (['C', 'D', 'H', 'S', 'NT'] as const).flatMap(
  (strain) => [
    { strain, game: false },
    { strain, game: true },
  ],
);

/** Part-score = 1-level; game = 3NT, 4 of a major, 5 of a minor. */
export const miniLevel = (strain: Strain, game: boolean): BidLevel => {
  if (!game) return 1;
  if (strain === 'NT') return 3;
  return strain === 'H' || strain === 'S' ? 4 : 5;
};

export const miniInfo = (hands: Hands, dealer: Seat): MiniInfo => {
  const hcp = Object.fromEntries(SEATS.map((s) => [s, handHcp(hands[s])])) as Record<Seat, number>;
  const ns = hcp.N + hcp.S;
  if (ns === 20) return { hcp, declarer: null };
  const side = ns > 20 ? 'NS' : 'EW';
  // Clockwise from the dealer: the first of the side with the most points wins ties.
  const order = [0, 1, 2, 3].map((i) => rotate(dealer, i)).filter((s) => partnershipOf(s) === side);
  const [a, b] = order as [Seat, Seat];
  return { hcp, declarer: hcp[b] > hcp[a] ? b : a };
};

export const createMiniBoardWithDeal = (boardNumber: number, hands: Hands): BoardState => {
  if (!isValidDeal(hands)) throw new Error('Invalid deal: need 4 hands of 13 unique cards');
  const config = getBoardConfiguration(boardNumber);
  const mini = miniInfo(hands, config.dealer);
  const base = { ...config, deal: hands, auction: createAuction(config.dealer), play: null, mini };
  if (mini.declarer === null) {
    return { ...base, phase: 'COMPLETED', result: { kind: 'PASSED_OUT', nsScore: 0, ewScore: 0 } };
  }
  return { ...base, phase: 'DECLARING', result: null };
};

export const createMiniBoard = (boardNumber: number, rng: RandomSource): BoardState =>
  createMiniBoardWithDeal(boardNumber, dealHands(rng));

/** Declarer fixes the contract; dummy is already face up, LHO leads. */
export const boardDeclareMini = (board: BoardState, actor: Seat, strain: Strain, game: boolean): Result<BoardState> => {
  if (board.phase !== 'DECLARING' || !board.mini?.declarer) return fail('WRONG_PHASE', 'No contract is being chosen.');
  const declarer = board.mini.declarer;
  if (actor !== declarer) return fail('NOT_YOUR_TURN', 'Only the declarer chooses the contract.');
  const contract: Contract = {
    level: miniLevel(strain, game),
    strain,
    doubled: 0,
    declarer,
    dummy: partnerOf(declarer),
    openingLeader: nextSeat(declarer),
  };
  return ok({ ...board, phase: 'PLAYING', play: { ...createPlayState(contract, board.deal), dummyFaceUp: true } });
};
