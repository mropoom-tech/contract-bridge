import { useState } from 'react';
import { partnershipOf, type BidLevel, type DoubleStatus, type Seat, type Strain } from '@bridge/game-engine';
import { t } from '../i18n/th';
import { explainScore } from '../lib/score-explain';

const LEVELS: readonly BidLevel[] = [1, 2, 3, 4, 5, 6, 7];
const STRAINS: readonly { s: Strain; label: string; red: boolean }[] = [
  { s: 'C', label: '♣', red: false },
  { s: 'D', label: '♦', red: true },
  { s: 'H', label: '♥', red: true },
  { s: 'S', label: '♠', red: false },
  { s: 'NT', label: 'NT', red: false },
];
const DOUBLES: readonly { d: DoubleStatus; label: string }[] = [
  { d: 0, label: '—' },
  { d: 1, label: 'X' },
  { d: 2, label: 'XX' },
];
const DECLARERS: readonly Seat[] = ['N', 'E', 'S', 'W'];

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

const Seg = <T,>({
  label,
  items,
  value,
  onChange,
  render,
  cols,
}: {
  label: string;
  items: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render: (v: T) => React.ReactNode;
  cols: string;
}) => (
  <fieldset>
    <legend className="mb-1.5 text-sm text-ivory-200/80">{label}</legend>
    <div className={`grid gap-1.5 ${cols}`} role="radiogroup">
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={it === value}
          onClick={() => onChange(it)}
          className={`min-h-11 rounded-lg border text-lg font-semibold transition ${
            it === value ? 'border-gold-400 bg-gold-400 text-charcoal-950' : 'border-white/15 bg-black/25 hover:border-gold-400/60'
          }`}
        >
          {render(it)}
        </button>
      ))}
    </div>
  </fieldset>
);

/**
 * Duplicate score calculator for scoring a real (over-the-table) board.
 * Every number comes from the same engine used by online play.
 */
export const ScoreCalculator = () => {
  const [level, setLevel] = useState<BidLevel>(4);
  const [strain, setStrain] = useState<Strain>('H');
  const [doubled, setDoubled] = useState<DoubleStatus>(0);
  const [declarer, setDeclarer] = useState<Seat>('S');
  const [vul, setVul] = useState(false);
  const target = 6 + level;
  const [tricks, setTricks] = useState(10);
  const e = explainScore({ level, strain, doubled }, vul, tricks);
  const side = partnershipOf(declarer);
  const ns = side === 'NS' ? e.total : -e.total;
  const diff = tricks - target;
  const strainLabel = STRAINS.find((x) => x.s === strain)?.label ?? strain;

  return (
    <section aria-labelledby="calc-title" className="rounded-2xl border border-gold-400/40 bg-gradient-to-b from-gold-400/10 to-charcoal-900/90 p-4 shadow-lg sm:p-6">
      <h2 id="calc-title" className="text-xl font-bold">
        🧮 {t.calc.title}
      </h2>
      <p className="mb-4 text-sm text-ivory-200/75">{t.calc.subtitle}</p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Seg label={t.calc.level} items={LEVELS} value={level} onChange={setLevel} render={(v) => v} cols="grid-cols-7" />
          <Seg
            label={t.calc.strain}
            items={STRAINS.map((x) => x.s)}
            value={strain}
            onChange={setStrain}
            render={(v) => {
              const x = STRAINS.find((y) => y.s === v);
              return <span className={x?.red ? 'text-red-400' : ''}>{x?.label}</span>;
            }}
            cols="grid-cols-5"
          />
          <div className="grid grid-cols-2 gap-4">
            <Seg label={t.calc.doubled} items={DOUBLES.map((x) => x.d)} value={doubled} onChange={setDoubled} render={(v) => DOUBLES[v]?.label} cols="grid-cols-3" />
            <Seg label={t.calc.vulnerable} items={[false, true]} value={vul} onChange={setVul} render={(v) => (v ? 'Vul' : 'Non')} cols="grid-cols-2" />
          </div>
          <Seg label={t.calc.declarer} items={DECLARERS} value={declarer} onChange={setDeclarer} render={(v) => v} cols="grid-cols-4" />
          <div>
            <label htmlFor="calc-tricks" className="mb-1.5 flex justify-between text-sm text-ivory-200/80">
              <span>{t.calc.tricks}</span>
              <span className="font-semibold text-ivory-50">
                {tricks} {t.calc.of13} ·{' '}
                <span className={diff >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                  {diff === 0 ? t.calc.exact : diff > 0 ? `+${diff}` : `${diff}`}
                </span>
              </span>
            </label>
            <input
              id="calc-tricks"
              type="range"
              min={0}
              max={13}
              value={tricks}
              onChange={(ev) => setTricks(Number(ev.target.value))}
              className="w-full accent-[var(--color-gold-400)]"
            />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {[-3, -2, -1, 0, 1, 2, 3].map((d) => {
                const tr = target + d;
                if (tr < 0 || tr > 13) return null;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setTricks(tr)}
                    className={`min-h-9 rounded-md px-2.5 text-sm ${tr === tricks ? 'bg-white/25 font-semibold' : 'bg-black/25 hover:bg-white/10'}`}
                  >
                    {d === 0 ? t.calc.exact : d > 0 ? `+${d}` : d}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl bg-black/30 p-4" aria-live="polite">
          <p className="text-center text-sm text-ivory-200/80">
            {t.calc.contractLine(`${level}${strainLabel}${doubled === 1 ? 'X' : doubled === 2 ? 'XX' : ''}`, declarer, target)}
          </p>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-ns-600/35 p-3">
              <div className="text-xs">NS</div>
              <div className="text-3xl font-bold tabular-nums">{signed(ns)}</div>
            </div>
            <div className="rounded-lg bg-ew-600/35 p-3">
              <div className="text-xs">EW</div>
              <div className="text-3xl font-bold tabular-nums">{signed(-ns)}</div>
            </div>
          </div>
          <ul className="space-y-1.5 text-sm">
            {e.items.map((it) => (
              <li key={it.key} className="rounded-lg bg-black/25 px-3 py-2">
                <div className="flex justify-between gap-2">
                  <span>
                    {it.label}{' '}
                    <span className="text-xs text-ivory-200/60">({it.line === 'below' ? t.calc.below : t.calc.above})</span>
                  </span>
                  <span className={`font-semibold tabular-nums ${it.value < 0 ? 'text-red-300' : ''}`}>{signed(it.value)}</span>
                </div>
                <div className="text-xs text-gold-300">
                  {it.formula} = {Math.abs(it.value)}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-white/15 pt-2 font-bold">
            <span>
              {t.total} ({t.declarerSide} {side})
            </span>
            <span className={`tabular-nums ${e.total < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{signed(e.total)}</span>
          </div>
          {!e.made && <p className="text-xs text-ivory-200/70">{t.penaltyNote}</p>}
        </div>
      </div>
    </section>
  );
};
