import type { SeatSpecificSnapshot } from '@bridge/shared';
import { t } from '../i18n/th';
import { useRoom } from '../stores/room';
import { Button, Panel } from './ui';

/**
 * Disconnected players: vote to let the server bot play their seat, or vote to
 * remove them. Shows the active vote, the "take my seat back" banner, and the
 * buttons to start a vote. Renders nothing when there is nothing to do.
 */
export const VotePanel = ({ snapshot }: { snapshot: SeatSpecificSnapshot }) => {
  const send = useRoom((s) => s.send);
  const pending = useRoom((s) => s.pending);
  const synced = useRoom((s) => s.synced);
  const busy = pending !== null || !synced;
  const { public: pub, allowedActions: a } = snapshot;
  const vote = pub.vote;
  // Only disconnected players are offered here, so the panel stays out of the way.
  const targets = a.startVote.filter(({ seat }) => pub.seats[seat]?.online === false && !pub.botSeats[seat]);
  if (!vote && !a.reclaim && targets.length === 0) return null;

  return (
    <div className="space-y-3">
      {a.reclaim && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-gold-400/60 bg-gold-400/15 p-3">
          <span className="flex-1 text-sm">🤖 {t.vote.botPlayingYou}</span>
          <Button variant="primary" disabled={busy} onClick={() => send('seat:reclaim', {})}>
            {t.vote.reclaim}
          </Button>
        </div>
      )}

      {vote && (
        <Panel className="border-gold-400/50">
          <div className="space-y-2" role="status">
            <p className="font-semibold">
              {vote.kind === 'BOT' ? t.vote.titleBot(vote.targetName, vote.seat) : t.vote.titleKick(vote.targetName, vote.seat)}
            </p>
            <p className="text-xs text-ivory-200/70">{t.vote.startedBy(vote.startedByName)}</p>
            <div className="h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
              <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (vote.yes / vote.needed) * 100)}%` }} />
            </div>
            <p className="text-sm">{t.vote.tally(vote.yes, vote.no, vote.needed, vote.eligible)}</p>
            {a.castVote && (
              <div className="flex gap-2">
                <Button variant="primary" className="flex-1" disabled={busy} onClick={() => send('vote:cast', { voteId: vote.id, yes: true })}>
                  ✓ {t.vote.yes}
                </Button>
                <Button className="flex-1" disabled={busy} onClick={() => send('vote:cast', { voteId: vote.id, yes: false })}>
                  ✗ {t.vote.no}
                </Button>
              </div>
            )}
          </div>
        </Panel>
      )}

      {!vote && targets.length > 0 && (
        <Panel title={t.vote.panelTitle}>
          <p className="mb-2 text-xs text-ivory-200/70">{t.vote.hint}</p>
          <ul className="space-y-2">
            {targets.map(({ seat, kinds }) => (
              <li key={seat} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {seat} · {pub.seats[seat]?.displayName}
                  {pub.seats[seat]?.online === false && <span className="ml-1 text-xs text-red-300">({t.offline})</span>}
                </span>
                {kinds.includes('BOT') && (
                  <Button className="min-h-9 px-3 py-1 text-sm" disabled={busy} onClick={() => send('vote:start', { seat, kind: 'BOT' })}>
                    🤖 {t.vote.startBot}
                  </Button>
                )}
                {kinds.includes('KICK') && (
                  <Button variant="ghost" className="min-h-9 px-3 py-1 text-sm text-red-300" disabled={busy} onClick={() => send('vote:start', { seat, kind: 'KICK' })}>
                    {t.vote.startKick}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
};
