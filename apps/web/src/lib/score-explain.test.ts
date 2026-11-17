import { describe, expect, it } from 'vitest';
import type { BidLevel, DoubleStatus, Strain } from '@bridge/game-engine';
import { explainScore } from './score-explain';

describe('explainScore', () => {
  it('splits 1NT +3 non-vul into 40 below and 140 above', () => {
    const e = explainScore({ level: 1, strain: 'NT', doubled: 0 }, false, 10);
    expect(e.below).toBe(40);
    expect(e.above).toBe(140);
    expect(e.total).toBe(180);
    expect(e.items.map((i) => i.key)).toEqual(['contract', 'overtricks', 'partscore']);
    expect(e.items[1]?.formula).toBe('3 กอง × 30');
  });

  it('explains doubled vulnerable undertricks step by step', () => {
    const e = explainScore({ level: 4, strain: 'S', doubled: 1 }, true, 8);
    expect(e.total).toBe(-500);
    expect(e.below).toBe(0);
    expect(e.items[0]?.formula).toContain('200 + 300');
  });

  it('doubled 3NT made non-vul: 200 below, game 300 + insult 50 above', () => {
    const e = explainScore({ level: 3, strain: 'NT', doubled: 1 }, false, 9);
    expect([e.below, e.above, e.total]).toEqual([200, 350, 550]);
  });

  it('adds up for every contract, vulnerability and trick count', () => {
    const strains: Strain[] = ['C', 'D', 'H', 'S', 'NT'];
    for (let level = 1; level <= 7; level++)
      for (const strain of strains)
        for (const doubled of [0, 1, 2] as DoubleStatus[])
          for (const vul of [false, true])
            for (let tricks = 0; tricks <= 13; tricks++) {
              const e = explainScore({ level: level as BidLevel, strain, doubled }, vul, tricks);
              expect(e.below + e.above).toBe(e.total);
            }
  });
});
