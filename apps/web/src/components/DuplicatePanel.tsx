import { useState } from 'react';
import { partnershipOf, type Seat } from '@bridge/game-engine';
import type { DuplicateView } from '@bridge/shared';
import { t } from '../i18n/th';
import { Button } from './ui';

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Team A = NS at table 1 + EW at table 2. */
const teamOf = (table: 1 | 2, seat: Seat | null): 'A' | 'B' | null => {
  if (!seat) return null;
  const ns = partnershipOf(seat) === 'NS';
  return (table === 1) === ns ? 'A' : 'B';
};

export const OtherTableLink = ({ dup }: { dup: DuplicateView }) => {
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/room/${dup.otherTableCode}`;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>
        {t.dup.otherTable(dup.table === 1 ? 2 : 1)}: <strong className="font-mono tracking-widest text-gold-300">{dup.otherTableCode}</strong>
      </span>
      <Button
        className="min-h-9 px-3 py-1 text-sm"
        onClick={() =>
          void navigator.clipboard?.writeText(url).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            },
            () => undefined,
          )
        }
      >
        {copied ? t.copied : t.dup.copyOther}
      </Button>
    </div>
  );
};

export const DuplicatePanel = ({ dup, mySeat }: { dup: DuplicateView; mySeat: Seat | null }) => {
  const team = teamOf(dup.table, mySeat);
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-ivory-200/75">{t.dup.teams}</p>
      <div className="grid grid-cols-2 gap-2 text-center">
        {(['A', 'B'] as const).map((tm) => (
          <div key={tm} className={`rounded-lg p-2 ${tm === 'A' ? 'bg-ns-600/35' : 'bg-ew-600/35'} ${team === tm ? 'ring-2 ring-gold-400' : ''}`}>
            <div className="text-xs">
              {t.dup.team} {tm} {team === tm && `(${t.you})`}
            </div>
            <div className="text-2xl font-bold tabular-nums">{tm === 'A' ? dup.impsTeamA : dup.impsTeamB}</div>
            <div className="text-[11px]">IMPs</div>
          </div>
        ))}
      </div>
      {dup.comparisons.length === 0 ? (
        <p className="text-ivory-200/70">{t.dup.noneYet}</p>
      ) : (
        <table className="w-full text-center tabular-nums">
          <thead className="text-xs text-ivory-200/70">
            <tr>
              <th className="text-left font-medium">{t.board}</th>
              <th className="font-medium">{t.dup.t1ns}</th>
              <th className="font-medium">{t.dup.t2ns}</th>
              <th className="font-medium">IMPs A</th>
            </tr>
          </thead>
          <tbody>
            {dup.comparisons.map((c) => (
              <tr key={c.boardNumber} className="border-t border-white/10">
                <td className="py-1 text-left">{c.boardNumber}</td>
                <td>{signed(c.table1Ns)}</td>
                <td>{signed(c.table2Ns)}</td>
                <td className={`font-semibold ${c.impsTeamA > 0 ? 'text-emerald-300' : c.impsTeamA < 0 ? 'text-red-300' : ''}`}>{signed(c.impsTeamA)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-ivory-200/60">{t.dup.otherProgress(dup.otherTableFinished)}</p>
      <p className="text-xs text-ivory-200/60">{t.dup.howImps}</p>
    </div>
  );
};
