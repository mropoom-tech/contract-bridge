import { describe, expect, it } from 'vitest';
import { scoreBreakdown, scoreDuplicate, toNsScore, type BidLevel, type DoubleStatus, type Strain } from '../src/index.js';

const c = (level: BidLevel, strain: Strain, doubled: DoubleStatus = 0) => ({ level, strain, doubled });

describe('golden vectors (GAME_RULES §4)', () => {
  const vectors: [string, BidLevel, Strain, DoubleStatus, boolean, number, number][] = [
    ['4S', 4, 'S', 0, false, 10, 420],
    ['4S vul', 4, 'S', 0, true, 10, 620],
    ['3NT', 3, 'NT', 0, false, 9, 400],
    ['3NT vul', 3, 'NT', 0, true, 9, 600],
    ['2H', 2, 'H', 0, false, 8, 110],
    ['2HX', 2, 'H', 1, false, 8, 470],
    ['1NTX', 1, 'NT', 1, false, 7, 180],
    ['4SX -2', 4, 'S', 1, false, 8, -300],
    ['4SX vul -2', 4, 'S', 1, true, 8, -500],
    ['3NT vul -1', 3, 'NT', 0, true, 8, -100],
    ['7NT', 7, 'NT', 0, false, 13, 1520],
    ['7NT vul', 7, 'NT', 0, true, 13, 2220],
  ];
  it.each(vectors)('%s', (_n, level, strain, dbl, vul, tricks, expected) => {
    expect(scoreDuplicate(c(level, strain, dbl), vul, tricks)).toBe(expected);
  });
});

describe('made contracts', () => {
  it('partscores and games at each level / strain (undoubled, non-vul, exact)', () => {
    const expected: Record<Strain, number[]> = {
      C: [70, 90, 110, 130, 400, 920, 1440],
      D: [70, 90, 110, 130, 400, 920, 1440],
      H: [80, 110, 140, 420, 450, 980, 1510],
      S: [80, 110, 140, 420, 450, 980, 1510],
      NT: [90, 120, 400, 430, 460, 990, 1520],
    };
    for (const strain of Object.keys(expected) as Strain[]) {
      expected[strain].forEach((score, i) => {
        expect(scoreDuplicate(c((i + 1) as BidLevel, strain), false, 7 + i)).toBe(score);
      });
    }
  });

  it('vulnerable game and slam bonuses', () => {
    expect(scoreDuplicate(c(5, 'D'), true, 11)).toBe(600);
    expect(scoreDuplicate(c(6, 'S'), true, 12)).toBe(1430);
    expect(scoreDuplicate(c(7, 'C'), true, 13)).toBe(2140);
  });

  it('undoubled overtricks use trick value', () => {
    expect(scoreDuplicate(c(3, 'NT'), true, 10)).toBe(630);
    expect(scoreDuplicate(c(2, 'C'), false, 10)).toBe(130);
    expect(scoreDuplicate(c(1, 'S'), false, 13)).toBe(260);
  });

  it('doubled / redoubled made, with insult and overtricks', () => {
    expect(scoreDuplicate(c(4, 'S', 1), false, 11)).toBe(690);
    expect(scoreDuplicate(c(4, 'S', 1), true, 11)).toBe(990);
    expect(scoreDuplicate(c(1, 'C', 2), false, 7)).toBe(230);
    expect(scoreDuplicate(c(1, 'C', 2), false, 8)).toBe(430);
    expect(scoreDuplicate(c(1, 'C', 2), true, 8)).toBe(630);
    expect(scoreDuplicate(c(2, 'C', 2), false, 8)).toBe(560);
    expect(scoreDuplicate(c(1, 'C', 1), false, 7)).toBe(140);
    expect(scoreDuplicate(c(3, 'C', 1), false, 9)).toBe(470);
    expect(scoreDuplicate(c(6, 'NT', 1), true, 12)).toBe(1680);
    expect(scoreDuplicate(c(7, 'NT', 2), true, 13)).toBe(2980);
  });
});

