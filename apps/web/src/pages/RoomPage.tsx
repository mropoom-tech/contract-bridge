import { useEffect } from 'react';
import { t } from '../i18n/th';
import { navigate } from '../lib/router';
import { useRoom } from '../stores/room';
import { GameTable } from '../components/GameTable';
import { Button, ErrorBox, Spinner } from '../components/ui';
import { WaitingRoom } from '../components/WaitingRoom';
import { AppShell } from './AppShell';

const ErrorToast = () => {
  const error = useRoom((s) => s.error);
  const clear = useRoom((s) => s.clearError);
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(clear, 5000);
    return () => clearTimeout(id);
  }, [error, clear]);
  if (!error) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div role="alert" className="flex items-center gap-3 rounded-lg bg-red-800 px-4 py-2 text-white shadow-xl">
        <span>{t.errors[error] ?? t.genericError}</span>
        <button type="button" onClick={clear} className="rounded px-2 text-sm underline">
          {t.close}
        </button>
      </div>
    </div>
  );
};

export const RoomPage = ({ code }: { code: string }) => {
  const connect = useRoom((s) => s.connect);
  const disconnect = useRoom((s) => s.disconnect);
  const status = useRoom((s) => s.status);
  const snapshot = useRoom((s) => s.snapshot);
  const error = useRoom((s) => s.error);
  const takeOver = useRoom((s) => s.takeOver);
  const announcement = useRoom((s) => s.announcement);

  useEffect(() => {
    connect(code);
    return () => disconnect();
  }, [code, connect, disconnect]);

  const left = status === 'left';
  useEffect(() => {
    if (left) navigate('/lobby', { replace: true });
  }, [left]);

  let content;
  if (status === 'fatal') {
    content = (
      <div className="mx-auto max-w-md space-y-4">
        <ErrorBox message={t.errors[error ?? ''] ?? t.genericError} />
        <Button onClick={() => navigate('/lobby')}>{t.backToLobby}</Button>
      </div>
    );
  } else if (status === 'replaced') {
    content = (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <p>{t.replaced}</p>
        <Button variant="primary" onClick={takeOver}>
          {t.useHere}
        </Button>
      </div>
    );
  } else if (!snapshot) {
    content = <Spinner label={status === 'reconnecting' ? t.reconnecting : t.connecting} />;
  } else if (snapshot.public.phase === 'WAITING') {
    content = <WaitingRoom snapshot={snapshot} />;
  } else {
    content = <GameTable snapshot={snapshot} />;
  }

  return (
    <AppShell wide>
      {content}
      {status === 'reconnecting' && snapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="alertdialog" aria-label={t.reconnecting}>
          <div className="rounded-xl bg-charcoal-900 px-6 py-4 shadow-xl">
            <Spinner label={t.reconnecting} />
          </div>
        </div>
      )}
      <ErrorToast />
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </AppShell>
  );
};
