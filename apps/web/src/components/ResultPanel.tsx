import { useState } from 'react';
import { SEATS } from '@bridge/game-engine';
import type { FinishedBoard, PublicViewState } from '@bridge/shared';
import { t } from '../i18n/th';
import { contractText } from '../lib/cards';
import { ScoreDialog } from './ScoreDialog';
import { RubberSheet } from './RubberSheet';
import { Button } from './ui';

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

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
  // Auto-open the scoring sheet once per newly finished board.
  const [closedFor, setClosedFor] = useState<number | null>(null);
  const [reopened, setReopened] = useState(false);
  const last = pub.completedBoards[pub.completedBoards.length - 1];
  if (!last) return null;
  const done = pub.phase === 'MATCH_COMPLETED';
  const dialogOpen = reopened || closedFor !== last.boardNumber;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gold-300">{done ? t.matchCompleted : t.resultTitle(last.boardNumber)}</h2>
      {!done && (
        <>
          <NsEwScore ns={last.result.nsScore} />
        </>
      )}
      <Button variant="secondary" className="w-full" onClick={() => setReopened(true)}>
        {t.viewScoring}
      </Button>
      <ScoreDialog
        board={last}
        open={dialogOpen}
        onClose={() => {
          setClosedFor(last.boardNumber);
          setReopened(false);
        }}
      />
      {pub.rubber ? <RubberSheet rubber={pub.rubber} /> : <Scoreboard boards={pub.completedBoards} />}
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
