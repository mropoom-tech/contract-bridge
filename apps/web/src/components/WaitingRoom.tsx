import { useState } from 'react';
import { SEATS, partnershipOf, type Seat } from '@bridge/game-engine';
import type { SeatSpecificSnapshot } from '@bridge/shared';
import { t } from '../i18n/th';
import { useRoom } from '../stores/room';
import { Button, Panel } from './ui';

const teamClasses = (seat: Seat) =>
  partnershipOf(seat) === 'NS' ? 'border-ns-400/60 bg-ns-600/25' : 'border-ew-400/60 bg-ew-600/25';

export const RoomCodeCard = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/room/${code}`;
  return (
    <Panel className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-xs text-ivory-200/80">{t.roomCode}</div>
        <div className="font-mono text-2xl tracking-[0.25em] text-gold-300">{code}</div>
      </div>
      <Button
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            },
            () => undefined,
          );
        }}
      >
        {copied ? t.copied : t.copyInvite}
      </Button>
    </Panel>
  );
};

const SEAT_CELL: Record<Seat, string> = {
  N: 'col-start-2 row-start-1',
  W: 'col-start-1 row-start-2',
  E: 'col-start-3 row-start-2',
  S: 'col-start-2 row-start-3',
};

const SeatCard = ({ seat, snapshot, busy, onClaim }: { seat: Seat; snapshot: SeatSpecificSnapshot; busy: boolean; onClaim: () => void }) => {
  const { public: pub, you, allowedActions: allowed } = snapshot;
  const occ = pub.seats[seat];
  const isMe = seat === you.seat;
  return (
    <div className={`flex min-h-28 flex-col justify-between gap-1 rounded-xl border-2 p-2 sm:p-3 ${teamClasses(seat)} ${isMe ? 'ring-2 ring-gold-400' : ''}`}>
      <div className="flex items-baseline justify-between gap-1">
        <span className="font-bold">
          {seat} <span className="hidden text-xs font-normal text-ivory-200/70 sm:inline">{t.seatName[seat]}</span>
        </span>
        <span className="text-[10px] text-ivory-200/70">{partnershipOf(seat)}</span>
      </div>
      {occ ? (
        <div className="min-w-0 space-y-1 text-sm">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={`size-2.5 shrink-0 rounded-full ${occ.online ? 'bg-emerald-400' : 'bg-gray-500'}`} aria-label={occ.online ? t.online : t.offline} role="img" />
            <strong className="truncate">{occ.displayName}</strong>
          </div>
          <div className="flex flex-wrap gap-1 text-[11px]">
            {isMe && <span className="rounded bg-gold-400 px-1.5 text-charcoal-950">{t.you}</span>}
            {occ.isHost && <span className="rounded bg-white/15 px-1.5">{t.host}</span>}
            <span className={`rounded px-1.5 ${occ.ready ? 'bg-emerald-600 text-white' : 'bg-black/30 text-ivory-200/80'}`}>{occ.ready ? `✓ ${t.ready}` : t.notReady}</span>
          </div>
        </div>
      ) : allowed.claimSeat.includes(seat) ? (
        <Button className="min-h-9 w-full px-2 py-1 text-sm" disabled={busy} onClick={onClaim}>
          {t.takeSeat}
        </Button>
      ) : (
        <span className="text-sm text-ivory-200/60">{t.emptySeat}</span>
      )}
    </div>
  );
};

export const WaitingRoom = ({ snapshot }: { snapshot: SeatSpecificSnapshot }) => {
  const send = useRoom((s) => s.send);
  const pending = useRoom((s) => s.pending);
  const synced = useRoom((s) => s.synced);
  const { public: pub, you, allowedActions: allowed } = snapshot;
  const busy = pending !== null || !synced;
  const filled = SEATS.filter((s) => pub.seats[s] !== null).length;
  const allReady = SEATS.every((s) => pub.seats[s]?.ready === true);
  const readyCount = SEATS.filter((s) => pub.seats[s]?.ready === true).length;
  const mySeat = you.seat;
  const myReady = mySeat ? (pub.seats[mySeat]?.ready ?? false) : false;

  const status =
    filled < 4 ? t.waitingForPlayers(4 - filled) : !allReady ? t.waitingForReady : you.isHost ? null : t.waitingForHost;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">{t.waitingRoom}</h1>
      <RoomCodeCard code={pub.roomCode} />

      <ol className="grid grid-cols-3 gap-2 text-xs sm:text-sm" aria-label={t.progress}>
        {[
          { label: t.stepSeats, done: filled === 4, detail: `${filled}/4` },
          { label: t.stepReady, done: allReady, detail: `${readyCount}/4` },
          { label: t.stepStart, done: false, detail: you.isHost ? t.you : t.host },
        ].map((st, i) => (
          <li
            key={st.label}
            className={`rounded-xl border px-3 py-2 ${st.done ? 'border-emerald-500/60 bg-emerald-900/40' : 'border-white/10 bg-black/25'}`}
          >
            <div className="flex items-center gap-2">
              <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${st.done ? 'bg-emerald-500 text-charcoal-950' : 'bg-white/15'}`}>
                {st.done ? '✓' : i + 1}
              </span>
              <span className="font-semibold whitespace-nowrap">{st.label}</span>
            </div>
            <div className="mt-1 text-xs text-ivory-200/70">{st.detail}</div>
          </li>
        ))}
      </ol>

      <Panel>
        <div className="mx-auto grid max-w-xl grid-cols-3 items-center gap-2 sm:gap-3">
          {SEATS.map((seat) => (
            <div key={seat} className={SEAT_CELL[seat]}>
              <SeatCard seat={seat} snapshot={snapshot} busy={busy} onClaim={() => send('room:claimSeat', { seat })} />
            </div>
          ))}
          <div className="felt col-start-2 row-start-2 grid min-h-28 place-items-center rounded-2xl border border-black/40 text-center shadow-inner">
            <div>
              <div className="text-2xl" aria-hidden="true">♠♥♦♣</div>
              <div className="text-xs text-ivory-200/80">{t.boardsInMatch(pub.targetBoards)}</div>
            </div>
          </div>
        </div>

        {pub.lobby.length > 0 && (
          <div className="mt-4 text-sm">
            <div className="text-ivory-200/80">{t.lobbyMembers}</div>
            <ul className="mt-1 flex flex-wrap gap-2">
              {pub.lobby.map((m) => (
                <li key={m.displayName} className="rounded-full bg-white/10 px-3 py-1">
                  {m.displayName} {m.isHost && `(${t.host})`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        {allowed.ready && (
          <Button variant={myReady ? 'secondary' : 'primary'} disabled={busy} busy={pending?.type === 'room:ready'} onClick={() => send('room:ready', { ready: !myReady })}>
            {myReady ? t.unsetReady : t.setReady}
          </Button>
        )}
        {you.isHost && (
          <Button
            variant="primary"
            disabled={busy || !allowed.start}
            busy={pending?.type === 'room:start'}
            title={allowed.start ? undefined : t.waitingForReady}
            onClick={() => send('room:start', {})}
          >
            {t.start}
          </Button>
        )}
        {allowed.leave && (
          <Button variant="ghost" disabled={busy} onClick={() => send('room:leave', {})}>
            {t.leaveRoom}
          </Button>
        )}
        {status && <span className="text-sm text-ivory-200" role="status">{status}</span>}
      </div>
      <p className="text-sm text-ivory-200/70">{t.tip}</p>
    </div>
  );
};