describe('defeated contracts', () => {
  it('undoubled 50 / 100 per trick', () => {
    for (let down = 1; down <= 13; down++) {
      expect(scoreDuplicate(c(7, 'NT'), false, 13 - down)).toBe(-50 * down);
      expect(scoreDuplicate(c(7, 'NT'), true, 13 - down)).toBe(-100 * down);
    }
  });

  it('doubled non-vul: 100, 300, 500, 800, 1100 ...', () => {
    const table = [100, 300, 500, 800, 1100, 1400, 1700];
    table.forEach((p, i) => expect(scoreDuplicate(c(7, 'S', 1), false, 12 - i)).toBe(-p));
    expect(scoreDuplicate(c(7, 'NT', 1), false, 0)).toBe(-3500);
  });

  it('doubled vul: 200, 500, 800 ...', () => {
    [200, 500, 800, 1100, 1400].forEach((p, i) => expect(scoreDuplicate(c(7, 'H', 1), true, 12 - i)).toBe(-p));
    expect(scoreDuplicate(c(7, 'NT', 1), true, 0)).toBe(-3800);
  });

  it('redoubled is twice doubled', () => {
    for (let down = 1; down <= 13; down++) {
      for (const vul of [false, true]) {
        expect(scoreDuplicate(c(7, 'D', 2), vul, 13 - down)).toBe(2 * scoreDuplicate(c(7, 'D', 1), vul, 13 - down));
      }
    }
  });

  it('defeated scores get no bonuses regardless of level', () => {
    expect(scoreDuplicate(c(6, 'S', 1), true, 11)).toBe(-200);
    expect(scoreDuplicate(c(1, 'C'), false, 6)).toBe(-50);
  });
});

describe('scoreBreakdown', () => {
  it('itemizes made contracts', () => {
    expect(scoreBreakdown(c(6, 'S', 1), true, 13)).toMatchObject({
      made: true, targetTricks: 12, overUnder: 1, contractPoints: 360, overtrickPoints: 200,
      gameBonus: 500, partscoreBonus: 0, slamBonus: 750, insultBonus: 50, undertrickPenalty: 0, total: 1860,
    });
    expect(scoreBreakdown(c(2, 'H'), false, 8)).toMatchObject({ contractPoints: 60, partscoreBonus: 50, gameBonus: 0, total: 110 });
  });
  it('itemizes defeated contracts', () => {
    expect(scoreBreakdown(c(4, 'S', 1), false, 8)).toMatchObject({
      made: false, overUnder: -2, contractPoints: 0, gameBonus: 0, undertrickPenalty: -300, total: -300,
    });
  });
  it('total always equals the sum of parts and scoreDuplicate', () => {
    for (let level = 1; level <= 7; level++) {
      for (const strain of ['C', 'D', 'H', 'S', 'NT'] as const) {
        for (const dbl of [0, 1, 2] as const) {
          for (const vul of [false, true]) {
            for (let t = 0; t <= 13; t++) {
              const b = scoreBreakdown(c(level as BidLevel, strain, dbl), vul, t);
              const sum = b.contractPoints + b.overtrickPoints + b.gameBonus + b.partscoreBonus + b.slamBonus + b.insultBonus + b.undertrickPenalty;
              expect(b.total).toBe(sum);
              expect(b.total).toBe(scoreDuplicate(c(level as BidLevel, strain, dbl), vul, t));
            }
          }
        }
      }
    }
  });
});

it('rejects invalid trick counts', () => {
  expect(() => scoreDuplicate(c(1, 'C'), false, 14)).toThrow(RangeError);
  expect(() => scoreDuplicate(c(1, 'C'), false, -1)).toThrow(RangeError);
});

it('maps declarer score to NS perspective', () => {
  expect(toNsScore('NS', 420)).toBe(420);
  expect(toNsScore('EW', 420)).toBe(-420);
  expect(toNsScore('EW', -300)).toBe(300);
});
