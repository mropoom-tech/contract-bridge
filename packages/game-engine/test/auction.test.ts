import { describe, expect, it } from 'vitest';
import {
  applyCall,
  bidRank,
  createAuction,
  legalCalls,
  resolveAuction,
  summarizeAuction,
  validateCall,
  type AuctionState,
  type Call,
  type Seat,
} from '../src/index.js';
import { bid, P, X, XX } from './helpers.js';

/** Apply calls in turn starting from dealer; throws on illegal call. */
const run = (dealer: Seat, calls: Call[]): AuctionState => {
  let a = createAuction(dealer);
  for (const call of calls) {
    const seat = summarizeAuction(a).toAct;
    if (seat === null) throw new Error('auction closed');
    const r = applyCall(a, seat, call);
    if (!r.ok) throw new Error(`${r.error.code}: ${JSON.stringify(call)}`);
    a = r.value;
  }
  return a;
};

const contractOf = (dealer: Seat, calls: Call[]) => {
  const o = resolveAuction(run(dealer, calls));
  if (o.kind !== 'CONTRACT') throw new Error(`expected contract, got ${o.kind}`);
  return o.contract;
};

describe('bid ranking', () => {
  it('has 35 distinct ascending ranks, C<D<H<S<NT within a level', () => {
    const ranks = new Set<number>();
    for (let l = 1; l <= 7; l++) for (const s of ['C', 'D', 'H', 'S', 'NT'] as const) ranks.add(bidRank(l as 1, s));
    expect(ranks.size).toBe(35);
    expect(bidRank(1, 'NT')).toBeLessThan(bidRank(2, 'C'));
    expect(bidRank(1, 'H')).toBeLessThan(bidRank(1, 'S'));
  });
});

describe('call legality', () => {
  it('1C -> 1D legal; 1S -> 1H illegal; 1NT -> 2C legal; equal bid illegal', () => {
    expect(() => run('N', [bid(1, 'C'), bid(1, 'D')])).not.toThrow();
    const a = run('N', [bid(1, 'S')]);
    expect(validateCall(a, 'E', bid(1, 'H'))).toMatchObject({ ok: false, error: { code: 'INSUFFICIENT_BID' } });
    expect(validateCall(a, 'E', bid(1, 'S'))).toMatchObject({ ok: false, error: { code: 'INSUFFICIENT_BID' } });
    expect(() => run('N', [bid(1, 'NT'), bid(2, 'C')])).not.toThrow();
  });

  it('pass/double/redouble do not raise the bid level', () => {
    const a = run('N', [bid(1, 'H'), X, XX]);
    expect(validateCall(a, 'W', bid(1, 'S')).ok).toBe(true);
    expect(validateCall(a, 'W', bid(1, 'H')).ok).toBe(false);
  });

  it('enforces turn order from dealer', () => {
    const a = createAuction('E');
    expect(validateCall(a, 'N', P)).toMatchObject({ ok: false, error: { code: 'NOT_YOUR_TURN' } });
    expect(validateCall(a, 'E', P).ok).toBe(true);
  });

  it('rejects malformed bids', () => {
    const a = createAuction('N');
    expect(validateCall(a, 'N', { type: 'BID', level: 8 as 1, strain: 'C' }).ok).toBe(false);
    expect(validateCall(a, 'N', { type: 'BID', level: 1, strain: 'X' as 'C' }).ok).toBe(false);
    expect(validateCall(a, 'N', { type: 'BID', level: 0 as 1, strain: 'C' }).ok).toBe(false);
    expect(validateCall(a, 'N', { type: 'FOO' } as unknown as Call).ok).toBe(false);
  });

  it('1H by N: E may double, after E passes S may not double; E double -> S may redouble', () => {
    const a = run('N', [bid(1, 'H')]);
    expect(validateCall(a, 'E', X).ok).toBe(true);
    const b = run('N', [bid(1, 'H'), P]);
    expect(validateCall(b, 'S', X)).toMatchObject({ ok: false, error: { code: 'ILLEGAL_DOUBLE' } });
    const c = run('N', [bid(1, 'H'), X]);
    expect(validateCall(c, 'S', XX).ok).toBe(true);
  });

  it('cannot double with no bid, double twice, or redouble undoubled / opponents', () => {
    expect(validateCall(createAuction('N'), 'N', X).ok).toBe(false);
    const d = run('N', [bid(1, 'H'), X, P]);
    expect(validateCall(d, 'W', X)).toMatchObject({ ok: false, error: { code: 'ILLEGAL_DOUBLE' } });
    // W (opponent of doubled bidder) cannot redouble
    expect(validateCall(d, 'W', XX)).toMatchObject({ ok: false, error: { code: 'ILLEGAL_REDOUBLE' } });
    const u = run('N', [bid(1, 'H')]);
    expect(validateCall(u, 'E', XX)).toMatchObject({ ok: false, error: { code: 'ILLEGAL_REDOUBLE' } });
    const r = run('N', [bid(1, 'H'), X, XX]);
    expect(validateCall(r, 'W', X).ok).toBe(false);
    expect(validateCall(r, 'W', XX).ok).toBe(false);
  });

  it('opponent of the bidder may double after two passes (balancing)', () => {
    const a = run('N', [bid(1, 'H'), P, P]);
    expect(validateCall(a, 'W', X).ok).toBe(true);
  });

  it('a new bid clears double status', () => {
    const a = run('N', [bid(1, 'H'), X, bid(2, 'H')]);
    expect(summarizeAuction(a).doubled).toBe(0);
    expect(validateCall(a, 'W', X).ok).toBe(true);
  });
});

