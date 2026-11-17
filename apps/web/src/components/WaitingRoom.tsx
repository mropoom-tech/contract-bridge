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

export const WaitingRoom = ({ snapshot }: { snapshot: SeatSpecificSnapshot }) => {
  const send = useRoom((s) => s.send);
  const pending = useRoom((s) => s.pending);
  const synced = useRoom((s) => s.synced);
  const { public: pub, you, allowedActions: allowed } = snapshot;
  const busy = pending !== null || !synced;
  const filled = SEATS.filter((s) => pub.seats[s] !== null).length;
  const allReady = SEATS.every((s) => pub.seats[s]?.ready === true);
  const mySeat = you.seat;
  const myReady = mySeat ? (pub.seats[mySeat]?.ready ?? false) : false;

  const status =
    filled < 4 ? t.waitingForPlayers(4 - filled) : !allReady ? t.waitingForReady : you.isHost ? null : t.waitingForHost;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">{t.waitingRoom}</h1>
      <RoomCodeCard code={pub.roomCode} />

      <Panel>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SEATS.map((seat) => {
            const occ = pub.seats[seat];
            const isMe = seat === mySeat;
            return (
              <li key={seat} className={`rounded-xl border-2 p-3 ${teamClasses(seat)} ${isMe ? 'ring-2 ring-gold-400' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold">
                    {t.seatName[seat]} <span className="text-ivory-200/70">({seat})</span>
                  </span>
                  <span className="text-xs text-ivory-200/80">{partnershipOf(seat) === 'NS' ? 'ทีม เหนือ–ใต้' : 'ทีม ตะวันออก–ตะวันตก'}</span>
                </div>
                {occ ? (
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className={`size-2.5 rounded-full ${occ.online ? 'bg-emerald-400' : 'bg-gray-500'}`}
                        aria-label={occ.online ? t.online : t.offline}
                        role="img"
                      />
                      <strong className="truncate">{occ.displayName}</strong>
                      {isMe && <span className="rounded bg-gold-400 px-1.5 text-xs text-charcoal-950">{t.you}</span>}
                      {occ.isHost && <span className="rounded bg-white/15 px-1.5 text-xs">{t.host}</span>}
                    </div>
                    <div className={occ.ready ? 'font-semibold text-emerald-300' : 'text-ivory-200/70'}>
                      {occ.ready ? `✓ ${t.ready}` : t.notReady}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between text-sm text-ivory-200/70">
                    <span>{t.emptySeat}</span>
                    {allowed.claimSeat.includes(seat) && (
                      <Button disabled={busy} onClick={() => send('room:claimSeat', { seat })}>
                        {t.takeSeat}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

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
