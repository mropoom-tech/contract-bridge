import { useEffect, useRef, useState } from 'react';
import { isVulnerable, partnershipOf } from '@bridge/game-engine';
import type { FinishedBoard } from '@bridge/shared';
import { t } from '../i18n/th';
import { contractText } from '../lib/cards';
import { explainScore, type ScoreItem } from '../lib/score-explain';
import { NsEwScore } from './ResultPanel';
import { RubberDealView } from './RubberSheet';
import { Button } from './ui';

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const LONG_PRESS_MS = 450;

/**
 * One score row. Details open on mouse hover, on long-press (touch / pen),
 * on keyboard focus, or by clicking — so every input method can reach them.
 */
const ScoreRow = ({ item }: { item: ScoreItem }) => {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const open = hover || pinned;
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  return (
    <li className="rounded-lg border border-white/10 bg-black/20">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left select-none hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-gold-400"
        style={{ WebkitTouchCallout: 'none' }}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setHover(false);
          clear();
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return;
          longPressed.current = false;
          clear();
          timer.current = window.setTimeout(() => {
            longPressed.current = true;
            setPinned(true);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={clear}
        onPointerCancel={clear}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          setPinned((p) => !p);
        }}
      >
        <span>
          {item.label}
          <span className="ml-1 text-xs text-ivory-200/60" aria-hidden="true">
            ⓘ
          </span>
        </span>
        <span className={`font-semibold tabular-nums ${item.value < 0 ? 'text-red-300' : ''}`}>{signed(item.value)}</span>
      </button>
      {open && (
        <div className="space-y-1 border-t border-white/10 px-3 py-2 text-sm">
          <p>
            <span className="text-ivory-200/70">{t.scoreHow}: </span>
            <span className="font-medium text-gold-300">
              {item.formula} = {Math.abs(item.value)}
            </span>
          </p>
          <p className="text-ivory-200/80">{item.rule}</p>
        </div>
      )}
    </li>
  );
};

const LineSection = ({ title, hint, items, sum }: { title: string; hint: string; items: readonly ScoreItem[]; sum: number }) => (
  <section className="space-y-2">
    <div className="flex items-baseline justify-between">
      <h3 className="font-semibold text-gold-300">{title}</h3>
      <span className="font-semibold tabular-nums">{signed(sum)}</span>
    </div>
    <p className="text-xs text-ivory-200/60">{hint}</p>
    {items.length > 0 ? (
      <ul className="space-y-1.5">
        {items.map((i) => (
          <ScoreRow key={i.key} item={i} />
        ))}
      </ul>
    ) : (
      <p className="text-sm text-ivory-200/50">—</p>
    )}
  </section>
);

export const ScoreBreakdownView = ({ board }: { board: FinishedBoard }) => {
  const r = board.result;
  if (r.kind === 'PASSED_OUT') return <p>{t.passedOut}</p>;
  const side = partnershipOf(r.contract.declarer);
  const vul = isVulnerable(board.vulnerability, side);
  const e = explainScore(r.contract, vul, r.declarerTricks);
  const target = 6 + r.contract.level;
  const diff = r.declarerTricks - target;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {[
          [t.contract, `${contractText(r.contract)} · ${r.contract.declarer}`],
          [t.vulnerable, vul ? 'Vulnerable' : 'Non-vulnerable'],
          [t.targetTricks, String(target)],
          [t.actualTricks, `${r.declarerTricks} (${diff >= 0 ? `${t.made}${diff > 0 ? ` +${diff}` : ''}` : `${t.down} ${-diff}`})`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-black/25 px-3 py-2">
            <dt className="text-xs text-ivory-200/70">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-ivory-200/60">{t.scoreTip}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <LineSection title={t.aboveLine} hint={t.aboveLineHint} items={e.items.filter((i) => i.line === 'above')} sum={e.above} />
        <LineSection title={t.belowLine} hint={t.belowLineHint} items={e.items.filter((i) => i.line === 'below')} sum={e.below} />
      </div>
      <div className="flex items-center justify-between border-t border-white/15 pt-3">
        <span className="font-bold">
          {t.total} ({t.declarerSide} {side})
        </span>
        <span className={`text-xl font-bold tabular-nums ${e.total < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{signed(e.total)}</span>
      </div>
      {!e.made && <p className="text-xs text-ivory-200/70">{t.penaltyNote}</p>}
    </div>
  );
};

/** Modal scoring sheet for one finished board. Native <dialog> gives focus trap + Esc. */
export const ScoreDialog = ({ board, open, onClose }: { board: FinishedBoard; open: boolean; onClose: () => void }) => {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="score-dialog-title"
      className="m-auto w-[min(44rem,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-charcoal-900 p-0 text-ivory-100 shadow-2xl backdrop:bg-black/70"
    >
      <div className="max-h-[85vh] space-y-4 overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 id="score-dialog-title" className="text-xl font-bold text-gold-300">
            {t.resultTitle(board.boardNumber)}
          </h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="rounded-full px-2 text-xl leading-none hover:bg-white/10">
            ×
          </button>
        </div>
        {board.rubber ? (
          <div className="space-y-2">
            <h3 className="font-semibold text-gold-300">{t.rubber.dealTitle}</h3>
            <RubberDealView score={board.rubber} />
            <p className="text-xs text-ivory-200/70">{t.rubber.rules}</p>
          </div>
        ) : (
          <ScoreBreakdownView board={board} />
        )}
        <NsEwScore ns={board.result.nsScore} />
        <Button variant="primary" className="w-full" onClick={onClose}>
          {t.close}
        </Button>
      </div>
    </dialog>
  );
};
