/**
 * Pure room state machine for one BridgeRoom Durable Object.
 * No IO: the DO loads/persists RoomState and fans out projections.
 */
import {
  boardCall,
  boardPlay,
  createBoard,
  projectBoardForSeat,
  seatToPlay,
  trumpOf,
  SEATS,
  type BoardState,
  type EngineErrorCode,
  type RandomSource,
  type Seat,
} from '@bridge/game-engine';
import {
  callFromPayload,
  type ErrorCode,
  type FinishedBoard,
  type MutatingCommand,
  type RoomPhase,
  type VoteKind,
} from '@bridge/shared';
import { chooseCard } from './bot';

export const ROOM_SCHEMA_VERSION = 3;
export const MAX_MEMBERS = 4;
export const MAX_PROCESSED_REQUESTS = 256;

export interface Member {
  readonly userId: string;
  readonly displayName: string;
}

export interface SeatAssignment {
  readonly userId: string;
  readonly ready: boolean;
}

export type CommandResponse =
  | { readonly status: 'accepted'; readonly stateVersion: number }
  | { readonly status: 'error'; readonly stateVersion: number; readonly code: ErrorCode; readonly message: string };

export interface ProcessedRequest {
  /** `${userId}:${requestId}` */
  readonly key: string;
  readonly response: CommandResponse;
}

export interface RoomState {
  readonly schemaVersion: typeof ROOM_SCHEMA_VERSION;
  readonly roomId: string;
  readonly code: string;
  readonly hostUserId: string;
  readonly targetBoards: number;
  readonly createdAt: string;
  readonly phase: RoomPhase;
  /** Monotonic; +1 per committed logical mutation. */
  readonly version: number;
  readonly members: readonly Member[];
  readonly seats: Readonly<Record<Seat, SeatAssignment | null>>;
  readonly matchId: string | null;
  /** Contains all secret hands. DO-only; never serialize to clients. */
  readonly board: BoardState | null;
  readonly nextBoardReady: Readonly<Record<Seat, boolean>> | null;
  readonly completedBoards: readonly FinishedBoard[];
  readonly processedRequests: readonly ProcessedRequest[];
  /** Outbox of D1 summary writes, flushed by the DO and retried until confirmed. */
  readonly pendingWrites: readonly PendingWrite[];
  /** Seats played by the server bot. The seat keeps its original userId. */
  readonly botSeats: Readonly<Record<Seat, boolean>>;
  /** Users removed by vote; they may not rejoin. Kept with names for display. */
  readonly kicked: readonly Member[];
  readonly vote: SeatVote | null;
}

export interface SeatVote {
  readonly id: string;
  readonly kind: VoteKind;
  readonly seat: Seat;
  readonly targetUserId: string;
  readonly startedBy: string;
  /** Users allowed to vote (fixed when the vote starts). */
  readonly eligible: readonly string[];
  readonly yes: readonly string[];
  readonly no: readonly string[];
  readonly needed: number;
}

/** Idempotent D1 summary writes, keyed by a stable id. Never contain hidden hands. */
export type PendingWrite =
  | {
      readonly kind: 'MATCH_START';
      readonly id: string;
      readonly matchId: string;
      readonly roomId: string;
      readonly targetBoards: number;
      readonly at: string;
      readonly players: readonly { readonly seat: Seat; readonly userId: string }[];
    }
  | { readonly kind: 'BOARD_RESULT'; readonly id: string; readonly matchId: string; readonly board: FinishedBoard; readonly at: string }
  | { readonly kind: 'MATCH_END'; readonly id: string; readonly matchId: string; readonly roomId: string; readonly at: string };

export interface RoomInit {
  readonly roomId: string;
  readonly code: string;
  readonly host: Member;
  readonly targetBoards: number;
  readonly createdAt: string;
}

function allFalse(): Record<Seat, boolean> {
  return { N: false, E: false, S: false, W: false };
}

export const createRoomState = (init: RoomInit): RoomState => ({
  schemaVersion: ROOM_SCHEMA_VERSION,
  roomId: init.roomId,
  code: init.code,
  hostUserId: init.host.userId,
  targetBoards: init.targetBoards,
  createdAt: init.createdAt,
  phase: 'WAITING',
  version: 1,
  members: [init.host],
  seats: { N: null, E: null, S: null, W: null },
  matchId: null,
  board: null,
  nextBoardReady: null,
  completedBoards: [],
  processedRequests: [],
  pendingWrites: [],
  botSeats: allFalse(),
  kicked: [],
  vote: null,
});

