import type { SeatSpecificSnapshot } from '@bridge/shared';
import { t } from '../i18n/th';
import { strainSymbol } from './cards';

/** Short screen-reader announcement for important changes between two snapshots (or null). */
export const announce = (prev: SeatSpecificSnapshot | null, next: SeatSpecificSnapshot): string | null => {
  const p = prev?.public;
  const n = next.public;
  const parts: string[] = [];

  if (n.contract && (!p?.contract || p.boardNumber !== n.boardNumber)) {
    const c = n.contract;
    parts.push(`${t.contract} ${c.level}${strainSymbol(c.strain)}${c.doubled === 1 ? ' X' : c.doubled === 2 ? ' XX' : ''} — ${t.declarer} ${t.seatName[c.declarer]}`);
  }
  if (p && n.boardNumber === p.boardNumber && n.completedTricks.length > p.completedTricks.length) {
    const last = n.completedTricks[n.completedTricks.length - 1];
    if (last) parts.push(`${t.tricks} ${n.completedTricks.length} ${t.wonBy} ${t.seatName[last.winner]}`);
  }
  if (n.phase === 'BOARD_RESULT' && p?.phase !== 'BOARD_RESULT' && n.boardNumber !== null) {
    parts.push(t.resultTitle(n.boardNumber));
  }
  const myTurnNow = next.allowedActions.calls.length > 0 || next.allowedActions.play !== null;
  const myTurnBefore = prev ? prev.allowedActions.calls.length > 0 || prev.allowedActions.play !== null : false;
  if (myTurnNow && !myTurnBefore) {
    parts.push(next.allowedActions.play && next.allowedActions.play.fromSeat !== next.you.seat ? t.yourTurnDummy : t.yourTurn);
  }
  return parts.length > 0 ? parts.join('. ') : null;
};
