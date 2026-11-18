import { useState } from 'react';
import { miniLevel, partnerOf, partnershipOf, SEATS, type Strain } from '@bridge/game-engine';
import type { SeatSpecificSnapshot } from '@bridge/shared';
import { t } from '../i18n/th';
import { useRoom } from '../stores/room';
import { Button, Panel } from './ui';

const STRAINS: readonly { s: Strain; label: string; red: boolean }[] = [
  { s: 'C', label: '♣', red: false },
  { s: 'D', label: '♦', red: true },
  { s: 'H', label: '♥', red: true },
  { s: 'S', label: '♠', red: false },
  { s: 'NT', label: 'NT', red: false },
];

/** Mini Bridge: announced points, declarer, and (for the declarer) the contract chooser. */
export const MiniPanel = ({ snapshot }: { snapshot: SeatSpecificSnapshot }) => {
  const send = useRoom((s) => s.send);
  const pending = useRoom((s) => s.pending);
  const synced = useRoom((s) => s.synced);
  const busy = pending !== null || !synced;
  const { public: pub, allowedActions: a } = snapshot;
  const [strain, setStrain] = useState<Strain>('NT');
  const [game, setGame] = useState(false);
  const mini = pub.mini;
  if (!mini) return null;
  const ns = mini.hcp.N + mini.hcp.S;
  const ew = mini.hcp.E + mini.hcp.W;
  const choosing = a.miniChoices.length > 0;
  const declarer = mini.declarer;
  const label = STRAINS.find((x) => x.s === strain)?.label ?? strain;

  return (
    <Panel title={t.mini.title}>
      <div className="space-y-3">
        <table className="w-full text-sm">
          <caption className="mb-1 text-left text-xs text-ivory-200/70">{t.mini.hcpCaption}</caption>
          <tbody>
            {(['NS', 'EW'] as const).map((side) => (
              <tr key={side} className="border-t border-white/10">
                <th scope="row" className={`py-1.5 text-left ${side === 'NS' ? 'text-ns-400' : 'text-ew-400'}`}>
                  {side}
                </th>
                {SEATS.filter((s) => partnershipOf(s) === side).map((s) => (
                  <td key={s} className="py-1.5 tabular-nums">
                    {s}{' '}
                    <strong className={s === declarer ? 'text-gold-300' : ''}>{mini.hcp[s]}</strong>
                    {s === declarer && <span className="ml-1 rounded bg-gold-400 px-1 text-[10px] text-charcoal-950">Decl.</span>}
                  </td>
                ))}
                <td className="py-1.5 text-right font-bold tabular-nums">{side === 'NS' ? ns : ew}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {declarer === null ? (
          <p className="text-sm">{t.mini.passedOut}</p>
        ) : pub.phase === 'DECLARING' && !choosing ? (
          <p className="text-sm text-ivory-200/85">{t.mini.waitingDeclarer(pub.seats[declarer]?.displayName ?? declarer)}</p>
        ) : null}

        {choosing && declarer && (
          <div className="space-y-3 rounded-lg border border-gold-400/50 bg-gold-400/10 p-3">
            <p className="text-sm font-semibold">{t.mini.youChoose(mini.hcp[declarer] + mini.hcp[partnerOf(declarer)])}</p>
            <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={t.calc.strain}>
              {STRAINS.map((x) => (
                <button
                  key={x.s}
                  type="button"
                  role="radio"
                  aria-checked={strain === x.s}
                  onClick={() => setStrain(x.s)}
                  className={`min-h-11 rounded-lg border text-lg font-semibold ${strain === x.s ? 'border-gold-400 bg-gold-400 text-charcoal-950' : 'border-white/15 bg-black/25'}`}
                >
                  <span className={strain !== x.s && x.red ? 'text-red-400' : ''}>{x.label}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={t.mini.kind}>
              {[false, true].map((g) => (
                <button
                  key={String(g)}
                  type="button"
                  role="radio"
                  aria-checked={game === g}
                  onClick={() => setGame(g)}
                  className={`min-h-11 rounded-lg border px-2 text-sm font-semibold ${game === g ? 'border-gold-400 bg-gold-400 text-charcoal-950' : 'border-white/15 bg-black/25'}`}
                >
                  {g ? t.mini.game : t.mini.partscore}
                  <span className="block text-xs font-normal opacity-80">
                    {miniLevel(strain, g)}
                    {label} · {t.mini.needTricks(6 + miniLevel(strain, g))}
                  </span>
                </button>
              ))}
            </div>
            <Button variant="primary" className="w-full" disabled={busy} busy={pending?.type === 'mini:declare'} onClick={() => send('mini:declare', { strain, game })}>
              {t.mini.confirm(`${miniLevel(strain, game)}${label}`)}
            </Button>
            <p className="text-xs text-ivory-200/70">{t.mini.hint}</p>
          </div>
        )}
      </div>
    </Panel>
  );
};