/** Remove confirmed writes from the outbox (by id). */
export const acknowledgeWrites = (state: RoomState, ids: ReadonlySet<string>): RoomState => ({
  ...state,
  pendingWrites: state.pendingWrites.filter((w) => !ids.has(w.id)),
});

/** Upgrade a persisted snapshot from any earlier schema to the current one. */
export const migrateRoomState = (raw: unknown): RoomState => {
  const s = raw as Partial<RoomState> & { schemaVersion?: number };
  if (s.schemaVersion === ROOM_SCHEMA_VERSION) return s as RoomState;
  const v3 = { botSeats: allFalse(), kicked: [], vote: null };
  if (s.schemaVersion === 2) return { ...(s as RoomState), ...v3, schemaVersion: ROOM_SCHEMA_VERSION };
  if (s.schemaVersion === 1) return { ...(s as RoomState), ...v3, schemaVersion: ROOM_SCHEMA_VERSION, pendingWrites: [] };
  throw new Error(`Unsupported room schemaVersion ${String(s.schemaVersion)}`);
};

export type RoomError = { readonly code: ErrorCode; readonly message: string };
type Step = { ok: true; state: RoomState } | { ok: false; error: RoomError };

const err = (code: ErrorCode, message: string): Step => ({ ok: false, error: { code, message } });
const step = (state: RoomState): Step => ({ ok: true, state });

export const isMember = (state: RoomState, userId: string): boolean =>
  state.members.some((m) => m.userId === userId);

export const seatOf = (state: RoomState, userId: string): Seat | null =>
  SEATS.find((s) => state.seats[s]?.userId === userId) ?? null;

/** Admit an authenticated user as a room member (idempotent for existing members). */
export const joinRoom = (
  state: RoomState,
  member: Member,
): { ok: true; state: RoomState; changed: boolean } | { ok: false; error: RoomError } => {
  if (isMember(state, member.userId)) return { ok: true, state, changed: false };
  if (state.kicked.some((k) => k.userId === member.userId)) {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'You were removed from this room.' } };
  }
  if (state.phase !== 'WAITING') {
    return { ok: false, error: { code: 'ROOM_CLOSED', message: 'The match has already started.' } };
  }
  if (state.members.length >= MAX_MEMBERS) {
    return { ok: false, error: { code: 'ROOM_FULL', message: 'The room already has four players.' } };
  }
  return {
    ok: true,
    changed: true,
    state: { ...state, members: [...state.members, member], version: state.version + 1 },
  };
};

const ENGINE_ERROR_MAP: Readonly<Record<EngineErrorCode, ErrorCode>> = {
  INVALID_INPUT: 'INVALID_PAYLOAD',
  WRONG_PHASE: 'INVALID_PHASE',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  AUCTION_CLOSED: 'INVALID_PHASE',
  INSUFFICIENT_BID: 'ILLEGAL_BID',
  ILLEGAL_DOUBLE: 'ILLEGAL_BID',
  ILLEGAL_REDOUBLE: 'ILLEGAL_BID',
  DUMMY_CANNOT_PLAY: 'FORBIDDEN',
  CARD_NOT_IN_HAND: 'ILLEGAL_CARD',
  MUST_FOLLOW_SUIT: 'MUST_FOLLOW_SUIT',
  BOARD_COMPLETE: 'INVALID_PHASE',
};


const afterBoardChange = (state: RoomState, board: BoardState, deps: RoomDeps): RoomState => {
  if (board.phase !== 'COMPLETED' || board.result === null) {
    return { ...state, board, phase: board.phase === 'PLAYING' ? 'PLAYING' : 'BIDDING' };
  }
  const finished: FinishedBoard = {
    boardNumber: board.boardNumber,
    dealer: board.dealer,
    vulnerability: board.vulnerability,
    result: board.result,
  };
  const completedBoards = [...state.completedBoards, finished];
  const at = deps.now();
  const writes: PendingWrite[] = [];
  if (state.matchId) {
    writes.push({ kind: 'BOARD_RESULT', id: `${state.matchId}:board:${board.boardNumber}`, matchId: state.matchId, board: finished, at });
    if (completedBoards.length >= state.targetBoards) {
      writes.push({ kind: 'MATCH_END', id: `${state.matchId}:end`, matchId: state.matchId, roomId: state.roomId, at });
    }
  }
  return {
    ...state,
    board,
    phase: 'BOARD_RESULT',
    completedBoards,
    nextBoardReady: allFalse(),
    pendingWrites: [...state.pendingWrites, ...writes],
  };
};

