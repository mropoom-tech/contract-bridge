/**
 * Realtime protocol v1 (docs/WEBSOCKET_PROTOCOL.md). Zod schemas validate every
 * inbound frame at the boundary; outbound types are shared with the client.
 */
import { z } from 'zod';
import type {
  BoardResult,
  Call,
  Card,
  CompletedTrick,
  Contract,
  PlayedCard,
  RubberDealScore,
  RubberState,
  Seat,
  Strain,
  Vulnerability,
} from '@bridge/game-engine';

export const PROTOCOL_VERSION = 1;
/** Max inbound WebSocket frame size in bytes (characters). */
export const MAX_FRAME_LENGTH = 4096;

export const SeatSchema = z.enum(['N', 'E', 'S', 'W']);
export const StrainSchema = z.enum(['C', 'D', 'H', 'S', 'NT']);
export const CardSchema = z.string().regex(/^[2-9TJQKA][CDHS]$/) as unknown as z.ZodType<Card>;

export const CallPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('PASS') }).strict(),
  z.object({ kind: z.literal('DOUBLE') }).strict(),
  z.object({ kind: z.literal('REDOUBLE') }).strict(),
  z
    .object({ kind: z.literal('BID'), level: z.number().int().min(1).max(7), strain: StrainSchema })
    .strict(),
]);
export type CallPayload = z.infer<typeof CallPayloadSchema>;

const base = {
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: z.uuid(),
};
const mutating = { ...base, expectedVersion: z.number().int().min(0) };
const empty = z.object({}).strict();

export const ClientCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...mutating, type: z.literal('room:claimSeat'), payload: z.object({ seat: SeatSchema }).strict() }).strict(),
  z.object({ ...mutating, type: z.literal('room:ready'), payload: z.object({ ready: z.boolean() }).strict() }).strict(),
  z.object({ ...mutating, type: z.literal('room:start'), payload: empty }).strict(),
  z.object({ ...mutating, type: z.literal('room:leave'), payload: empty }).strict(),
  z.object({ ...mutating, type: z.literal('auction:call'), payload: CallPayloadSchema }).strict(),
  z
    .object({
      ...mutating,
      type: z.literal('card:play'),
      payload: z.object({ fromSeat: SeatSchema, card: CardSchema }).strict(),
    })
    .strict(),
  z.object({ ...mutating, type: z.literal('board:readyNext'), payload: z.object({ ready: z.boolean() }).strict() }).strict(),
  z
    .object({
      ...mutating,
      type: z.literal('vote:start'),
      payload: z.object({ seat: SeatSchema, kind: z.enum(['BOT', 'KICK']) }).strict(),
    })
    .strict(),
  z
    .object({
      ...mutating,
      type: z.literal('vote:cast'),
      payload: z.object({ voteId: z.string().min(1).max(64), yes: z.boolean() }).strict(),
    })
    .strict(),
  z.object({ ...mutating, type: z.literal('seat:reclaim'), payload: empty }).strict(),
  z
    .object({
      ...mutating,
      type: z.literal('mini:declare'),
      payload: z.object({ strain: StrainSchema, game: z.boolean() }).strict(),
    })
    .strict(),
  z.object({ ...base, type: z.literal('state:requestSnapshot'), payload: empty }).strict(),
]);
export type ClientCommand = z.infer<typeof ClientCommandSchema>;
export type ClientCommandType = ClientCommand['type'];
export type MutatingCommand = Exclude<ClientCommand, { type: 'state:requestSnapshot' }>;

export const callFromPayload = (p: CallPayload): Call =>
  p.kind === 'BID' ? { type: 'BID', level: p.level as 1, strain: p.strain } : { type: p.kind };

export const payloadFromCall = (c: Call): CallPayload =>
  c.type === 'BID' ? { kind: 'BID', level: c.level, strain: c.strain } : { kind: c.type };

export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'SEAT_TAKEN',
  'INVALID_PHASE',
  'NOT_YOUR_TURN',
  'ILLEGAL_BID',
  'ILLEGAL_CARD',
  'MUST_FOLLOW_SUIT',
  'STALE_VERSION',
  'DUPLICATE_REQUEST',
  'RATE_LIMITED',
  'INVALID_PAYLOAD',
  'ROOM_CLOSED',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Room lifecycle phases visible to clients. */
export type RoomPhase = 'WAITING' | 'BIDDING' | 'DECLARING' | 'PLAYING' | 'BOARD_RESULT' | 'MATCH_COMPLETED';
export type GameModeName = 'CLASSIC' | 'MINI' | 'RUBBER';

