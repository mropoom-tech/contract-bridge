import { legalCalls, summarizeAuction } from './auction.js';
import { controllingSeat, isDummyRevealed, legalCards, seatToPlay } from './play.js';
import { MINI_CHOICES } from './minibridge.js';
import { partnerOf, SEATS } from './seats.js';
import type {
  AuctionEntry,
  BoardPhase,
  BoardResult,
  BoardState,
  Call,
  Card,
  CompletedTrick,
  Contract,
  MiniInfo,
  Seat,
  Trick,
  Vulnerability,
} from './types.js';

/**
 * Seat-specific view of a board. Built from an allowlist of fields so that
 * concealed hands can never leak through a forgotten property.
 */
export interface BoardView {
  readonly boardNumber: number;
  readonly dealer: Seat;
  readonly vulnerability: Vulnerability;
  readonly phase: BoardPhase;
  readonly viewer: Seat | null;
  /** Viewer's own remaining cards (empty for spectators/null viewer). */
  readonly ownHand: readonly Card[];
  /** Dummy's remaining cards once revealed, otherwise null. */
  readonly dummyHand: readonly Card[] | null;
  readonly handCounts: Readonly<Record<Seat, number>>;
  readonly auction: readonly AuctionEntry[];
  readonly contract: Contract | null;
  readonly currentTrick: Trick | null;
  readonly completedTricks: readonly CompletedTrick[];
  /** Seat whose card or call is due. */
  readonly toAct: Seat | null;
  /** Seat whose user must act (declarer when dummy is due). */
  readonly controller: Seat | null;
  /** Legal calls if the viewer must call now. */
  readonly legalCalls: readonly Call[];
  /** Legal cards if the viewer must play now (may be from dummy). */
  readonly legalCards: readonly Card[];
  readonly result: BoardResult | null;
  /** Mini Bridge: announced HCP and declarer (public). */
  readonly mini: MiniInfo | null;
  /** Mini Bridge: contract choices if the viewer is the declarer choosing now. */
  readonly miniChoices: readonly { readonly strain: Contract['strain']; readonly game: boolean }[];
}

export const projectBoardForSeat = (board: BoardState, viewer: Seat | null): BoardView => {
  const play = board.play;
  const remaining = play ? play.hands : board.deal;
  const handCounts = Object.fromEntries(SEATS.map((s) => [s, remaining[s].length])) as Record<Seat, number>;

  let toAct: Seat | null = null;
  let controller: Seat | null = null;
  let calls: Call[] = [];
  let cards: Card[] = [];

  if (board.phase === 'BIDDING') {
    toAct = summarizeAuction(board.auction).toAct;
    controller = toAct;
    if (viewer !== null && viewer === toAct) calls = legalCalls(board.auction);
  } else if (board.phase === 'DECLARING' && board.mini?.declarer) {
    toAct = board.mini.declarer;
    controller = toAct;
  } else if (board.phase === 'PLAYING' && play) {
    toAct = seatToPlay(play);
    controller = controllingSeat(play);
    if (viewer !== null && viewer === controller) cards = legalCards(play);
  }

  const dummyRevealed = play !== null && isDummyRevealed(play);
  // Mini Bridge: dummy goes face up before declarer chooses the contract.
  const miniDummy = board.phase === 'DECLARING' && board.mini?.declarer ? partnerOf(board.mini.declarer) : null;

  return {
    boardNumber: board.boardNumber,
    dealer: board.dealer,
    vulnerability: board.vulnerability,
    phase: board.phase,
    viewer,
    ownHand: viewer === null ? [] : [...remaining[viewer]],
    dummyHand: play && dummyRevealed ? [...play.hands[play.contract.dummy]] : miniDummy ? [...board.deal[miniDummy]] : null,
    handCounts,
    auction: board.auction.calls.map((e) => ({ seat: e.seat, call: e.call })),
    contract: play ? play.contract : null,
    currentTrick: play ? { leader: play.currentTrick.leader, cards: [...play.currentTrick.cards] } : null,
    completedTricks: play ? play.completedTricks.map((t) => ({ ...t, cards: [...t.cards] })) : [],
    toAct,
    controller,
    legalCalls: calls,
    legalCards: cards,
    result: board.result,
    mini: board.mini ?? null,
    miniChoices: board.phase === 'DECLARING' && viewer !== null && viewer === board.mini?.declarer ? MINI_CHOICES : [],
  };
};