export interface RoomDeps {
  readonly rng: RandomSource;
  readonly newId: () => string;
  /** ISO timestamp source (injected for deterministic tests). */
  readonly now: () => string;
  /** Users with an open connection right now (votes need this). Defaults to nobody. */
  readonly online?: ReadonlySet<string>;
}

// ---------- votes: replace an absent player with a bot, or remove a player ----------

const inMatch = (p: RoomPhase) => p === 'BIDDING' || p === 'PLAYING' || p === 'BOARD_RESULT';

/** Seated humans (not bot-controlled), excluding `except`. */
const seatedHumans = (state: RoomState, except: string | null): string[] =>
  SEATS.flatMap((s) => {
    const a = state.seats[s];
    return a && !state.botSeats[s] && a.userId !== except ? [a.userId] : [];
  });

/** Which vote kinds `voter` may start against `seat`; empty when none. */
export const voteKindsAgainst = (state: RoomState, voter: string, seat: Seat, online: ReadonlySet<string>): VoteKind[] => {
  const target = state.seats[seat];
  if (state.vote || !target || target.userId === voter || seatOf(state, voter) === null) return [];
  if (state.phase === 'MATCH_COMPLETED') return [];
  const kinds: VoteKind[] = [];
  if (inMatch(state.phase) && !state.botSeats[seat] && !online.has(target.userId)) kinds.push('BOT');
  if (isMember(state, target.userId)) kinds.push('KICK');
  return kinds;
};

const applyVote = (state: RoomState, v: SeatVote): RoomState => {
  const base = { ...state, vote: null };
  if (v.kind === 'BOT') return { ...base, botSeats: { ...state.botSeats, [v.seat]: true } };
  const member = state.members.find((m) => m.userId === v.targetUserId);
  const members = state.members.filter((m) => m.userId !== v.targetUserId);
  const kicked = member ? [...state.kicked, member] : state.kicked;
  const hostUserId =
    state.hostUserId === v.targetUserId
      ? (seatedHumans(state, v.targetUserId)[0] ?? members[0]?.userId ?? state.hostUserId)
      : state.hostUserId;
  if (state.phase === 'WAITING') {
    return { ...base, members, kicked, hostUserId, seats: { ...state.seats, [v.seat]: null } };
  }
  // In a match the seat cannot be empty: the bot finishes it.
  return { ...base, members, kicked, hostUserId, botSeats: { ...state.botSeats, [v.seat]: true } };
};

const settleVote = (state: RoomState, v: SeatVote): RoomState => {
  if (v.yes.length >= v.needed) return applyVote(state, v);
  if (v.no.length > v.eligible.length - v.needed) return { ...state, vote: null };
  return { ...state, vote: v };
};

const actingSeat = (state: RoomState, userId: string): Seat | null => {
  const seat = seatOf(state, userId);
  return seat && state.botSeats[seat] ? null : seat;
};

