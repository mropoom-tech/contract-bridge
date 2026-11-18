import { describe, expect, it } from 'vitest';
import {
  applyRubberDeal,
  createRubber,
  honorsBonus,
  rubberDealNsDelta,
  rubberTotals,
  rubberVulnerability,
  scoreRubberDeal,
  type Contract,
  type Hands,
  type Seat,
  type Strain,
} from '../src/index.js';

// Deal with no honors combination anywhere (honors spread between hands).
const PLAIN: Hands = {
  N: ['AS', 'KH', 'QD', 'JC', '2S', '3S', '4S', '5S', '2H', '3H', '4H', '2D', '3D'],
  E: ['KS', 'QH', 'JD', 'AC', '6S', '7S', '8S', '5H', '6H', '7H', '4D', '5D', '6D'],
  S: ['QS', 'JH', 'AD', 'KC', '9S', 'TS', '8H', '9H', '7D', '8D', '9D', '2C', '3C'],
  W: ['JS', 'AH', 'KD', 'QC', 'TH', 'TD', '4C', '5C', '6C', '7C', '8C', '9C', 'TC'],
};
const C = (level: 1 | 2 | 3 | 4 | 5 | 6 | 7, strain: Strain, declarer: Seat, doubled: 0 | 1 | 2 = 0): Contract => ({
  level,
  strain,
  doubled,
  declarer,
  dummy: declarer === 'N' ? 'S' : declarer === 'S' ? 'N' : declarer === 'E' ? 'W' : 'E',
  openingLeader: declarer === 'N' ? 'E' : declarer === 'E' ? 'S' : declarer === 'S' ? 'W' : 'N',
});
const play = (contract: Contract, declarerTricks: number, deal: Hands = PLAIN) => ({ contract, declarerTricks, deal });

describe('rubber deal scoring', () => {
  it('trick points below the line; no game/partscore bonus per deal', () => {
    const s = scoreRubberDeal(C(2, 'H', 'N'), false, 9, PLAIN);
    expect(s.below).toEqual({ side: 'NS', points: 60 });
    expect(s.above).toEqual([{ side: 'NS', kind: 'overtricks', points: 30 }]);
  });

  it('doubled made: doubled trick points below, insult + doubled overtricks above', () => {
    const s = scoreRubberDeal(C(2, 'S', 'E', 1), true, 9, PLAIN);
    expect(s.below).toEqual({ side: 'EW', points: 120 });
    expect(s.above).toEqual([
      { side: 'EW', kind: 'overtricks', points: 200 },
      { side: 'EW', kind: 'insult', points: 50 },
    ]);
  });

  it('defeated: penalty to defenders above the line', () => {
    const s = scoreRubberDeal(C(4, 'S', 'S', 1), false, 7, PLAIN);
    expect(s.below).toBeNull();
    expect(s.above).toEqual([{ side: 'EW', kind: 'undertricks', points: 500 }]);
  });

  it('slam bonus', () => {
    expect(scoreRubberDeal(C(6, 'NT', 'W'), true, 12, PLAIN).above).toEqual([{ side: 'EW', kind: 'slam', points: 750 }]);
  });

  it('honors: 4 trump honors 100, 5 = 150, 4 aces at NT 150 — to the holder, even a defender', () => {
    const fourSpadeHonorsWest: Hands = {
      ...PLAIN,
      W: ['AS', 'KS', 'QS', 'JS', 'TH', 'TD', '4C', '5C', '6C', '7C', '8C', '9C', 'TC'],
      N: ['AH', 'KH', 'QD', 'JC', '2S', '3S', '4S', '5S', '2H', '3H', '4H', '2D', '3D'],
      E: ['KD', 'QH', 'JD', 'AC', '6S', '7S', '8S', '5H', '6H', '7H', '4D', '5D', '6D'],
      S: ['QC', 'JH', 'AD', 'KC', '9S', 'TS', '8H', '9H', '7D', '8D', '9D', '2C', '3C'],
    };
    expect(honorsBonus(C(4, 'S', 'N'), fourSpadeHonorsWest)).toEqual({ side: 'EW', kind: 'honors', points: 100 });
    const aces: Hands = {
      N: ['AS', 'AH', 'AD', 'AC', '2S', '3S', '4S', '5S', '2H', '3H', '4H', '2D', '3D'],
      E: ['KS', 'QH', 'JD', 'KC', '6S', '7S', '8S', '5H', '6H', '7H', '4D', '5D', '6D'],
      S: ['QS', 'JH', 'KD', 'QC', '9S', 'TS', '8H', '9H', '7D', '8D', '9D', '2C', '3C'],
      W: ['JS', 'KH', 'QD', 'JC', 'TH', 'TD', '4C', '5C', '6C', '7C', '8C', '9C', 'TC'],
    };
    expect(honorsBonus(C(3, 'NT', 'S'), aces)).toEqual({ side: 'NS', kind: 'honors', points: 150 });
    expect(honorsBonus(C(3, 'NT', 'S'), PLAIN)).toBeNull();
    // all five club honors in one hand
    const fiveClubs: Hands = { ...PLAIN, W: ['JS', 'AH', 'KD', 'QD', 'TH', 'TD', '4C', '5C', '6C', 'AC', 'KC', 'QC', 'JC'], E: ['KS', 'QH', 'JD', 'TC', '6S', '7S', '8S', '5H', '6H', '7H', '4D', '5D', '6D'], N: ['AS', 'KH', 'QS', '7C', '2S', '3S', '4S', '5S', '2H', '3H', '4H', '2D', '3D'], S: ['8C', 'JH', 'AD', '9C', '9S', 'TS', '8H', '9H', '7D', '8D', '9D', '2C', '3C'] };
    // swap so W has TC too
    const w = fiveClubs.W.filter((c) => c !== '4C');
    const e = fiveClubs.E.filter((c) => c !== 'TC');
    expect(honorsBonus(C(5, 'C', 'E'), { ...fiveClubs, W: [...w, 'TC'], E: [...e, '4C'] })).toEqual({ side: 'EW', kind: 'honors', points: 150 });
  });
});

