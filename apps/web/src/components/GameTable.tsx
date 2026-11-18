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
import { VotePanel } from './VotePanel';
import { MiniPanel } from './MiniPanel';
import { RubberSheet } from './RubberSheet';
import { DuplicatePanel } from './DuplicatePanel';
import { Button, Panel } from './ui';

const isNS = (s: Seat) => partnershipOf(s) === 'NS';

/** Seat badge: avatar, name, roles; glows when this seat must act. */
const SeatLabel = ({ pub, seat, self }: { pub: PublicViewState; seat: Seat; self: Seat | null }) => {
  const occ = pub.seats[seat];
  const active = pub.controllerSeat === seat && (pub.phase === 'BIDDING' || pub.phase === 'PLAYING' || pub.phase === 'DECLARING');
  const name = occ?.displayName ?? '—';
  return (
    <div
      className={`relative flex items-center gap-1.5 rounded-2xl border py-1 pr-2 pl-1 text-xs sm:gap-2 sm:pr-3 sm:text-sm shadow-lg backdrop-blur transition ${
        active ? 'seat-active border-gold-400 bg-gold-400/95 text-charcoal-950' : 'border-white/10 bg-charcoal-950/70'
      }`}
      aria-current={active ? 'true' : undefined}
    >
      <span
        className={`relative grid size-7 shrink-0 sm:size-8 place-items-center rounded-full text-sm font-bold text-white ${isNS(seat) ? 'bg-ns-600' : 'bg-ew-600'}`}
        aria-hidden="true"
      >
        {seat}
        <span
          className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-charcoal-950 ${occ?.online ? 'bg-emerald-400' : 'bg-gray-500'}`}
        />
      </span>
      <span className="sr-only">
        {t.seatName[seat]} {occ?.online ? t.online : t.offline}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="max-w-16 truncate font-semibold sm:max-w-32">
          {name}
          {seat === self && <span className="ml-1 text-xs font-normal opacity-80">({t.you})</span>}
        </span>
        <span className="flex flex-wrap gap-1 text-[10px] font-semibold uppercase tracking-wide">
          {pub.dealer === seat && <span className={active ? '' : 'text-gold-300'}>◆ {t.dealer}</span>}
          {pub.contract?.declarer === seat && <span className={`rounded px-1 ${active ? 'bg-charcoal-950/15' : 'bg-gold-400/25 text-gold-300'}`}>Declarer</span>}
          {pub.dummySeat === seat && (pub.contract || pub.phase === 'DECLARING') && <span className="rounded bg-white/15 px-1">{t.dummy}</span>}
          {pub.botSeats[seat] && <span className="rounded bg-sky-700 px-1 text-white">🤖 {t.vote.bot}</span>}
        </span>
      </span>
      {active && <span className="ml-1 hidden text-[11px] font-bold whitespace-nowrap sm:inline">● {t.table.acting}</span>}
    </div>
  );
};

/** Dummy shown face-up grouped by suit; interactive for declarer on dummy's turn. */
const DummyHand = ({
  cards,
  playable,
  selected,
  onSelect,
  vertical,
}: {
  cards: readonly Card[];
  playable: readonly Card[];
  selected: Card | null;
  onSelect?: (c: Card) => void;
  vertical: boolean;
}) => (
  <div className={vertical ? 'flex items-start gap-0.5 sm:gap-1' : 'flex flex-wrap justify-center gap-2'} aria-label={t.dummy}>
    {groupBySuit(cards).map((g) => (
      <div key={g.suit} className={vertical ? 'flex flex-col -space-y-8 sm:-space-y-9' : 'flex -space-x-4'}>
        {g.cards.map((c) => (
          <CardFace key={c} card={c} size="sm" onSelect={onSelect} playable={playable.includes(c)} selected={selected === c} disabledReason={t.notPlayable} />
        ))}
      </div>
    ))}
  </div>
);

const HiddenHand = ({ count, vertical }: { count: number; vertical: boolean }) => (
  <div className="relative" aria-label={t.cardsLeft(count)}>
    <div className={`flex ${vertical ? 'flex-col -space-y-9 sm:-space-y-10' : '-space-x-6 sm:-space-x-7'}`}>
      {Array.from({ length: Math.min(count, vertical ? 7 : 13) }, (_, i) => (
        <CardBack key={i} size="sm" />
      ))}
    </div>
    {count > 0 && (
      <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-charcoal-950 text-xs font-bold ring-1 ring-white/20">{count}</span>
    )}
  </div>
);

const TRICK_POS: Record<TablePosition, string> = {
  bottom: 'bottom-2 left-1/2 -translate-x-1/2',
  top: 'top-2 left-1/2 -translate-x-1/2',
  left: 'left-2 top-1/2 -translate-y-1/2',
  right: 'right-2 top-1/2 -translate-y-1/2',
};
const MARK_POS: Record<TablePosition, string> = {
  bottom: 'bottom-0.5 left-1/2 -translate-x-1/2',
  top: 'top-0.5 left-1/2 -translate-x-1/2',
  left: 'left-0.5 top-1/2 -translate-y-1/2',
  right: 'right-0.5 top-1/2 -translate-y-1/2',
};
const ARROW: Record<TablePosition, string> = { bottom: '↓', top: '↑', left: '←', right: '→' };

/** Center of the table: compass, current trick, contract and whose turn. */
const TrickArea = ({ pub, self }: { pub: PublicViewState; self: Seat }) => {
  const last = pub.completedTricks[pub.completedTricks.length - 1];
  const showing: readonly PlayedCard[] = pub.currentTrick.length > 0 ? pub.currentTrick : (last?.cards ?? []);
  const isLast = pub.currentTrick.length === 0 && last !== undefined;
  const actor = pub.controllerSeat ?? pub.turnSeat;
  const acting = actor && (pub.phase === 'BIDDING' || pub.phase === 'PLAYING' || pub.phase === 'DECLARING') ? positionOfSeat(self, actor) : null;
  return (
    <div className="relative mx-auto size-36 rounded-full sm:size-52 md:size-64 border border-white/10 bg-black/15 shadow-[inset_0_0_40px_rgba(0,0,0,0.35)] sm:size-64" aria-label={t.tricks}>
      {(['top', 'right', 'bottom', 'left'] as const).map((pos) => {
        const seat = seatAtPosition(self, pos);
        return (
          <span
            key={pos}
            className={`absolute ${MARK_POS[pos]} text-[10px] font-bold ${acting === pos ? 'text-gold-300' : isNS(seat) ? 'text-ns-400/70' : 'text-ew-400/70'}`}
            aria-hidden="true"
          >
            {seat}
          </span>
        );
      })}
      {showing.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
          {pub.contract ? (
            <>
              <span className="text-[11px] text-ivory-200/70">{t.contract}</span>
              <span className="text-3xl font-bold text-gold-300">{contractText(pub.contract)}</span>
              <span className="text-xs text-ivory-200/80">
                {t.table.by} {t.seatName[pub.contract.declarer]} ({pub.contract.declarer})
              </span>
            </>
          ) : (
            <span className="text-3xl tracking-widest text-white/15" aria-hidden="true">
              ♠♥♦♣
            </span>
          )}
          {acting && (
            <span className="mt-1 rounded-full bg-gold-400/90 px-2 py-0.5 text-xs font-bold text-charcoal-950">
              {ARROW[acting]} {pub.seats[actor as Seat]?.displayName}
            </span>
          )}
        </div>
      )}
      {showing.map((pc) => {
        const won = isLast && last?.winner === pc.seat;
        return (
          <div key={pc.card} className={`absolute ${TRICK_POS[positionOfSeat(self, pc.seat)]} card-enter ${won ? 'z-10' : ''}`}>
            <CardFace card={pc.card} size="md" dimmed={isLast && !won} className={won ? 'ring-2 ring-gold-400' : ''} />
          </div>
        );
      })}
      {isLast && last && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold">
            🏆 {t.wonBy} {t.seatName[last.winner]}
          </span>
        </div>
      )}
      {!isLast && showing.length > 0 && acting && (
        <span className="absolute inset-0 m-auto grid size-8 place-items-center rounded-full bg-gold-400 text-sm font-bold text-charcoal-950 shadow" aria-hidden="true">
          {ARROW[acting]}
        </span>
      )}
    </div>
  );
};

/** Info bar: board, dealer, vulnerability, contract and trick progress. */
const InfoBar = ({ pub, turnText, myTurn }: { pub: PublicViewState; turnText: string | null; myTurn: boolean }) => {
  const ns = pub.completedTricks.filter((tr) => isNS(tr.winner)).length;
  const ew = pub.completedTricks.length - ns;
  const c = pub.contract;
  const declSide = c ? partnershipOf(c.declarer) : null;
  const need = c ? 6 + c.level : 0;
  const got = declSide === 'NS' ? ns : declSide === 'EW' ? ew : 0;
  const vul = pub.vulnerability;
  const vulFor = (side: 'NS' | 'EW') => vul === 'BOTH' || vul === side;
  return (
    <div className="space-y-2" role="status">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-charcoal-950/60 px-3 py-2 text-sm">
        <span className="rounded-lg bg-white/10 px-2 py-1 font-semibold">
          {t.board} {pub.boardNumber ?? '—'}
        </span>
        <span className="text-ivory-200/80">
          {t.dealer} <strong className="text-ivory-50">{pub.dealer ?? '—'}</strong>
        </span>
        <span className="flex items-center gap-1">
          <span className="text-ivory-200/80">Vul</span>
          {(['NS', 'EW'] as const).map((side) => (
            <span
              key={side}
              className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${vulFor(side) ? 'bg-red-600 text-white' : 'bg-white/10 text-ivory-200/60'}`}
              title={vulFor(side) ? 'Vulnerable' : 'Non-vulnerable'}
            >
              {side}
            </span>
          ))}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {c ? (
            <span className="rounded-lg bg-gold-400/20 px-2 py-1 font-bold text-gold-300">
              {contractText(c)} · {c.declarer}
            </span>
          ) : (
            <span className="text-ivory-200/60">{pub.phase === 'DECLARING' ? t.mini.choosing : t.table.noContract}</span>
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {turnText && (
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${myTurn ? 'your-turn bg-gold-400 text-charcoal-950' : 'bg-black/35 text-ivory-100'}`}>
            {myTurn ? '👉 ' : ''}
            {turnText}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3 text-sm">
          {(['NS', 'EW'] as const).map((side) => (
            <span key={side} className="flex items-center gap-1.5">
              <span className={`font-bold ${side === 'NS' ? 'text-ns-400' : 'text-ew-400'}`}>{side}</span>
              <span className="text-lg font-bold tabular-nums">{side === 'NS' ? ns : ew}</span>
            </span>
          ))}
          {c && (
            <span className="flex items-center gap-1.5" title={t.table.progress(got, need)}>
              <span className="flex gap-0.5" aria-hidden="true">
                {Array.from({ length: 13 }, (_, i) => (
                  <span
                    key={i}
                    className={`h-3 w-1.5 rounded-sm ${i < got ? 'bg-emerald-400' : i < need ? 'bg-white/25' : 'bg-white/8'} ${i === need - 1 ? 'outline outline-1 outline-gold-400' : ''}`}
                  />
                ))}
              </span>
              <span className="text-xs text-ivory-200/80">{t.table.progress(got, need)}</span>
            </span>
          )}
        </div>
      </div>
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

  const inPlay = pub.phase === 'PLAYING';
  const showResult = pub.phase === 'BOARD_RESULT' || pub.phase === 'MATCH_COMPLETED';
  const myNextReady = you.seat ? (pub.nextBoardReady?.[you.seat] ?? false) : false;
  const myTurn = allowed.calls.length > 0 || allowed.miniChoices.length > 0 || play !== null;

  const turnText = (() => {
    if (!pub.turnSeat || showResult) return null;
    if (allowed.calls.length > 0) return t.table.yourBid;
    if (allowed.miniChoices.length > 0) return t.yourTurn;
    if (play) return play.fromSeat === you.seat ? t.table.yourCard : t.yourTurnDummy;
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
      const handTurn = play?.fromSeat === you.seat;
      body = (
        <div
          className={`max-w-full overflow-x-auto rounded-2xl px-2 pt-5 pb-2 transition ${handTurn ? 'bg-gold-400/10 ring-2 ring-gold-400/70' : ''}`}
          aria-label={t.you}
        >
          <div className="mx-auto flex w-max items-end gap-2 sm:gap-3">
            {groupBySuit(you.yourHand).map((g) => (
              <div key={g.suit} className="flex -space-x-5 sm:-space-x-6">
                {g.cards.map((c) => (
                  <CardFace
                    key={c}
                    card={c}
                    size="lg"
                    onSelect={inPlay ? playFrom(you.seat as Seat) : undefined}
                    playable={mine.includes(c)}
                    selected={selected === c && handTurn}
                    disabledReason={handTurn ? t.mustFollow : t.errors.NOT_YOUR_TURN}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      );
    } else if (isDummyShown) {
      const ctrlForDummy = play?.fromSeat === seat;
      body = (
        <div className={`rounded-2xl p-1.5 transition ${ctrlForDummy ? 'bg-gold-400/10 ring-2 ring-gold-400/70' : ''}`}>
          <DummyHand
            cards={pub.dummyCards ?? []}
            playable={ctrlForDummy ? (play?.cards ?? []) : []}
            selected={ctrlForDummy ? selected : null}
            onSelect={ctrlForDummy ? playFrom(seat) : undefined}
            vertical={vertical}
          />
        </div>
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
        <InfoBar pub={pub} turnText={turnText} myTurn={myTurn} />

        <div className="felt relative rounded-[2rem] border border-black/40 p-2 shadow-[inset_0_2px_30px_rgba(0,0,0,0.45),0_10px_30px_rgba(0,0,0,0.35)] ring-1 ring-white/5 sm:p-5">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_auto_auto] items-center gap-1.5 sm:gap-3">
            <div className="col-span-3 flex justify-center">{seatBlock('top')}</div>
            <div className="flex justify-start">{seatBlock('left')}</div>
            <TrickArea pub={pub} self={self} />
            <div className="flex justify-end">{seatBlock('right')}</div>
            <div className="col-span-3 flex min-w-0 justify-center">{seatBlock('bottom')}</div>
          </div>
          {play && selected && (
            <div className="sticky bottom-2 mt-3 flex justify-center">
              <Button variant="primary" className="px-6 text-base shadow-xl" disabled={busy} busy={pending?.type === 'card:play'} onClick={() => playFrom(play.fromSeat)(selected)}>
                {t.playCard}: {cardLabel(selected)}
                {play.fromSeat !== you.seat && ` (${t.dummy})`}
              </Button>
            </div>
          )}
          {play && !selected && <p className="mt-2 text-center text-xs text-ivory-200/70">{t.table.hintSelect}</p>}
        </div>
      </div>

      <aside className="space-y-4">
        <VotePanel snapshot={snapshot} />
        {allowed.calls.length > 0 && (
          <Panel title={t.bid} className="border-gold-400/60 ring-1 ring-gold-400/40">
            <BiddingBox allowed={allowed.calls} busy={busy} onCall={(c) => send('auction:call', c)} />
          </Panel>
        )}
        {pub.mode === 'MINI' && <MiniPanel snapshot={snapshot} />}
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
        {pub.dealer && pub.mode !== 'MINI' && (
          <Panel title={t.auction}>
            <AuctionGrid dealer={pub.dealer} history={pub.auctionHistory} turnSeat={pub.phase === 'BIDDING' ? pub.turnSeat : null} />
          </Panel>
        )}
        {pub.duplicate && (
          <Panel title={`${t.dup.title} · ${t.dup.thisTable(pub.duplicate.table)}`}>
            <DuplicatePanel dup={pub.duplicate} mySeat={you.seat} />
          </Panel>
        )}
        {pub.rubber && !showResult && (
          <Panel title={t.rubber.title}>
            <RubberSheet rubber={pub.rubber} />
          </Panel>
        )}
      </aside>
    </div>
  );
};
