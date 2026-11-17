import { nextSeat, partnerOf, partnershipOf, rotate } from './seats.js';
import type {
  AuctionState,
  BidLevel,
  Call,
  Contract,
  DoubleStatus,
  Result,
  Seat,
  Strain,
} from './types.js';
import { fail, ok } from './types.js';

export const STRAINS: readonly Strain[] = ['C', 'D', 'H', 'S', 'NT'];

/** 0..34 rank across the 35 possible bids. */
export const bidRank = (level: BidLevel, strain: Strain): number =>
  (level - 1) * 5 + STRAINS.indexOf(strain);

export const createAuction = (dealer: Seat): AuctionState => ({ dealer, calls: [] });

export type AuctionStatus = 'OPEN' | 'COMPLETED' | 'PASSED_OUT';

export interface LastBid {
  readonly seat: Seat;
  readonly level: BidLevel;
  readonly strain: Strain;
}

export interface AuctionSummary {
  readonly status: AuctionStatus;
  /** Seat due to call; null when the auction is closed. */
  readonly toAct: Seat | null;
  readonly lastBid: LastBid | null;
  readonly doubled: DoubleStatus;
}

/** Derive auction status purely from the call history. */
export const summarizeAuction = (auction: AuctionState): AuctionSummary => {
  let lastBid: LastBid | null = null;
  let doubled: DoubleStatus = 0;
  auction.calls.forEach(({ seat, call }) => {
    if (call.type === 'BID') {
      lastBid = { seat, level: call.level, strain: call.strain };
      doubled = 0;
    } else if (call.type === 'DOUBLE') {
      doubled = 1;
    } else if (call.type === 'REDOUBLE') {
      doubled = 2;
    }
  });

  const n = auction.calls.length;
  const allPass = n === 4 && auction.calls.every((c) => c.call.type === 'PASS');
  const lastThreePass =
    n >= 4 && auction.calls.slice(-3).every((c) => c.call.type === 'PASS');

  let status: AuctionStatus = 'OPEN';
  if (allPass) status = 'PASSED_OUT';
  else if (lastBid !== null && lastThreePass) status = 'COMPLETED';

  return {
    status,
    toAct: status === 'OPEN' ? rotate(auction.dealer, n) : null,
    lastBid,
    doubled,
  };
};

const isBidLevel = (v: unknown): v is BidLevel =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 7;
const isStrain = (v: unknown): v is Strain =>
  typeof v === 'string' && (STRAINS as readonly string[]).includes(v);

/** Checks whether `seat` may make `call` now. Does not mutate. */
export const validateCall = (auction: AuctionState, seat: Seat, call: Call): Result<true> => {
  const s = summarizeAuction(auction);
  if (s.status !== 'OPEN') return fail('AUCTION_CLOSED', 'The auction has ended.');
  if (s.toAct !== seat) return fail('NOT_YOUR_TURN', `It is ${s.toAct}'s turn to call.`);

  switch (call.type) {
    case 'PASS':
      return ok(true);
    case 'BID': {
      if (!isBidLevel(call.level) || !isStrain(call.strain)) {
        return fail('INVALID_INPUT', 'Bid level must be 1-7 and strain C/D/H/S/NT.');
      }
      if (s.lastBid && bidRank(call.level, call.strain) <= bidRank(s.lastBid.level, s.lastBid.strain)) {
        return fail('INSUFFICIENT_BID', 'A bid must outrank the previous bid.');
      }
      return ok(true);
    }
    case 'DOUBLE':
      if (!s.lastBid || s.doubled !== 0 || partnershipOf(seat) === partnershipOf(s.lastBid.seat)) {
        return fail('ILLEGAL_DOUBLE', "Double is only legal on an opponent's undoubled bid.");
      }
      return ok(true);
    case 'REDOUBLE':
      if (!s.lastBid || s.doubled !== 1 || partnershipOf(seat) !== partnershipOf(s.lastBid.seat)) {
        return fail('ILLEGAL_REDOUBLE', "Redouble is only legal on your side's doubled bid.");
      }
      return ok(true);
    default:
      return fail('INVALID_INPUT', 'Unknown call type.');
  }
};

export const applyCall = (auction: AuctionState, seat: Seat, call: Call): Result<AuctionState> => {
  const v = validateCall(auction, seat, call);
  if (!v.ok) return v;
  return ok({ dealer: auction.dealer, calls: [...auction.calls, { seat, call }] });
};

export type AuctionOutcome =
  | { readonly kind: 'OPEN' }
  | { readonly kind: 'PASSED_OUT' }
  | { readonly kind: 'CONTRACT'; readonly contract: Contract };

/** Final contract, declarer, dummy and opening leader for a closed auction. */
export const resolveAuction = (auction: AuctionState): AuctionOutcome => {
  const s = summarizeAuction(auction);
  if (s.status === 'OPEN') return { kind: 'OPEN' };
  if (s.status === 'PASSED_OUT' || s.lastBid === null) return { kind: 'PASSED_OUT' };

  const { level, strain, seat: finalBidder } = s.lastBid;
  const side = partnershipOf(finalBidder);
  const firstToNameStrain = auction.calls.find(
    (e) => e.call.type === 'BID' && e.call.strain === strain && partnershipOf(e.seat) === side,
  );
  const declarer = firstToNameStrain?.seat ?? finalBidder;
  return {
    kind: 'CONTRACT',
    contract: {
      level,
      strain,
      doubled: s.doubled,
      declarer,
      dummy: partnerOf(declarer),
      openingLeader: nextSeat(declarer),
    },
  };
};

/** All calls currently legal for the seat to act (for UI hints only; server re-validates). */
export const legalCalls = (auction: AuctionState): Call[] => {
  const s = summarizeAuction(auction);
  if (s.toAct === null) return [];
  const seat = s.toAct;
  const candidates: Call[] = [{ type: 'PASS' }, { type: 'DOUBLE' }, { type: 'REDOUBLE' }];
  for (let level = 1; level <= 7; level++) {
    for (const strain of STRAINS) candidates.push({ type: 'BID', level: level as BidLevel, strain });
  }
  return candidates.filter((c) => validateCall(auction, seat, c).ok);
};
