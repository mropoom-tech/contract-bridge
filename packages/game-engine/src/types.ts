/** Core domain types for the pure bridge engine. No IO, no platform imports. */

export type Seat = 'N' | 'E' | 'S' | 'W';
export type Partnership = 'NS' | 'EW';
export type Suit = 'C' | 'D' | 'H' | 'S';
export type Strain = Suit | 'NT';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
/** Card code: rank then suit, e.g. `AS` (ace of spades), `TD` (ten of diamonds). */
export type Card = `${Rank}${Suit}`;
export type Vulnerability = 'NONE' | 'NS' | 'EW' | 'BOTH';
export type BidLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** 0 = undoubled, 1 = doubled, 2 = redoubled. */
export type DoubleStatus = 0 | 1 | 2;

export type Call =
  | { readonly type: 'PASS' }
  | { readonly type: 'BID'; readonly level: BidLevel; readonly strain: Strain }
  | { readonly type: 'DOUBLE' }
  | { readonly type: 'REDOUBLE' };

export interface AuctionEntry {
  readonly seat: Seat;
  readonly call: Call;
}

export interface AuctionState {
  readonly dealer: Seat;
  readonly calls: readonly AuctionEntry[];
}

export interface Contract {
  readonly level: BidLevel;
  readonly strain: Strain;
  readonly doubled: DoubleStatus;
  readonly declarer: Seat;
  readonly dummy: Seat;
  readonly openingLeader: Seat;
}

export type Hands = Readonly<Record<Seat, readonly Card[]>>;

export interface PlayedCard {
  readonly seat: Seat;
  readonly card: Card;
}

export interface Trick {
  readonly leader: Seat;
  readonly cards: readonly PlayedCard[];
}

export interface CompletedTrick extends Trick {
  readonly winner: Seat;
}

export interface PlayState {
  readonly contract: Contract;
  /** Remaining (unplayed) cards per seat. */
  readonly hands: Hands;
  readonly completedTricks: readonly CompletedTrick[];
  readonly currentTrick: Trick;
  /** Mini Bridge: dummy is face up before the opening lead. */
  readonly dummyFaceUp?: boolean;
}

export interface BoardConfiguration {
  readonly boardNumber: number;
  readonly dealer: Seat;
  readonly vulnerability: Vulnerability;
}

export type BoardResult =
  | { readonly kind: 'PASSED_OUT'; readonly nsScore: 0; readonly ewScore: 0 }
  | {
      readonly kind: 'PLAYED';
      readonly contract: Contract;
      readonly declarerTricks: number;
      readonly declarerScore: number;
      readonly nsScore: number;
      readonly ewScore: number;
    };

/** DECLARING: Mini Bridge only — declarer is choosing the contract (no auction). */
export type BoardPhase = 'BIDDING' | 'DECLARING' | 'PLAYING' | 'COMPLETED';

export type GameMode = 'CLASSIC' | 'MINI' | 'RUBBER';

/** Public Mini Bridge facts: every player's high-card points are announced. */
export interface MiniInfo {
  readonly hcp: Readonly<Record<Seat, number>>;
  /** null when the board is passed out (20–20). */
  readonly declarer: Seat | null;
}

export interface BoardState extends BoardConfiguration {
  readonly phase: BoardPhase;
  /** Original deal. Secret: never send to clients directly; use projectBoardForSeat. */
  readonly deal: Hands;
  readonly auction: AuctionState;
  readonly play: PlayState | null;
  readonly result: BoardResult | null;
  /** Present only for Mini Bridge boards. */
  readonly mini?: MiniInfo;
}

export type EngineErrorCode =
  | 'INVALID_INPUT'
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'AUCTION_CLOSED'
  | 'INSUFFICIENT_BID'
  | 'ILLEGAL_DOUBLE'
  | 'ILLEGAL_REDOUBLE'
  | 'DUMMY_CANNOT_PLAY'
  | 'CARD_NOT_IN_HAND'
  | 'MUST_FOLLOW_SUIT'
  | 'BOARD_COMPLETE';

export interface EngineError {
  readonly code: EngineErrorCode;
  readonly message: string;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: EngineError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T>(code: EngineErrorCode, message: string): Result<T> => ({
  ok: false,
  error: { code, message },
});