describe('rubber progression', () => {
  it('part-scores add up to game; game resets both part-scores; vulnerability follows games', () => {
    let r = createRubber();
    r = applyRubberDeal(r, 1, play(C(2, 'H', 'N'), 8)); // NS 60 below
    r = applyRubberDeal(r, 2, play(C(1, 'NT', 'E'), 7)); // EW 40 below
    expect(r.currentBelow).toEqual({ NS: 60, EW: 40 });
    r = applyRubberDeal(r, 3, play(C(2, 'S', 'S'), 8)); // NS +60 = 120 → game
    expect(r.gamesWon).toEqual({ NS: 1, EW: 0 });
    expect(r.currentBelow).toEqual({ NS: 0, EW: 0 });
    expect(r.entries[2]?.wonGame).toBe('NS');
    expect(rubberVulnerability(r)).toBe('NS');
  });

  it('2–0 rubber earns 700; 2–1 earns 500; passed-out deals score nothing', () => {
    let r = createRubber();
    r = applyRubberDeal(r, 1, null);
    r = applyRubberDeal(r, 2, play(C(4, 'S', 'N'), 10)); // game NS (120)
    r = applyRubberDeal(r, 3, play(C(3, 'NT', 'S'), 9)); // game NS, rubber 2–0
    expect(r.winner).toBe('NS');
    expect(r.rubberBonus).toBe(700);
    expect(rubberTotals(r)).toEqual({ NS: 120 + 100 + 700, EW: 0 });
    expect(() => applyRubberDeal(r, 4, null)).toThrow();

    let q = createRubber();
    q = applyRubberDeal(q, 1, play(C(4, 'H', 'E'), 10)); // EW game
    q = applyRubberDeal(q, 2, play(C(5, 'D', 'N'), 11)); // NS game
    expect(rubberVulnerability(q)).toBe('BOTH');
    q = applyRubberDeal(q, 3, play(C(4, 'S', 'W'), 9)); // EW down 1 vul → NS +100
    q = applyRubberDeal(q, 4, play(C(3, 'NT', 'S'), 10)); // NS game + overtrick 30
    expect(q.winner).toBe('NS');
    expect(q.rubberBonus).toBe(500);
    expect(rubberTotals(q)).toEqual({ NS: 100 + 100 + 100 + 30 + 500, EW: 120 });
  });

  it('nsDelta matches the deal score', () => {
    expect(rubberDealNsDelta(scoreRubberDeal(C(4, 'S', 'S', 1), false, 7, PLAIN))).toBe(-500);
    expect(rubberDealNsDelta(scoreRubberDeal(C(2, 'H', 'N'), false, 9, PLAIN))).toBe(90);
  });
});
