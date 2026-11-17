import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-gold-400 text-charcoal-950 hover:bg-gold-300 disabled:bg-gold-400/40',
  secondary: 'bg-white/10 text-ivory-100 hover:bg-white/20 border border-white/15 disabled:opacity-40',
  ghost: 'text-ivory-100 hover:bg-white/10 disabled:opacity-40',
  danger: 'bg-red-700 text-white hover:bg-red-600 disabled:opacity-40',
};

export const Button = ({
  variant = 'secondary',
  busy = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) => (
  <button
    type="button"
    {...rest}
    aria-busy={busy || undefined}
    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
  >
    {busy && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
    {children}
  </button>
);

export const Panel = ({ children, className = '', title }: { children: ReactNode; className?: string; title?: string }) => (
  <section className={`rounded-xl border border-white/10 bg-charcoal-900/85 p-4 shadow-lg ${className}`}>
    {title && <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gold-300">{title}</h2>}
    {children}
  </section>
);

export const Spinner = ({ label }: { label: string }) => (
  <div role="status" className="flex items-center justify-center gap-3 p-8 text-ivory-200">
    <span className="size-6 animate-spin rounded-full border-2 border-gold-400 border-t-transparent" aria-hidden="true" />
    <span>{label}</span>
  </div>
);

export const ErrorBox = ({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) => (
  <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-400/40 bg-red-950/60 px-4 py-3 text-red-100">
    <span className="flex-1">{message}</span>
    {onRetry && (
      <Button variant="secondary" onClick={onRetry}>
        {retryLabel}
      </Button>
    )}
  </div>
);
