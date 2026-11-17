import type { BidLevel, DoubleStatus, Partnership, Strain } from './types.js';

export interface ScoringContract {
  readonly level: BidLevel;
  readonly strain: Strain;
  readonly doubled: DoubleStatus;
}

const trickValue = (strain: Strain): number =>
  strain === 'C' || strain === 'D' ? 20 : 30;

/** Undoubled contract trick points for the bid tricks. */
const baseTrickPoints = (level: BidLevel, strain: Strain): number =>
  strain === 'NT' ? 40 + 30 * (level - 1) : trickValue(strain) * level;

const doubledUndertrickPenalty = (down: number, vulnerable: boolean): number => {
  if (vulnerable) return 200 + 300 * (down - 1);
  return 100 + 200 * Math.min(down - 1, 2) + 300 * Math.max(down - 3, 0);
};

/** Itemized duplicate score for the declaring side; components sum to `total`. */
export interface ScoreBreakdown {
  readonly made: boolean;
  readonly targetTricks: number;
  readonly tricks: number;
  /** Positive = overtricks, negative = undertricks, 0 = exactly made. */
  readonly overUnder: number;
  readonly contractPoints: number;
  readonly overtrickPoints: number;
  readonly gameBonus: number;
  readonly partscoreBonus: number;
  readonly slamBonus: number;
  readonly insultBonus: number;
  /** Negative (or 0). */
  readonly undertrickPenalty: number;
  readonly total: number;
}

export const scoreBreakdown = (
  contract: ScoringContract,
  vulnerable: boolean,
  tricks: number,
): ScoreBreakdown => {
  if (!Number.isInteger(tricks) || tricks < 0 || tricks > 13) {
    throw new RangeError('tricks must be an integer 0..13');
  }
  const { level, strain, doubled } = contract;
  const target = 6 + level;
  const zero = {
    targetTricks: target,
    tricks,
    overUnder: tricks - target,
    contractPoints: 0,
    overtrickPoints: 0,
    gameBonus: 0,
    partscoreBonus: 0,
    slamBonus: 0,
    insultBonus: 0,
    undertrickPenalty: 0,
  };

  if (tricks < target) {
    const down = target - tricks;
    let penalty: number;
    if (doubled === 0) penalty = down * (vulnerable ? 100 : 50);
    else penalty = doubledUndertrickPenalty(down, vulnerable) * (doubled === 2 ? 2 : 1);
    return { ...zero, made: false, undertrickPenalty: -penalty, total: -penalty };
  }

  const multiplier = doubled === 0 ? 1 : doubled === 1 ? 2 : 4;
  const contractPoints = baseTrickPoints(level, strain) * multiplier;
  const isGame = contractPoints >= 100;
  const gameBonus = isGame ? (vulnerable ? 500 : 300) : 0;
  const partscoreBonus = isGame ? 0 : 50;
  const slamBonus = level === 6 ? (vulnerable ? 750 : 500) : level === 7 ? (vulnerable ? 1500 : 1000) : 0;
  const insultBonus = doubled === 1 ? 50 : doubled === 2 ? 100 : 0;
  const over = tricks - target;
  const overtrickPoints =
    doubled === 0 ? over * trickValue(strain) : over * (vulnerable ? 200 : 100) * (doubled === 2 ? 2 : 1);

  return {
    ...zero,
    made: true,
    contractPoints,
    overtrickPoints,
    gameBonus,
    partscoreBonus,
    slamBonus,
    insultBonus,
    total: contractPoints + overtrickPoints + gameBonus + partscoreBonus + slamBonus + insultBonus,
  };
};

/**
 * Duplicate score for the declaring side (positive = made, negative = defeated).
 * `tricks` is the number of tricks won by declarer's side (0..13).
 */
export const scoreDuplicate = (contract: ScoringContract, vulnerable: boolean, tricks: number): number =>
  scoreBreakdown(contract, vulnerable, tricks).total;

/** Convert a declarer-side score to North–South perspective. */
export const toNsScore = (declarerSide: Partnership, declarerScore: number): number =>
  declarerSide === 'NS' ? declarerScore : -declarerScore;
