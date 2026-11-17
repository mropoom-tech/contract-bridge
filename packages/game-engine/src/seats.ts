import type { Partnership, Seat, Vulnerability } from './types.js';

/** Clockwise seat order. */
export const SEATS: readonly Seat[] = ['N', 'E', 'S', 'W'];

const seatIndex = (seat: Seat): number => SEATS.indexOf(seat);

export const seatAt = (index: number): Seat => {
  const seat = SEATS[((index % 4) + 4) % 4];
  if (seat === undefined) throw new Error('unreachable seat index');
  return seat;
};

/** Seat `steps` positions clockwise from `seat`. */
export const rotate = (seat: Seat, steps: number): Seat => seatAt(seatIndex(seat) + steps);

export const nextSeat = (seat: Seat): Seat => rotate(seat, 1);

export const partnerOf = (seat: Seat): Seat => rotate(seat, 2);

export const partnershipOf = (seat: Seat): Partnership =>
  seat === 'N' || seat === 'S' ? 'NS' : 'EW';

export const isVulnerable = (vulnerability: Vulnerability, side: Partnership): boolean =>
  vulnerability === 'BOTH' || vulnerability === side;

export const isSeat = (value: unknown): value is Seat =>
  value === 'N' || value === 'E' || value === 'S' || value === 'W';