describe('auction termination and resolution', () => {
  it('four passes from dealer = passed out', () => {
    const a = run('S', [P, P, P, P]);
    expect(summarizeAuction(a).status).toBe('PASSED_OUT');
    expect(resolveAuction(a).kind).toBe('PASSED_OUT');
    expect(validateCall(a, 'S', P)).toMatchObject({ ok: false, error: { code: 'AUCTION_CLOSED' } });
    expect(legalCalls(a)).toEqual([]);
  });

  it('three passes do not end the auction before any bid', () => {
    const a = run('N', [P, P, P]);
    expect(summarizeAuction(a).status).toBe('OPEN');
    expect(summarizeAuction(a).toAct).toBe('W');
  });

  it('three passes after a bid end the auction; interruptions reset', () => {
    expect(summarizeAuction(run('N', [bid(1, 'C'), P, P])).status).toBe('OPEN');
    expect(summarizeAuction(run('N', [bid(1, 'C'), P, P, P])).status).toBe('COMPLETED');
    expect(summarizeAuction(run('N', [P, P, P, bid(1, 'C'), P, P])).status).toBe('OPEN');
    expect(summarizeAuction(run('N', [bid(1, 'C'), P, P, X, P, P])).status).toBe('OPEN');
    expect(summarizeAuction(run('N', [bid(1, 'C'), P, P, X, P, P, P])).status).toBe('COMPLETED');
  });

  it('example: 1H N, P, 2H S, P, P, P -> 2H declarer N', () => {
    const c = contractOf('N', [bid(1, 'H'), P, bid(2, 'H'), P, P, P]);
    expect(c).toEqual({ level: 2, strain: 'H', doubled: 0, declarer: 'N', dummy: 'S', openingLeader: 'E' });
  });

  it('declarer is first of the side to name the strain, not the final bidder', () => {
    const c = contractOf('E', [P, bid(1, 'S'), P, bid(2, 'C'), P, bid(2, 'S'), P, bid(4, 'S'), P, P, P]);
    // S bid spades first (dealer E: E P, S 1S, W P, N 2C, E P, S 2S, W P, N 4S)
    expect(c.declarer).toBe('S');
    expect(c.dummy).toBe('N');
    expect(c.openingLeader).toBe('W');
  });

  it("opponents' earlier bid of the strain does not make them declarer", () => {
    const c = contractOf('N', [bid(1, 'H'), bid(2, 'H'), bid(2, 'NT'), P, bid(4, 'H'), P, P, P]);
    // E's 2H (cue) is EW; NS's first heart bidder is N
    expect(c.declarer).toBe('N');
  });

  it('auction may end with doubled / redoubled contract', () => {
    expect(contractOf('N', [bid(3, 'NT'), X, P, P, P]).doubled).toBe(1);
    expect(contractOf('N', [bid(3, 'NT'), X, XX, P, P, P]).doubled).toBe(2);
  });

  it('EW declarer and opening leader wrap around', () => {
    const c = contractOf('W', [bid(1, 'NT'), P, P, P]);
    expect(c).toMatchObject({ declarer: 'W', dummy: 'E', openingLeader: 'N' });
  });

  it('legalCalls lists only legal options', () => {
    const open = legalCalls(createAuction('N'));
    expect(open).toHaveLength(36); // pass + 35 bids
    const afterBid = legalCalls(run('N', [bid(7, 'S')]));
    expect(afterBid).toEqual([P, X, bid(7, 'NT')]);
  });

  it('resolveAuction on an open auction is OPEN', () => {
    expect(resolveAuction(createAuction('N')).kind).toBe('OPEN');
  });
});