const transition = (state: RoomState, userId: string, cmd: MutatingCommand, deps: RoomDeps): Step => {
  const seat = seatOf(state, userId);
  switch (cmd.type) {
    case 'room:claimSeat': {
      if (state.phase !== 'WAITING') return err('INVALID_PHASE', 'Seats are locked once the match starts.');
      const target = cmd.payload.seat;
      const occupant = state.seats[target];
      if (occupant && occupant.userId !== userId) return err('SEAT_TAKEN', 'That seat is taken.');
      const seats = { ...state.seats };
      if (seat) seats[seat] = null;
      seats[target] = { userId, ready: false };
      return step({ ...state, seats });
    }
    case 'room:ready': {
      if (state.phase !== 'WAITING') return err('INVALID_PHASE', 'Not in the waiting room.');
      if (!seat) return err('FORBIDDEN', 'Take a seat first.');
      return step({ ...state, seats: { ...state.seats, [seat]: { userId, ready: cmd.payload.ready } } });
    }
    case 'room:start': {
      if (state.hostUserId !== userId) return err('FORBIDDEN', 'Only the host can start.');
      if (state.phase !== 'WAITING') return err('INVALID_PHASE', 'The match has already started.');
      if (!SEATS.every((s) => state.seats[s]?.ready === true)) {
        return err('INVALID_PHASE', 'All four seats must be taken and ready.');
      }
      const board = createBoard(1, deps.rng);
      const matchId = deps.newId();
      const players = SEATS.map((s) => ({ seat: s, userId: state.seats[s]?.userId ?? '' }));
      const start: PendingWrite = {
        kind: 'MATCH_START',
        id: `${matchId}:start`,
        matchId,
        roomId: state.roomId,
        targetBoards: state.targetBoards,
        at: deps.now(),
        players,
      };
      return step({ ...state, matchId, board, phase: 'BIDDING', pendingWrites: [...state.pendingWrites, start] });
    }
    case 'room:leave': {
      if (state.phase !== 'WAITING') return err('INVALID_PHASE', 'You cannot leave a match in progress.');
      const members = state.members.filter((m) => m.userId !== userId);
      const seats = { ...state.seats };
      if (seat) seats[seat] = null;
      const hostUserId =
        state.hostUserId === userId ? (members[0]?.userId ?? state.hostUserId) : state.hostUserId;
      return step({ ...state, members, seats, hostUserId });
    }
    case 'vote:start': {
      const online = deps.online ?? new Set<string>();
      const kinds = voteKindsAgainst(state, userId, cmd.payload.seat, online);
      if (!kinds.includes(cmd.payload.kind)) return err('FORBIDDEN', 'That vote is not allowed now.');
      const targetUserId = state.seats[cmd.payload.seat]?.userId ?? '';
      const eligible = [userId, ...seatedHumans(state, targetUserId).filter((u) => u !== userId && online.has(u))];
      const v: SeatVote = {
        id: deps.newId(),
        kind: cmd.payload.kind,
        seat: cmd.payload.seat,
        targetUserId,
        startedBy: userId,
        eligible,
        yes: [userId],
        no: [],
        needed: Math.floor(eligible.length / 2) + 1,
      };
      return step(settleVote(state, v));
    }
    case 'vote:cast': {
      const v = state.vote;
      if (!v || v.id !== cmd.payload.voteId) return err('INVALID_PHASE', 'That vote is no longer open.');
      if (!v.eligible.includes(userId)) return err('FORBIDDEN', 'You cannot vote on this.');
      if (v.yes.includes(userId) || v.no.includes(userId)) return err('FORBIDDEN', 'You already voted.');
      const next = cmd.payload.yes ? { ...v, yes: [...v.yes, userId] } : { ...v, no: [...v.no, userId] };
      return step(settleVote(state, next));
    }
    case 'seat:reclaim': {
      if (!seat || !state.botSeats[seat]) return err('INVALID_PHASE', 'Your seat is not bot-controlled.');
      return step({ ...state, botSeats: { ...state.botSeats, [seat]: false } });
    }
    case 'auction:call': {
      if (state.phase !== 'BIDDING' || !state.board) return err('INVALID_PHASE', 'The auction is not in progress.');
      if (!seat) return err('FORBIDDEN', 'You are not seated.');
      if (!actingSeat(state, userId)) return err('FORBIDDEN', 'A bot is playing your seat; take it back first.');
      const r = boardCall(state.board, seat, callFromPayload(cmd.payload));
      if (!r.ok) return err(ENGINE_ERROR_MAP[r.error.code], r.error.message);
      return step(afterBoardChange(state, r.value, deps));
    }
    case 'card:play': {
      if (state.phase !== 'PLAYING' || !state.board?.play) return err('INVALID_PHASE', 'Card play is not in progress.');
      if (!seat) return err('FORBIDDEN', 'You are not seated.');
      if (!actingSeat(state, userId)) return err('FORBIDDEN', 'A bot is playing your seat; take it back first.');
      if (seatToPlay(state.board.play) !== cmd.payload.fromSeat) {
        return err('NOT_YOUR_TURN', `It is not ${cmd.payload.fromSeat}'s turn to play.`);
      }
      const r = boardPlay(state.board, seat, cmd.payload.card);
      if (!r.ok) return err(ENGINE_ERROR_MAP[r.error.code], r.error.message);
      return step(afterBoardChange(state, r.value, deps));
    }
    case 'board:readyNext': {
      if (state.phase !== 'BOARD_RESULT' || !state.nextBoardReady || !state.board) {
        return err('INVALID_PHASE', 'No finished board to continue from.');
      }
      if (!seat) return err('FORBIDDEN', 'You are not seated.');
      if (!actingSeat(state, userId)) return err('FORBIDDEN', 'A bot is playing your seat; take it back first.');
      const nextBoardReady = { ...state.nextBoardReady, [seat]: cmd.payload.ready };
      if (!SEATS.every((s) => nextBoardReady[s])) return step({ ...state, nextBoardReady });
      if (state.completedBoards.length >= state.targetBoards) {
        return step({ ...state, nextBoardReady, phase: 'MATCH_COMPLETED' });
      }
      const board = createBoard(state.board.boardNumber + 1, deps.rng);
      return step({ ...state, board, phase: 'BIDDING', nextBoardReady: null });
    }
  }
};

