import type { ReactNode } from 'react';
import { t } from '../i18n/th';
import { navigate } from '../lib/router';
import { useSession } from '../stores/session';
import { Button } from '../components/ui';

export const AppShell = ({ children, wide = false }: { children: ReactNode; wide?: boolean }) => {
  const { user, logout } = useSession();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-charcoal-950/70 px-4 py-2">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
          className="flex items-center gap-2 font-bold tracking-wider text-gold-300"
        >
          <span aria-hidden="true">♠♥♦♣</span>
          <span className="hidden sm:inline">{t.brand}</span>
        </a>
        <a
          href="/learn"
          onClick={(e) => {
            e.preventDefault();
            navigate('/learn');
          }}
          className="ml-auto rounded-lg px-2 py-1 text-sm text-ivory-100 hover:bg-white/10"
        >
          📘 {t.learnNav}
        </a>
        {user && (
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate text-ivory-200">
              {t.signedInAs} <strong className="text-ivory-50">{user.displayName}</strong>
            </span>
            <Button
              variant="ghost"
              className="min-h-9 px-2 py-1 text-sm"
              onClick={() => void logout().then(() => navigate('/'))}
            >
              {t.logout}
            </Button>
          </div>
        )}
      </header>
      <main className={`mx-auto w-full flex-1 px-4 py-6 ${wide ? 'max-w-7xl' : 'max-w-xl'}`}>{children}</main>
    </div>
  );
};
