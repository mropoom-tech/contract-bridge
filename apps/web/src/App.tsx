import { useEffect } from 'react';
import { t } from './i18n/th';
import { LearnIndexPage, LessonPage, ScoringReferencePage } from './pages/LearnPage';
import { navigate, useRoute, type Route } from './lib/router';
import { useSession } from './stores/session';
import { Button, ErrorBox, Spinner } from './components/ui';
import { AppShell } from './pages/AppShell';
import { LandingPage } from './pages/LandingPage';
import { LobbyPage } from './pages/LobbyPage';
import { PlayPage } from './pages/PlayPage';
import { RoomPage } from './pages/RoomPage';

const needsAuth = (r: Route) => r.name === 'lobby' || r.name === 'room';
const currentPath = (r: Route) => (r.name === 'room' ? `/room/${r.code}` : '/lobby');

export default function App() {
  const route = useRoute();
  const status = useSession((s) => s.status);
  const load = useSession((s) => s.load);

  useEffect(() => {
    if (status === 'unknown') void load();
  }, [status, load]);

  useEffect(() => {
    if (needsAuth(route) && status === 'anonymous') {
      navigate(`/play?next=${encodeURIComponent(currentPath(route))}`, { replace: true });
    }
    if (route.name === 'play' && status === 'authenticated') navigate(route.next ?? '/lobby', { replace: true });
  }, [route, status]);

  if (route.name === 'landing') return <LandingPage />;
  // Tutorial pages are public: no sign-in needed to learn the game.
  if (route.name === 'learn') return <LearnIndexPage />;
  if (route.name === 'lesson') return <LessonPage id={route.id} />;
  if (route.name === 'scoring') return <ScoringReferencePage />;
  if (route.name === 'notFound') {
    return (
      <AppShell>
        <p className="mb-4">{t.notFound}</p>
        <Button onClick={() => navigate('/')}>{t.goHome}</Button>
      </AppShell>
    );
  }
  if (status === 'unknown' || status === 'loading') {
    return (
      <AppShell>
        <Spinner label={t.loading} />
      </AppShell>
    );
  }
  if (status === 'error') {
    return (
      <AppShell>
        <ErrorBox message={t.networkError} onRetry={() => void load()} retryLabel={t.retry} />
      </AppShell>
    );
  }
  if (route.name === 'play') return <PlayPage next={route.next} />;
  if (status !== 'authenticated') return null;
  if (route.name === 'lobby') return <LobbyPage />;
  return <RoomPage code={route.code} />;
}