export interface CommandOutcome {
  readonly state: RoomState;
  readonly response: CommandResponse;
  /** True when `state` differs from input and must be persisted. */
  readonly persist: boolean;
  /** True when the authoritative game/room view changed (fan out snapshots). */
  readonly broadcast: boolean;
}

const remember = (state: RoomState, key: string, response: CommandResponse): RoomState => ({
  ...state,
  processedRequests: [...state.processedRequests, { key, response }].slice(-MAX_PROCESSED_REQUESTS),
});

/**
 * Order: authorize membership -> idempotency -> expected version -> transition.
 * Accepted results and rule rejections are remembered per (user, requestId);
 * transient rejections (stale version, forbidden non-member) are not.
 */
export const handleCommand = (
  state: RoomState,
  userId: string,
  cmd: MutatingCommand,
  deps: RoomDeps,
): CommandOutcome => {
  if (!isMember(state, userId)) {
    return {
      state,
      persist: false,
      broadcast: false,
      response: { status: 'error', stateVersion: state.version, code: 'FORBIDDEN', message: 'Not a room member.' },
    };
  }
  const key = `${userId}:${cmd.requestId}`;
  const previous = state.processedRequests.find((p) => p.key === key);
  if (previous) return { state, persist: false, broadcast: false, response: previous.response };

  if (cmd.expectedVersion !== state.version) {
    return {
      state,
      persist: false,
      broadcast: false,
      response: {
        status: 'error',
        stateVersion: state.version,
        code: 'STALE_VERSION',
        message: 'State changed; resynchronize and retry.',
      },
    };
  }

  const result = transition(state, userId, cmd, deps);
  if (!result.ok) {
    const response: CommandResponse = { status: 'error', stateVersion: state.version, ...result.error };
    return { state: remember(state, key, response), persist: true, broadcast: false, response };
  }
  const version = state.version + 1;
  const response: CommandResponse = { status: 'accepted', stateVersion: version };
  return { state: remember({ ...result.state, version }, key, response), persist: true, broadcast: true, response };
};

// ---------- server bot ----------

/**
 * One bot move if a bot-controlled seat must act, else null. Uses the same
 * transition as human commands, acting as the seat's user, so every rule and
 * D1 outbox write applies unchanged.
 */
export const applyBotStep = (state: RoomState, deps: RoomDeps): RoomState | null => {
  const board = state.board;
  if (!board || !SEATS.some((s) => state.botSeats[s])) return null;
  const actAs = (seat: Seat, cmd: MutatingCommand): RoomState | null => {
    const userId = state.seats[seat]?.userId;
    if (!userId) return null;
    const r = transition({ ...state, botSeats: { ...state.botSeats, [seat]: false } }, userId, cmd, deps);
    if (!r.ok) return null;
    return { ...r.state, botSeats: state.botSeats, version: state.version + 1 };
  };
  const ids = { protocolVersion: 1 as const, requestId: deps.newId(), expectedVersion: state.version };
  if (state.phase === 'BOARD_RESULT' && state.nextBoardReady) {
    const seat = SEATS.find((s) => state.botSeats[s] && !state.nextBoardReady?.[s]);
    return seat ? actAs(seat, { ...ids, type: 'board:readyNext', payload: { ready: true } }) : null;
  }
  const view = projectBoardForSeat(board, null);
  const controller = view.controller;
  if (!controller || !view.toAct || !state.botSeats[controller]) return null;
  if (state.phase === 'BIDDING') return actAs(controller, { ...ids, type: 'auction:call', payload: { kind: 'PASS' } });
  if (state.phase === 'PLAYING' && view.contract) {
    const own = projectBoardForSeat(board, controller);
    const card = chooseCard(view.toAct, own.legalCards, own.currentTrick?.cards ?? [], trumpOf(view.contract.strain));
    return actAs(controller, { ...ids, type: 'card:play', payload: { fromSeat: view.toAct, card } });
  }
  return null;
};
