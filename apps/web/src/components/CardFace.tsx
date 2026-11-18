import type { Card } from '@bridge/game-engine';
import { cardLabel, cardRank, cardSuit, isRed, RANK_DISPLAY, SUIT_SYMBOL } from '../lib/cards';

type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, string> = {
  sm: 'w-8 h-12 text-xs sm:w-10 sm:h-14 sm:text-sm',
  md: 'w-12 h-[4.25rem] text-base',
  lg: 'w-14 h-20 sm:w-16 sm:h-24 text-lg sm:text-xl',
};

interface Props {
  card: Card;
  size?: Size;
  /** When provided the card is an interactive button. */
  onSelect?: (card: Card) => void;
  playable?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  disabledReason?: string;
  className?: string;
}

export const CardFace = ({ card, size = 'md', onSelect, playable = false, selected = false, dimmed = false, disabledReason, className = '' }: Props) => {
  const suit = cardSuit(card);
  const color = isRed(suit) ? 'text-suit-red' : 'text-suit-black';
  const face = (
    <>
      <span className="leading-none font-bold">{RANK_DISPLAY[cardRank(card)]}</span>
      <span className="leading-none" aria-hidden="true">
        {SUIT_SYMBOL[suit]}
      </span>
    </>
  );
  // Index in the top-left corner so overlapped cards in a fan stay readable.
  const base = `relative flex shrink-0 flex-col items-start justify-start gap-0.5 rounded-md border bg-ivory-50 pl-1 pt-0.5 shadow-md select-none ${SIZES[size]} ${color} ${className}`;

  if (!onSelect) {
    return (
      <div role="img" aria-label={cardLabel(card)} className={`${base} border-ivory-200 ${dimmed ? 'opacity-60' : ''}`}>
        {face}
      </div>
    );
  }

  const label = `${cardLabel(card)}${playable ? '' : ` — ${disabledReason ?? ''}`}`;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      aria-disabled={!playable}
      title={playable ? undefined : disabledReason}
      onClick={() => playable && onSelect(card)}
      className={`${base} transition-transform ${
        selected
          ? '-translate-y-3 border-gold-500 ring-2 ring-gold-400'
          : playable
            ? 'border-gold-300 hover:-translate-y-1.5 cursor-pointer'
            : 'border-ivory-200 cursor-not-allowed opacity-55'
      }`}
    >
      {face}
    </button>
  );
};

export const CardBack = ({ size = 'sm' }: { size?: Size }) => (
  <div aria-hidden="true" className={`card-back shrink-0 rounded-md shadow ${SIZES[size]}`} />
);
