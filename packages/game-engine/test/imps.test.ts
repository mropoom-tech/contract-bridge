import { describe, expect, it } from 'vitest';
import { IMP_TABLE, impsForDifference } from '../src/index.js';

describe('IMP scale (WBF)', () => {
  it.each([
    [0, 0],
    [10, 0],
    [20, 1],
    [40, 1],
    [50, 2],
    [90, 3],
    [170, 5],
    [420, 9],
    [430, 10],
    [500, 11],
    [620, 12],
    [750, 13],
    [1100, 15],
    [1430, 16],
    [2210, 19],
    [3990, 23],
    [4000, 24],
    [7600, 24],
  ])('%i → %i IMPs', (diff, imps) => {
    expect(impsForDifference(diff)).toBe(imps);
    expect(impsForDifference(-diff)).toBe(diff === 0 ? 0 : -imps);
  });

  it('classic swings: 4♠ made both ways vs. set (+420 vs −50 = 470 → 10 IMPs); 3NT game vs partscore (+400 vs +150 → 6)', () => {
    expect(impsForDifference(420 - -50)).toBe(10);
    expect(impsForDifference(400 - 150)).toBe(6);
  });

  it('table rows cover 0..4000+ with 25 bands', () => {
    expect(IMP_TABLE).toHaveLength(25);
    expect(IMP_TABLE[0]).toEqual([0, 10, 0]);
    expect(IMP_TABLE[24]).toEqual([4000, null, 24]);
  });
});
