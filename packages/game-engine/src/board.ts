import { seatAt } from './seats.js';
import type { BoardConfiguration, Vulnerability } from './types.js';

/** Standard 16-board vulnerability cycle (index = (board - 1) % 16). */
const VULNERABILITY_CYCLE: readonly Vulnerability[] = [
  'NONE', 'NS', 'EW', 'BOTH',
  'NS', 'EW', 'BOTH', 'NONE',
  'EW', 'BOTH', 'NONE', 'NS',
  'BOTH', 'NONE', 'NS', 'EW',
];

export const getBoardConfiguration = (boardNumber: number): BoardConfiguration => {
  if (!Number.isInteger(boardNumber) || boardNumber < 1) {
    throw new RangeError('boardNumber must be a positive integer');
  }
  const vulnerability = VULNERABILITY_CYCLE[(boardNumber - 1) % 16];
  if (vulnerability === undefined) throw new Error('unreachable');
  return { boardNumber, dealer: seatAt(boardNumber - 1), vulnerability };
};
