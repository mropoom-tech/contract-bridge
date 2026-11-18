/**
 * International Match Points (WBF scale). Converts a point difference on one
 * board (e.g. NS score at table 1 minus NS score at table 2) into IMPs.
 */
const IMP_UPPER_BOUNDS: readonly number[] = [
  10, 40, 80, 120, 160, 210, 260, 310, 360, 420, 490, 590, 740, 890, 1090, 1290, 1490, 1740, 1990, 2240, 2490, 2990, 3490, 3990,
];

/** IMPs for a signed difference; sign follows the difference. */
export const impsForDifference = (diff: number): number => {
  if (!Number.isFinite(diff)) throw new RangeError('difference must be finite');
  const abs = Math.abs(diff);
  const idx = IMP_UPPER_BOUNDS.findIndex((upper) => abs <= upper);
  const imps = idx === -1 ? 24 : idx;
  return diff < 0 ? -imps : imps;
};

/** IMP scale rows for display: [from, to, imps]. */
export const IMP_TABLE: readonly (readonly [number, number | null, number])[] = [
  ...IMP_UPPER_BOUNDS.map((upper, i): readonly [number, number | null, number] => [i === 0 ? 0 : (IMP_UPPER_BOUNDS[i - 1] ?? 0) + 10, upper, i]),
  [4000, null, 24],
];
