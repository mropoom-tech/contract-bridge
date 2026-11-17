import { rotate, type Card, type Rank, type Seat, type Strain, type Suit } from '@bridge/game-engine';
import type { CallPayload } from '@bridge/shared';

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME_TH: Record<Suit, string> = { S: 'โพดำ', H: 'โพแดง', D: 'ข้าวหลามตัด', C: 'ดอกจิก' };
export const RANK_NAME_TH: Record<Rank, string> = {
  A: 'เอซ', K: 'คิง', Q: 'ควีน', J: 'แจ็ค', T: 'สิบ',
  '9': 'เก้า', '8': 'แปด', '7': 'เจ็ด', '6': 'หก', '5': 'ห้า', '4': 'สี่', '3': 'สาม', '2': 'สอง',
};
export const RANK_DISPLAY: Record<Rank, string> = {
  A: 'A', K: 'K', Q: 'Q', J: 'J', T: '10', '9': '9', '8': '8', '7': '7', '6': '6', '5': '5', '4': '4', '3': '3', '2': '2',
};

export const cardRank = (c: Card): Rank => c[0] as Rank;
export const cardSuit = (c: Card): Suit => c[1] as Suit;
export const isRed = (s: Suit): boolean => s === 'H' || s === 'D';

/** Accessible name, e.g. "เอซโพดำ". */
export const cardLabel = (c: Card): string => `${RANK_NAME_TH[cardRank(c)]}${SUIT_NAME_TH[cardSuit(c)]}`;

export const strainSymbol = (s: Strain): string => (s === 'NT' ? 'NT' : SUIT_SYMBOL[s]);
export const strainLabel = (s: Strain): string => (s === 'NT' ? 'โนทรัมป์' : SUIT_NAME_TH[s]);

export const callText = (c: CallPayload): string => {
  switch (c.kind) {
    case 'PASS':
      return 'ผ่าน';
    case 'DOUBLE':
      return 'X';
    case 'REDOUBLE':
      return 'XX';
    case 'BID':
      return `${c.level}${strainSymbol(c.strain)}`;
  }
};

export const callLabel = (c: CallPayload): string => {
  switch (c.kind) {
    case 'PASS':
      return 'ผ่าน';
    case 'DOUBLE':
      return 'ดับเบิล';
    case 'REDOUBLE':
      return 'รีดับเบิล';
    case 'BID':
      return `${c.level} ${strainLabel(c.strain)}`;
  }
};

export const contractText = (c: { level: number; strain: Strain; doubled: number }): string =>
  `${c.level}${strainSymbol(c.strain)}${c.doubled === 1 ? ' X' : c.doubled === 2 ? ' XX' : ''}`;

export type TablePosition = 'bottom' | 'left' | 'top' | 'right';

/** Seat shown at each screen position so `self` is always at the bottom (clockwise N→E→S→W). */
export const seatAtPosition = (self: Seat, pos: TablePosition): Seat =>
  rotate(self, { bottom: 0, left: 1, top: 2, right: 3 }[pos]);

export const positionOfSeat = (self: Seat, seat: Seat): TablePosition => {
  const positions: TablePosition[] = ['bottom', 'left', 'top', 'right'];
  return positions.find((p) => seatAtPosition(self, p) === seat) ?? 'bottom';
};

/** Group a sorted hand by suit in display order S, H, D, C. */
export const groupBySuit = (cards: readonly Card[]): { suit: Suit; cards: Card[] }[] =>
  (['S', 'H', 'D', 'C'] as const)
    .map((suit) => ({ suit, cards: cards.filter((c) => cardSuit(c) === suit) }))
    .filter((g) => g.cards.length > 0);