export interface SeatOccupant {
  readonly displayName: string;
  readonly online: boolean;
  readonly ready: boolean;
  readonly isHost: boolean;
}

export interface LobbyMember {
  readonly displayName: string;
  readonly online: boolean;
  readonly isHost: boolean;
}

export interface FinishedBoard {
  readonly boardNumber: number;
  readonly dealer: Seat;
  readonly vulnerability: Vulnerability;
  readonly result: BoardResult;
  /** Rubber mode: how this deal was scored (nsScore is then the deal's NS−EW change). */
  readonly rubber?: RubberDealScore;
}

export interface PublicViewState {
  readonly roomCode: string;
  readonly phase: RoomPhase;
  readonly version: number;
  readonly targetBoards: number;
  readonly mode: GameModeName;
  /** Rubber mode: the full score sheet (public information). */
  readonly rubber: RubberState | null;
  /** Mini Bridge: announced high-card points and declarer (null for classic). */
  readonly mini: { readonly hcp: Readonly<Record<Seat, number>>; readonly declarer: Seat | null } | null;
  readonly seats: Readonly<Record<Seat, SeatOccupant | null>>;
  /** Joined members without a seat. */
  readonly lobby: readonly LobbyMember[];
  readonly boardNumber: number | null;
  readonly dealer: Seat | null;
  readonly vulnerability: Vulnerability | null;
  /** Seat whose call/card is due. */
  readonly turnSeat: Seat | null;
  /** Seat whose user must act (declarer when dummy is due). */
  readonly controllerSeat: Seat | null;
  readonly auctionHistory: readonly { seat: Seat; call: CallPayload }[];
  readonly contract: Contract | null;
  readonly dummySeat: Seat | null;
  /** null until the opening lead has been made. */
  readonly dummyCards: readonly Card[] | null;
  readonly cardCounts: Readonly<Record<Seat, number>> | null;
  readonly currentTrick: readonly PlayedCard[];
  readonly completedTricks: readonly CompletedTrick[];
  readonly result: BoardResult | null;
  readonly completedBoards: readonly FinishedBoard[];
  readonly totalNsScore: number;
  readonly nextBoardReady: Readonly<Record<Seat, boolean>> | null;
  /** Seats currently played by the server bot (player disconnected and replaced by vote). */
  readonly botSeats: Readonly<Record<Seat, boolean>>;
  readonly vote: PublicVote | null;
}

export type VoteKind = 'BOT' | 'KICK';

export interface PublicVote {
  readonly id: string;
  readonly kind: VoteKind;
  readonly seat: Seat;
  readonly targetName: string;
  readonly startedByName: string;
  readonly yes: number;
  readonly no: number;
  readonly needed: number;
  readonly eligible: number;
}

export interface AllowedActions {
  readonly claimSeat: readonly Seat[];
  readonly ready: boolean;
  readonly start: boolean;
  readonly leave: boolean;
  readonly calls: readonly CallPayload[];
  readonly play: { readonly fromSeat: Seat; readonly cards: readonly Card[] } | null;
  readonly readyNext: boolean;
  /** Seats you may start a vote against, with the allowed kinds. */
  readonly startVote: readonly { readonly seat: Seat; readonly kinds: readonly VoteKind[] }[];
  /** You may vote in the active vote. */
  readonly castVote: boolean;
  /** Your seat is bot-controlled and you may take it back. */
  readonly reclaim: boolean;
  /** Mini Bridge: contract choices when you are the declarer choosing now. */
  readonly miniChoices: readonly { readonly strain: Strain; readonly game: boolean }[];
}

export interface SeatSpecificSnapshot {
  readonly public: PublicViewState;
  readonly you: {
    readonly userId: string;
    readonly displayName: string;
    readonly seat: Seat | null;
    readonly isHost: boolean;
    readonly yourHand: readonly Card[];
  };
  /** UI convenience only; the server re-validates every command. */
  readonly allowedActions: AllowedActions;
}

export type ServerMessage =
  | { protocolVersion: 1; type: 'session:snapshot'; stateVersion: number; snapshot: SeatSpecificSnapshot }
  /** This connection was superseded by a newer one for the same user (e.g. another tab); stop sending. */
  | { protocolVersion: 1; type: 'session:replaced' }
  | { protocolVersion: 1; type: 'command:ack'; requestId: string; stateVersion: number; status: 'accepted' }
  | {
      protocolVersion: 1;
      type: 'command:error';
      requestId: string | null;
      stateVersion: number;
      code: ErrorCode;
      message: string;
    };
