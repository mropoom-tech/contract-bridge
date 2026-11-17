import { useState } from 'react';
import { SEATS, type Seat, type Strain } from '@bridge/game-engine';
import type { CallPayload } from '@bridge/shared';
import { t } from '../i18n/th';
import { callLabel, callText, strainSymbol } from '../lib/cards';
import { Button } from './ui';

const STRAINS: Strain[] = ['C', 'D', 'H', 'S', 'NT'];
const isRedStrain = (s: Strain) => s === 'H' || s === 'D';

/** Auction history in fixed N/E/S/W columns; empty cells before the dealer. */
export const AuctionGrid = ({ dealer, history, turnSeat }: { dealer: Seat; history: readonly { seat: Seat; call: CallPayload }[]; turnSeat: Seat | null }) => {
  const offset = SEATS.indexOf(dealer);
  const cells: (CallPayload | null | 'turn')[] = [...Array<null>(offset).fill(null), ...history.map((h) => h.call)];
  if (turnSeat) cells.push('turn');
  const rows: (CallPayload | null | 'turn')[][] = [];
  for (let i = 0; i < cells.length; i += 4) rows.push(cells.slice(i, i + 4));
  if (rows.length === 0) rows.push([]);

  return (
    <table className="w-full table-fixed text-center text-sm">
      <caption className="sr-only">{t.auction}</caption>
      <thead>
        <tr className="text-ivory-200/80">
          {SEATS.map((s) => (
            <th key={s} scope="col" className="pb-1 font-medium">
              {s}
              {s === dealer && <span className="ml-0.5 text-gold-400" title={t.dealer}>*</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {SEATS.map((_, ci) => {
              const c = row[ci];
              if (c === 'turn') return <td key={ci} className="py-0.5"><span className="inline-block size-3 animate-pulse rounded-full bg-gold-400" aria-label={t.turn} /></td>;
              if (!c) return <td key={ci} />;
              const red = c.kind === 'BID' && isRedStrain(c.strain);
              return (
                <td key={ci} className={`py-0.5 font-semibold ${red ? 'text-red-400' : c.kind === 'PASS' ? 'text-ivory-200/70' : c.kind === 'BID' ? 'text-ivory-50' : 'text-gold-300'}`}>
                  <span aria-label={callLabel(c)}>{callText(c)}</span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const sameCall = (a: CallPayload, b: CallPayload) =>
  a.kind === b.kind && (a.kind !== 'BID' || (b.kind === 'BID' && a.level === b.level && a.strain === b.strain));

export const BiddingBox = ({ allowed, busy, onCall }: { allowed: readonly CallPayload[]; busy: boolean; onCall: (c: CallPayload) => void }) => {
  const [selected, setSelected] = useState<CallPayload | null>(null);
  const can = (c: CallPayload) => allowed.some((a) => sameCall(a, c));
  const special: CallPayload[] = [{ kind: 'PASS' }, { kind: 'DOUBLE' }, { kind: 'REDOUBLE' }];

  return (
    <div className="space-y-3" aria-label={t.bid}>
      <div className="grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5, 6, 7].flatMap((level) =>
          STRAINS.map((strain) => {
            const c: CallPayload = { kind: 'BID', level, strain };
            const ok = can(c);
            const isSel = selected !== null && sameCall(selected, c);
            return (
              <button
                key={`${level}${strain}`}
                type="button"
                disabled={!ok || busy}
                aria-pressed={isSel}
                aria-label={callLabel(c)}
                onClick={() => setSelected(c)}
                className={`min-h-9 rounded-md text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-25 ${
                  isSel ? 'bg-gold-400 text-charcoal-950' : 'bg-ivory-50 hover:bg-gold-300'
                } ${isRedStrain(strain) && !isSel ? 'text-suit-red' : 'text-suit-black'}`}
              >
                {level}
                {strainSymbol(strain)}
              </button>
            );
          }),
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {special.map((c) => (
          <Button
            key={c.kind}
            variant={c.kind === 'PASS' ? 'secondary' : 'danger'}
            disabled={!can(c) || busy}
            onClick={() => {
              setSelected(null);
              onCall(c);
            }}
          >
            <span aria-label={callLabel(c)}>{c.kind === 'PASS' ? t.pass : c.kind === 'DOUBLE' ? 'X' : 'XX'}</span>
          </Button>
        ))}
      </div>
      <Button
        variant="primary"
        className="w-full"
        disabled={!selected || busy || !can(selected)}
        busy={busy}
        onClick={() => {
          if (selected) onCall(selected);
          setSelected(null);
        }}
      >
        {selected ? `${t.bid} ${callText(selected)}` : t.bid}
      </Button>
      <p className="text-xs text-ivory-200/70">{t.doubleHelp}</p>
    </div>
  );
};
