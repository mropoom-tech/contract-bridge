/**
 * Seat-specific allowlisted projection of RoomState. This is the ONLY way room
 * data leaves the Durable Object; never serialize RoomState directly.
 */
import { projectBoardForSeat, SEATS, type Seat } from '@bridge/game-engine';
import {
  payloadFromCall,
  type AllowedActions,
  type LobbyMember,
  type PublicViewState,
  type SeatOccupant,
  type SeatSpecificSnapshot,
} from '@bridge/shared';
import { seatOf, type RoomState } from './room-state';

const NO_ACTIONS: AllowedActions = {
  claimSeat: [],
  ready: false,
  start: false,
  leave: false,
  calls: [],
  play: null,
  readyNext: false,
};

export const projectRoomForUser = (
  state: RoomState,
  userId: string,
  online: ReadonlySet<string>,
): SeatSpecificSnapshot => {
  const member = state.members.find((m) => m.userId === userId);
  const seat: Seat | null = member ? seatOf(state, userId) : null;
  const nameOf = (id: string): string => state.members.find((m) => m.userId === id)?.displayName ?? '?';

  const seats = Object.fromEntries(
    SEATS.map((s): [Seat, SeatOccupant | null] => {
      const a = state.seats[s];
      return [
        s,
        a
          ? { displayName: nameOf(a.userId), online: online.has(a.userId), ready: a.ready, isHost: a.userId === state.hostUserId }
          : null,
      ];
    }),
  ) as Record<Seat, SeatOccupant | null>;

  const lobby: LobbyMember[] = state.members
    .filter((m) => seatOf(state, m.userId) === null)
    .map((m) => ({ displayName: m.displayName, online: online.has(m.userId), isHost: m.userId === state.hostUserId }));

  // Non-members get no board data at all (defense in depth; the DO never sends them snapshots).
  const view = member && state.board ? projectBoardForSeat(state.board, seat) : null;
  const totalNsScore = state.completedBoards.reduce((sum, b) => sum + b.result.nsScore, 0);

  const pub: PublicViewState = {
    roomCode: state.code,
    phase: state.phase,
    version: state.version,
    targetBoards: state.targetBoards,
    seats,
    lobby,
    boardNumber: view?.boardNumber ?? null,
    dealer: view?.dealer ?? null,
    vulnerability: view?.vulnerability ?? null,
    turnSeat: view?.toAct ?? null,
    controllerSeat: view?.controller ?? null,
    auctionHistory: view ? view.auction.map((e) => ({ seat: e.seat, call: payloadFromCall(e.call) })) : [],
    contract: view?.contract ?? null,
    dummySeat: view?.contract?.dummy ?? null,
    dummyCards: view?.dummyHand ?? null,
    cardCounts: view?.handCounts ?? null,
    currentTrick: view?.currentTrick?.cards ?? [],
    completedTricks: view?.completedTricks ?? [],
    result: view?.result ?? null,
    completedBoards: state.completedBoards,
    totalNsScore,
    nextBoardReady: state.nextBoardReady,
  };

  let allowed = NO_ACTIONS;
  if (member) {
    const waiting = state.phase === 'WAITING';
    allowed = {
      claimSeat: waiting ? SEATS.filter((s) => state.seats[s] === null) : [],
      ready: waiting && seat !== null,
      start:
        waiting && state.hostUserId === userId && SEATS.every((s) => state.seats[s]?.ready === true),
      leave: waiting,
      calls: view ? view.legalCalls.map(payloadFromCall) : [],
      play: view && view.toAct && view.legalCards.length > 0 ? { fromSeat: view.toAct, cards: view.legalCards } : null,
      readyNext: state.phase === 'BOARD_RESULT' && seat !== null,
    };
  }

  return {
    public: pub,
    you: {
      userId,
      displayName: member?.displayName ?? '',
      seat,
      isHost: state.hostUserId === userId,
      yourHand: view ? view.ownHand : [],
    },
    allowedActions: allowed,
  };
};
