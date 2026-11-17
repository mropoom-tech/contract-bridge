import { useState } from 'react';
import { t } from '../i18n/th';
import { navigate } from '../lib/router';
import { useSession } from '../stores/session';
import { Button, Panel } from '../components/ui';

export const LandingPage = () => {
  const status = useSession((s) => s.status);
  const [showHelp, setShowHelp] = useState(false);
  return (
    <div className="felt flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-2xl space-y-8 text-center">
        <p className="text-5xl tracking-[0.3em]" aria-hidden="true">
          <span className="text-ivory-50">♠</span>
          <span className="text-red-400">♥</span>
          <span className="text-red-400">♦</span>
          <span className="text-ivory-50">♣</span>
        </p>
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-[0.15em] text-gold-300 sm:text-5xl">{t.brand}</h1>
          <p className="text-lg text-ivory-100">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="primary" className="px-8 text-lg" onClick={() => navigate(status === 'authenticated' ? '/lobby' : '/play')}>
            {t.playNow}
          </Button>
          <Button variant="secondary" onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp}>
            {t.howToPlay}
          </Button>
        </div>
        {showHelp && (
          <Panel className="text-left leading-relaxed">
            <p>{t.howToPlayBody}</p>
          </Panel>
        )}
        <ul className="flex flex-wrap justify-center gap-2 text-sm">
          {t.features.map((f) => (
            <li key={f} className="rounded-full border border-gold-400/40 bg-black/20 px-3 py-1 text-ivory-100">
              {f}
            </li>
          ))}
        </ul>
        <div className="mx-auto grid max-w-xs grid-cols-2 gap-2 text-sm" aria-hidden="true">
          <div className="rounded-lg bg-ns-600/60 px-3 py-2">เหนือ + ใต้</div>
          <div className="rounded-lg bg-ew-600/60 px-3 py-2">ตะวันออก + ตะวันตก</div>
        </div>
      </section>
    </div>
  );
};
