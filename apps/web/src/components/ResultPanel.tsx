import { isVulnerable, partnershipOf, scoreBreakdown, SEATS } from '@bridge/game-engine';
import type { FinishedBoard, PublicViewState } from '@bridge/shared';
import { t } from '../i18n/th';
import { contractText } from '../lib/cards';
import { Button } from './ui';

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export const BoardResultDetail = ({ board }: { board: FinishedBoard }) => {
  const r = board.result;
  if (r.kind === 'PASSED_OUT') return <p>{t.passedOut}</p>;
  const side = partnershipOf(r.contract.declarer);
  const vul = isVulnerable(board.vulnerability, side);
  const b = scoreBreakdown(r.contract, vul, r.declarerTricks);
  const rows: [string, number][] = b.made
    ? [
        [t.contractPoints, b.contractPoints],
        [t.overtricks, b.overtrickPoints],
        [t.gameBonus, b.gameBonus],
        [t.partscoreBonus, b.partscoreBonus],
        [t.slamBonus, b.slamBonus],
        [t.insultBonus, b.insultBonus],
      ]
    : [[t.undertricks, b.undertrickPenalty]];

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-ivory-200/80">{t.contract}</dt>
        <dd className="font-bold">{contractText(r.contract)}</dd>
        <dt className="text-ivory-200/80">{t.declarer}</dt>
        <dd>
          {t.seatName[r.contract.declarer]} ({r.contract.declarer})
        </dd>
        <dt className="text-ivory-200/80">{t.vulnerable}</dt>
        <dd>{vul ? 'Vulnerable' : 'Non-vulnerable'}</dd>
        <dt className="text-ivory-200/80">{t.targetTricks}</dt>
        <dd>{b.targetTricks}</dd>
        <dt className="text-ivory-200/80">{t.actualTricks}</dt>
        <dd>
          {r.declarerTricks}{' '}
          <span className={b.made ? 'text-emerald-300' : 'text-red-300'}>
            ({b.made ? `${t.made}${b.overUnder > 0 ? ` +${b.overUnder}` : ''}` : `${t.down} ${-b.overUnder}`})
          </span>
        </dd>
      </dl>
      <table className="w-full text-sm">
        <tbody>
          {rows
            .filter(([, v]) => v !== 0)
            .map(([label, v]) => (
              <tr key={label}>
                <td className="py-0.5 text-ivory-200/80">{label}</td>
                <td className="py-0.5 text-right tabular-nums">{signed(v)}</td>
              </tr>
            ))}
          <tr className="border-t border-white/15 font-bold">
            <td className="pt-1">{t.total}</td>
            <td className="pt-1 text-right tabular-nums">{signed(b.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export const NsEwScore = ({ ns }: { ns: number }) => (
  <p className="text-lg font-bold">
    <span className="text-ns-400">NS: {signed(ns)}</span>
    <span className="mx-2 text-ivory-200/50">/</span>
    <span className="text-ew-400">EW: {signed(-ns)}</span>
  </p>
);

export const Scoreboard = ({ boards }: { boards: readonly FinishedBoard[] }) => {
  const totals = boards.reduce<number[]>((acc, b) => [...acc, (acc[acc.length - 1] ?? 0) + b.result.nsScore], []);
  return (
    <table className="w-full text-sm">
      <caption className="mb-1 text-left font-semibold text-gold-300">{t.scoreboard}</caption>
      <thead className="text-ivory-200/80">
        <tr>
          <th className="text-left font-medium">{t.board}</th>
          <th className="text-left font-medium">{t.contract}</th>
          <th className="text-right font-medium">NS</th>
          <th className="text-right font-medium">EW</th>
          <th className="text-right font-medium">{t.runningTotal} NS</th>
        </tr>
      </thead>
      <tbody>
        {boards.map((b, i) => {
          const running = totals[i] ?? 0;
          return (
            <tr key={b.boardNumber} className="border-t border-white/10">
              <td className="py-1">{b.boardNumber}</td>
              <td>{b.result.kind === 'PLAYED' ? `${contractText(b.result.contract)} ${b.result.contract.declarer}` : 'Pass'}</td>
              <td className="text-right tabular-nums">{signed(b.result.nsScore)}</td>
              <td className="text-right tabular-nums">{signed(-b.result.nsScore)}</td>
              <td className="text-right font-semibold tabular-nums">{signed(running)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export const ResultPanel = ({
  pub,
  canReadyNext,
  myReady,
  busy,
  onReadyNext,
  onLeave,
}: {
  pub: PublicViewState;
  canReadyNext: boolean;
  myReady: boolean;
  busy: boolean;
  onReadyNext: (ready: boolean) => void;
  onLeave: () => void;
}) => {
  const last = pub.completedBoards[pub.completedBoards.length - 1];
  if (!last) return null;
  const done = pub.phase === 'MATCH_COMPLETED';
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gold-300">{done ? t.matchCompleted : t.resultTitle(last.boardNumber)}</h2>
      {!done && (
        <>
          <BoardResultDetail board={last} />
          <NsEwScore ns={last.result.nsScore} />
        </>
      )}
      <Scoreboard boards={pub.completedBoards} />
      {done && <NsEwScore ns={pub.totalNsScore} />}
      {!done && pub.nextBoardReady && (
        <div className="space-y-2">
          <ul className="flex flex-wrap gap-2 text-xs">
            {SEATS.map((s) => (
              <li key={s} className={`rounded-full px-2 py-0.5 ${pub.nextBoardReady?.[s] ? 'bg-emerald-700' : 'bg-white/10'}`}>
                {s} {pub.nextBoardReady?.[s] ? '✓' : '…'}
              </li>
            ))}
          </ul>
          {canReadyNext && (
            <Button variant={myReady ? 'secondary' : 'primary'} className="w-full" disabled={busy} busy={busy} onClick={() => onReadyNext(!myReady)}>
              {myReady ? `${t.cancelNextBoard} (${t.waitingNext})` : t.nextBoard}
            </Button>
          )}
        </div>
      )}
      {done && (
        <Button variant="primary" className="w-full" onClick={onLeave}>
          {t.backToLobby}
        </Button>
      )}
    </div>
  );
};
