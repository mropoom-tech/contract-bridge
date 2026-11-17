import { applyCall, createAuction, resolveAuction } from './auction.js';
import { deal as dealHands, isValidDeal, type RandomSource } from './cards.js';
import { getBoardConfiguration } from './board.js';
import { applyCard, createPlayState, declarerTricks, isPlayComplete } from './play.js';
import { scoreDuplicate, toNsScore } from './scoring.js';
import { isVulnerable, partnershipOf } from './seats.js';
import type { BoardResult, BoardState, Call, Card, Hands, PlayState, Result, Seat } from './types.js';
import { fail, ok } from './types.js';

/** Start a new board: config from board number, deal from the injected RNG. */
export const createBoard = (boardNumber: number, rng: RandomSource): BoardState =>
  createBoardWithDeal(boardNumber, dealHands(rng));

/** Start a board with a known deal (tests / replays). Throws on an invalid deal. */
export const createBoardWithDeal = (boardNumber: number, hands: Hands): BoardState => {
  if (!isValidDeal(hands)) throw new Error('Invalid deal: need 4 hands of 13 unique cards');
  const config = getBoardConfiguration(boardNumber);
  return {
    ...config,
    phase: 'BIDDING',
    deal: hands,
    auction: createAuction(config.dealer),
    play: null,
    result: null,
  };
};

const finishPlay = (board: BoardState, play: PlayState): BoardResult => {
  const side = partnershipOf(play.contract.declarer);
  const tricks = declarerTricks(play);
  const declarerScore = scoreDuplicate(play.contract, isVulnerable(board.vulnerability, side), tricks);
  const nsScore = toNsScore(side, declarerScore);
  return {
    kind: 'PLAYED',
    contract: play.contract,
    declarerTricks: tricks,
    declarerScore,
    nsScore,
    ewScore: -nsScore,
  };
};

export const boardCall = (board: BoardState, seat: Seat, call: Call): Result<BoardState> => {
  if (board.phase !== 'BIDDING') return fail('WRONG_PHASE', 'The auction is not in progress.');
  const next = applyCall(board.auction, seat, call);
  if (!next.ok) return next;
  const auction = next.value;
  const outcome = resolveAuction(auction);
  switch (outcome.kind) {
    case 'OPEN':
      return ok({ ...board, auction });
    case 'PASSED_OUT':
      return ok({
        ...board,
        auction,
        phase: 'COMPLETED',
        result: { kind: 'PASSED_OUT', nsScore: 0, ewScore: 0 },
      });
    case 'CONTRACT':
      return ok({ ...board, auction, phase: 'PLAYING', play: createPlayState(outcome.contract, board.deal) });
  }
};

/** `actor` is the authenticated seat issuing the command (declarer when playing from dummy). */
export const boardPlay = (board: BoardState, actor: Seat, card: Card): Result<BoardState> => {
  if (board.phase !== 'PLAYING' || board.play === null) {
    return fail('WRONG_PHASE', 'Card play is not in progress.');
  }
  const next = applyCard(board.play, actor, card);
  if (!next.ok) return next;
  const play = next.value;
  if (!isPlayComplete(play)) return ok({ ...board, play });
  return ok({ ...board, play, phase: 'COMPLETED', result: finishPlay(board, play) });
};
