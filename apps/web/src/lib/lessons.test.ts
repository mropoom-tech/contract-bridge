import { describe, expect, it } from 'vitest';
import { resolveAuction, type AuctionEntry, type Call } from '@bridge/game-engine';
import { bidSeat, expectedScore, type Exercise, LESSONS, legalBidOptions, legalFollow, trickWinner } from './lessons';

const all = LESSONS.flatMap((l) => l.exercises.map((e) => ({ lesson: l.id, e })));
const of = <K extends Exercise['kind']>(k: K) =>
  all.filter((x): x is { lesson: string; e: Extract<Exercise, { kind: K }> } => x.e.kind === k).map((x) => x.e);

describe('tutorial answer keys agree with the engine and the written explanations', () => {
  it('lesson ids are unique and every choice answer is in range', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    for (const e of of('choice')) {
      expect(e.answer).toBeGreaterThanOrEqual(0);
      expect(e.answer).toBeLessThan(e.options.length);
    }
  });

  it('trick winners', () => {
    expect(of('trick').map(trickWinner)).toEqual(['N', 'S', 'E', 'N']);
  });

  it('follow-suit sets', () => {
    expect(of('follow').map(legalFollow)).toEqual([
      ['AS', '4S'],
      ['KS', '8S', 'AD', '5C', '2C'],
    ]);
  });

  it('legal calls', () => {
    const [a, b] = of('bid');
    expect(a && bidSeat(a)).toBe('S');
    expect(a && legalBidOptions(a)).toEqual([1, 2, 4]);
    expect(b && bidSeat(b)).toBe('W');
    expect(b && legalBidOptions(b)).toEqual([0, 3, 4]);
  });

  it('winning lesson: tricks needed = 6 + level', () => {
    const w = LESSONS.find((l) => l.id === 'winning');
    const [a, b] = (w?.exercises ?? []).filter((e) => e.kind === 'choice');
    expect(a?.kind === 'choice' && a.options[a.answer]).toBe(`${6 + 3} กอง`);
    // 4♥ needs 10; 8 made → defeated → defenders score
    expect(b?.kind === 'choice' && b.options[b.answer]).toBe('ฝ่ายป้องกัน');
  });

  it('scores', () => {
    expect(of('score').map(expectedScore)).toEqual([420, 110, -200]);
  });

  it('declarer example: first of the side to name the strain', () => {
    const seq: [AuctionEntry['seat'], Call][] = [
      ['N', { type: 'BID', level: 1, strain: 'S' }],
      ['E', { type: 'PASS' }],
      ['S', { type: 'BID', level: 2, strain: 'H' }],
      ['W', { type: 'PASS' }],
      ['N', { type: 'BID', level: 4, strain: 'H' }],
      ['E', { type: 'PASS' }],
      ['S', { type: 'PASS' }],
      ['W', { type: 'PASS' }],
    ];
    const out = resolveAuction({ dealer: 'N', calls: seq.map(([seat, call]) => ({ seat, call })) });
    expect(out.kind === 'CONTRACT' && out.contract.declarer).toBe('S');
    const ex = LESSONS.find((l) => l.id === 'roles')?.exercises[0];
    expect(ex?.kind === 'choice' && ex.options[ex.answer]).toBe('S');
  });
});
