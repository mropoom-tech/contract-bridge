import { useState, type FormEvent } from 'react';
import { t } from '../i18n/th';
import { api, ApiError, parseRoomCode } from '../lib/api';
import { navigate } from '../lib/router';
import { Button, ErrorBox, Panel } from '../components/ui';
import { AppShell } from './AppShell';

const errorText = (e: unknown) =>
  e instanceof ApiError ? (e.code === 'NETWORK' ? t.networkError : (t.errors[e.code] ?? t.genericError)) : t.genericError;

export const LobbyPage = () => {
  const [boards, setBoards] = useState(4);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const { code } = await api.createRoom(boards);
      navigate(`/room/${code}`);
    } catch (e) {
      setCreateError(errorText(e));
    } finally {
      setCreating(false);
    }
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    const code = parseRoomCode(codeInput);
    if (!code) {
      setJoinError(t.roomCodeInvalid);
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      await api.join(code);
      navigate(`/room/${code}`);
    } catch (err) {
      setJoinError(errorText(err));
    } finally {
      setJoining(false);
    }
  };

  return (
    <AppShell>
      <h1 className="mb-4 text-2xl font-bold">{t.lobbyTitle}</h1>
      <div className="space-y-4">
        <Panel title={t.createRoom}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-ivory-200">
              {t.boardCount}
              <select
                value={boards}
                onChange={(e) => setBoards(Number(e.target.value))}
                className="min-h-11 rounded-lg border border-white/20 bg-charcoal-950 px-3 text-ivory-50"
              >
                {[1, 2, 4, 8, 16].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="primary" onClick={() => void create()} busy={creating} disabled={creating}>
              {t.createRoom}
            </Button>
          </div>
          {createError && <div className="mt-3"><ErrorBox message={createError} /></div>}
        </Panel>

        <Panel title={t.joinRoom}>
          <form onSubmit={(e) => void join(e)} className="space-y-3" noValidate>
            <label htmlFor="room-code" className="block text-sm text-ivory-200">
              {t.roomCodeLabel}
            </label>
            <div className="flex gap-2">
              <input
                id="room-code"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="ABCD2345"
                aria-invalid={joinError !== null}
                className="min-w-0 flex-1 rounded-lg border border-white/20 bg-charcoal-950 px-3 py-2.5 font-mono text-lg tracking-widest text-ivory-50 uppercase"
              />
              <Button type="submit" variant="secondary" busy={joining} disabled={joining}>
                {t.join}
              </Button>
            </div>
            {joinError && <ErrorBox message={joinError} />}
          </form>
        </Panel>
      </div>
    </AppShell>
  );
};
