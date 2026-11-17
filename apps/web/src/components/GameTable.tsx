import { useState } from 'react';
import { partnershipOf, type Card, type PlayedCard, type Seat } from '@bridge/game-engine';
import type { PublicViewState, SeatSpecificSnapshot } from '@bridge/shared';
import { t } from '../i18n/th';
import { cardLabel, contractText, groupBySuit, positionOfSeat, seatAtPosition, type TablePosition } from '../lib/cards';
import { navigate } from '../lib/router';
import { useRoom } from '../stores/room';
import { AuctionGrid, BiddingBox } from './Auction';
import { CardBack, CardFace } from './CardFace';
import { ResultPanel } from './ResultPanel';
import { Button, Panel } from './ui';

const teamText = (s: Seat) => (partnershipOf(s) === 'NS' ? 'text-ns-400' : 'text-ew-400');

const SeatLabel = ({ pub, seat, self }: { pub: PublicViewState; seat: Seat; self: Seat | null }) => {
  const occ = pub.seats[seat];
  const active = pub.turnSeat === seat && (pub.phase === 'BIDDING' || pub.phase === 'PLAYING');
  return (
    <div
      className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm ${active ? 'bg-gold-400 text-charcoal-950' : 'bg-black/35'}`}
      aria-current={active ? 'true' : undefined}
    >
      <span className={`size-2 rounded-full ${occ?.online ? 'bg-emerald-400' : 'bg-gray-500'}`} role="img" aria-label={occ?.online ? t.online : t.offline} />
      <strong className={active ? '' : teamText(seat)}>{seat}</strong>
      <span className="max-w-28 truncate">{occ?.displayName ?? '—'}</span>
      {seat === self && <span className="text-xs">({t.you})</span>}
      {pub.dealer === seat && <span title={t.dealer} className="text-xs">◆</span>}
      {pub.dummySeat === seat && pub.contract && <span className="rounded bg-white/20 px-1 text-xs">{t.dummy}</span>}
      {pub.contract?.declarer === seat && <span className="rounded bg-white/20 px-1 text-xs">Decl.</span>}
    </div>
  );
};

/** Dummy shown face-up grouped by suit; interactive for declarer on dummy's turn. */
const DummyHand = ({ cards, playable, selected, onSelect }: { cards: readonly Card[]; playable: readonly Card[]; selected: Card | null; onSelect?: (c: Card) => void }) => (
  <div className="flex flex-wrap justify-center gap-2" aria-label={t.dummy}>
    {groupBySuit(cards).map((g) => (
      <div key={g.suit} className="flex -space-x-4">
        {g.cards.map((c) => (
          <CardFace
            key={c}
            card={c}
            size="sm"
            onSelect={onSelect}
            playable={playable.includes(c)}
            selected={selected === c}
            disabledReason={t.notPlayable}
          />
        ))}
      </div>
    ))}
  </div>
);

const HiddenHand = ({ count, vertical }: { count: number; vertical: boolean }) => (
  <div className="flex flex-col items-center gap-1" aria-label={t.cardsLeft(count)}>
    <div className={`flex ${vertical ? 'flex-col -space-y-9' : '-space-x-6'}`}>
      {Array.from({ length: Math.min(count, vertical ? 7 : 13) }, (_, i) => (
        <CardBack key={i} size="sm" />
      ))}
    </div>
    <span className="text-xs text-ivory-200/80">{t.cardsLeft(count)}</span>
  </div>
);

const TRICK_POS: Record<TablePosition, string> = {
  bottom: 'bottom-1 left-1/2 -translate-x-1/2',
  top: 'top-1 left-1/2 -translate-x-1/2',
  left: 'left-1 top-1/2 -translate-y-1/2',
  right: 'right-1 top-1/2 -translate-y-1/2',
};

const TrickArea = ({ pub, self }: { pub: PublicViewState; self: Seat }) => {
  const last = pub.completedTricks[pub.completedTricks.length - 1];
  const showing: readonly PlayedCard[] = pub.currentTrick.length > 0 ? pub.currentTrick : (last?.cards ?? []);
  const isLast = pub.currentTrick.length === 0 && last !== undefined;
  return (
    <div className="relative mx-auto size-48 sm:size-56" aria-label={t.tricks}>
      {showing.map((pc) => (
        <div key={pc.card} className={`absolute ${TRICK_POS[positionOfSeat(self, pc.seat)]} card-enter`}>
          <CardFace card={pc.card} size="md" dimmed={isLast && last?.winner !== pc.seat} />
        </div>
      ))}
      {isLast && last && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded bg-black/60 px-2 py-0.5 text-xs">
            {t.wonBy} {t.seatName[last.winner]}
          </span>
        </div>
      )}
    </div>
  );
};

export const GameTable = ({ snapshot }: { snapshot: SeatSpecificSnapshot }) => {
  const send = useRoom((s) => s.send);
  const pending = useRoom((s) => s.pending);
  const synced = useRoom((s) => s.synced);
  const { public: pub, you, allowedActions: allowed } = snapshot;
  const self: Seat = you.seat ?? 'S';
  const busy = pending !== null || !synced;
  const [selection, setSelection] = useState<{ card: Card; version: number } | null>(null);
  // A selection is only valid for the snapshot it was made in.
  const selected = selection && selection.version === pub.version ? selection.card : null;

  const play = allowed.play;
  const playFrom = (fromSeat: Seat) => (card: Card) => {
    if (!play || play.fromSeat !== fromSeat || busy) return;
    if (selected === card) {
      send('card:play', { fromSeat, card });
      setSelection(null);
    } else setSelection({ card, version: pub.version });
  };

  const nsTricks = pub.completedTricks.filter((tr) => partnershipOf(tr.winner) === 'NS').length;
  const ewTricks = pub.completedTricks.length - nsTricks;
  const inPlay = pub.phase === 'PLAYING';
  const showResult = pub.phase === 'BOARD_RESULT' || pub.phase === 'MATCH_COMPLETED';
  const myNextReady = you.seat ? (pub.nextBoardReady?.[you.seat] ?? false) : false;

  const turnText = (() => {
    if (!pub.turnSeat || showResult) return null;
    if (allowed.calls.length > 0) return t.yourTurn;
    if (play) return play.fromSeat === you.seat ? t.yourTurn : t.yourTurnDummy;
    const ctrl = pub.controllerSeat ?? pub.turnSeat;
    return t.waitingFor(pub.seats[ctrl]?.displayName ?? ctrl);
  })();

  const seatBlock = (pos: TablePosition) => {
    const seat = seatAtPosition(self, pos);
    const vertical = pos === 'left' || pos === 'right';
    const isDummyShown = pub.dummySeat === seat && pub.dummyCards !== null;
    let body;
    if (pos === 'bottom' && you.seat) {
      const mine = play?.fromSeat === you.seat ? play.cards : [];
      const myTurn = play?.fromSeat === you.seat;
      body = (
        <div className="max-w-full overflow-x-auto px-2 pt-4 pb-2" aria-label={t.you}>
          <div className="mx-auto flex w-max -space-x-4 sm:-space-x-6">
          {you.yourHand.map((c) => (
            <CardFace
              key={c}
              card={c}
              size="lg"
              onSelect={inPlay ? playFrom(you.seat as Seat) : undefined}
              playable={mine.includes(c)}
              selected={selected === c && myTurn}
              disabledReason={myTurn ? t.mustFollow : t.errors.NOT_YOUR_TURN}
            />
          ))}
          </div>
        </div>
      );
    } else if (isDummyShown) {
      const ctrlForDummy = play?.fromSeat === seat;
      body = (
        <DummyHand
          cards={pub.dummyCards ?? []}
          playable={ctrlForDummy ? (play?.cards ?? []) : []}
          selected={ctrlForDummy ? selected : null}
          onSelect={ctrlForDummy ? playFrom(seat) : undefined}
        />
      );
    } else {
      body = <HiddenHand count={pub.cardCounts?.[seat] ?? 0} vertical={vertical} />;
    }
    return (
      <div className={`flex flex-col items-center gap-2 ${pos === 'bottom' ? 'w-full' : ''}`}>
        {pos !== 'bottom' && <SeatLabel pub={pub} seat={seat} self={you.seat} />}
        {body}
        {pos === 'bottom' && <SeatLabel pub={pub} seat={seat} self={you.seat} />}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-black/30 px-3 py-2 text-sm" role="status">
          <span>
            {t.board} <strong>{pub.boardNumber}</strong>
          </span>
          <span>
            {t.dealer} <strong>{pub.dealer}</strong>
          </span>
          <span>
            {t.vulnerable}: <strong>{pub.vulnerability ? t.vulName[pub.vulnerability] : '—'}</strong>
          </span>
          {pub.contract && (
            <span>
              {t.contract} <strong className="text-gold-300">{contractText(pub.contract)}</strong> ({pub.contract.declarer})
            </span>
          )}
          {turnText && <span className={allowed.calls.length > 0 || play ? 'font-bold text-gold-300' : ''}>{turnText}</span>}
          <span className="ml-auto">
            <span className="text-ns-400">NS {nsTricks}</span> · <span className="text-ew-400">EW {ewTricks}</span> {t.tricks}
          </span>
        </div>

        <div className="felt rounded-3xl border border-black/40 p-3 shadow-inner sm:p-5">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_auto_auto] items-center gap-2">
            <div className="col-span-3 flex justify-center">{seatBlock('top')}</div>
            <div className="flex justify-start">{seatBlock('left')}</div>
            <TrickArea pub={pub} self={self} />
            <div className="flex justify-end">{seatBlock('right')}</div>
            <div className="col-span-3 flex min-w-0 justify-center">{seatBlock('bottom')}</div>
          </div>
          {play && selected && (
            <div className="mt-2 flex justify-center">
              <Button variant="primary" disabled={busy} busy={pending?.type === 'card:play'} onClick={() => playFrom(play.fromSeat)(selected)}>
                {t.playCard}: {cardLabel(selected)}
                {play.fromSeat !== you.seat && ` (${t.dummy})`}
              </Button>
            </div>
          )}
        </div>
      </div>

      <aside className="space-y-4">
        {showResult && (
          <Panel>
            <ResultPanel
              pub={pub}
              canReadyNext={allowed.readyNext}
              myReady={myNextReady}
              busy={busy}
              onReadyNext={(ready) => send('board:readyNext', { ready })}
              onLeave={() => navigate('/lobby')}
            />
          </Panel>
        )}
        {allowed.calls.length > 0 && (
          <Panel title={t.bid}>
            <BiddingBox allowed={allowed.calls} busy={busy} onCall={(c) => send('auction:call', c)} />
          </Panel>
        )}
        {pub.dealer && (
          <Panel title={t.auction}>
            <AuctionGrid dealer={pub.dealer} history={pub.auctionHistory} turnSeat={pub.phase === 'BIDDING' ? pub.turnSeat : null} />
          </Panel>
        )}
      </aside>
    </div>
  );
};
