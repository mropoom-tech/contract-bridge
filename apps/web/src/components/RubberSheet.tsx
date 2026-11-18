import { rubberTotals, type Partnership, type RubberDealScore, type RubberItemKind, type RubberState } from '@bridge/game-engine';
import { t } from '../i18n/th';
import { contractText } from '../lib/cards';

const SIDES: readonly Partnership[] = ['NS', 'EW'];
const kindLabel = (k: RubberItemKind) => t.rubber.kinds[k];

/**
 * Classic rubber score sheet: NS ("เรา" for NS players) and EW columns,
 * bonuses above the line, contract points below it, one block per game.
 */
export const RubberSheet = ({ rubber }: { rubber: RubberState }) => {
  const totals = rubberTotals(rubber);
  const games = Array.from({ length: rubber.gameIndex + (rubber.winner ? 0 : 1) }, (_, g) => g);
  const above = rubber.entries.flatMap((e) => e.score.above.map((a) => ({ ...a, deal: e.dealNumber })));
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2 text-center">
        {SIDES.map((side) => (
          <div key={side} className={`rounded-lg p-2 ${side === 'NS' ? 'bg-ns-600/35' : 'bg-ew-600/35'}`}>
            <div className="font-bold">{side}</div>
            <div className="text-xs">
              {t.rubber.games} {rubber.gamesWon[side]}/2 {rubber.gamesWon[side] >= 1 && <span className="ml-1 rounded bg-red-700 px-1 text-[10px] text-white">Vul</span>}
            </div>
          </div>
        ))}
      </div>

      <table className="w-full table-fixed text-center tabular-nums" aria-label={t.rubber.sheet}>
        <thead>
          <tr className="text-xs text-ivory-200/70">
            <th className="w-1/2 font-medium">NS</th>
            <th className="w-1/2 border-l border-white/20 font-medium">EW</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={2} className="pt-1 text-left text-[11px] text-ivory-200/60">
              {t.rubber.above}
            </td>
          </tr>
          {above.length === 0 && (
            <tr>
              <td className="text-ivory-200/40">—</td>
              <td className="border-l border-white/20 text-ivory-200/40">—</td>
            </tr>
          )}
          {above.map((a, i) => (
            <tr key={i}>
              {SIDES.map((side) => (
                <td key={side} className={`py-0.5 ${side === 'EW' ? 'border-l border-white/20' : ''}`}>
                  {a.side === side && (
                    <span title={`${kindLabel(a.kind)} · deal ${a.deal}`}>
                      {a.points} <span className="text-[10px] text-ivory-200/60">{kindLabel(a.kind)}</span>
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
          {rubber.winner && (
            <tr>
              {SIDES.map((side) => (
                <td key={side} className={`py-0.5 font-semibold text-gold-300 ${side === 'EW' ? 'border-l border-white/20' : ''}`}>
                  {rubber.winner === side && `${rubber.rubberBonus} ${t.rubber.kinds.rubber}`}
                </td>
              ))}
            </tr>
          )}
          <tr>
            <td colSpan={2} className="border-b-2 border-gold-400 pt-1 text-left text-[11px] text-ivory-200/60">
              {t.rubber.below}
            </td>
          </tr>
          {games.map((g) => {
            const rows = rubber.entries.filter((e) => e.game === g && e.score.below);
            const won = rubber.entries.find((e) => e.game === g && e.wonGame)?.wonGame ?? null;
            return [
              <tr key={`h${g}`}>
                <td colSpan={2} className="pt-1 text-left text-[11px] text-ivory-200/60">
                  {t.rubber.gameN(g + 1)} {won && `· ${won} ✓`}
                </td>
              </tr>,
              ...rows.map((e) => (
                <tr key={`g${g}d${e.dealNumber}`}>
                  {SIDES.map((side) => (
                    <td key={side} className={`py-0.5 ${side === 'EW' ? 'border-l border-white/20' : ''}`}>
                      {e.score.below?.side === side && e.contract && (
                        <span>
                          {e.score.below.points} <span className="text-[10px] text-ivory-200/60">{contractText(e.contract)}</span>
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              )),
              <tr key={`s${g}`}>
                <td colSpan={2} className="border-b border-white/30" />
              </tr>,
            ];
          })}
          <tr className="font-bold">
            {SIDES.map((side) => (
              <td key={side} className={`pt-2 text-base ${side === 'EW' ? 'border-l border-white/20' : ''}`}>
                {totals[side]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {!rubber.winner && <p className="text-xs text-ivory-200/70">{t.rubber.toGame(100 - rubber.currentBelow.NS, 100 - rubber.currentBelow.EW)}</p>}
      {rubber.winner && (
        <p className="rounded-lg bg-gold-400/15 p-2 text-center font-semibold">
          {t.rubber.won(rubber.winner, rubber.gamesWon[rubber.winner === 'NS' ? 'EW' : 'NS'] === 0 ? '2–0' : '2–1', Math.abs(totals.NS - totals.EW))}
        </p>
      )}
    </div>
  );
};

/** One deal's rubber score (used in the result dialog). */
export const RubberDealView = ({ score }: { score: RubberDealScore }) => (
  <ul className="space-y-1.5 text-sm">
    {score.below && (
      <li className="flex justify-between rounded-lg bg-black/25 px-3 py-2">
        <span>
          {t.contractPoints} <span className="text-xs text-ivory-200/60">({t.calc.below})</span>
        </span>
        <span className="font-semibold">
          {score.below.side} +{score.below.points}
        </span>
      </li>
    )}
    {score.above.map((a, i) => (
      <li key={i} className="flex justify-between rounded-lg bg-black/25 px-3 py-2">
        <span>
          {t.rubber.kinds[a.kind]} <span className="text-xs text-ivory-200/60">({t.calc.above})</span>
        </span>
        <span className="font-semibold">
          {a.side} +{a.points}
        </span>
      </li>
    ))}
    {!score.below && score.above.length === 0 && <li>—</li>}
  </ul>
);
