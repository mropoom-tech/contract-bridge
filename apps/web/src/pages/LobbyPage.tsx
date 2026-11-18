import { useState, type FormEvent } from 'react';
import { t } from '../i18n/th';
import { api, ApiError, parseRoomCode } from '../lib/api';
import { navigate } from '../lib/router';
import { Button, ErrorBox, Panel } from '../components/ui';
import { useSession } from '../stores/session';
import { AppShell } from './AppShell';

const BOARD_OPTIONS = [1, 2, 4, 8, 16] as const;

const errorText = (e: unknown) =>
  e instanceof ApiError ? (e.code === 'NETWORK' ? t.networkError : (t.errors[e.code] ?? t.genericError)) : t.genericError;

export const LobbyPage = () => {
  const user = useSession((st) => st.user);
  const [boards, setBoards] = useState<number>(4);
  const [mode, setMode] = useState<'CLASSIC' | 'MINI'>('CLASSIC');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const { code } = await api.createRoom(boards, mode);
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
    <AppShell wide>
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-1">
          <p className="text-sm text-gold-300">{t.lobbyHello(user?.displayName ?? '')}</p>
          <h1 className="text-3xl font-bold">{t.lobbyTitle}</h1>
          <p className="text-ivory-200/75">{t.lobbySubtitle}</p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="flex flex-col gap-4 rounded-2xl border border-gold-400/30 bg-gradient-to-b from-gold-400/10 to-charcoal-900/90 p-5 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-gold-400 text-xl text-charcoal-950" aria-hidden="true">
                ＋
              </span>
              <div>
                <h2 className="text-lg font-semibold">{t.createRoom}</h2>
                <p className="text-sm text-ivory-200/70">{t.createRoomHint}</p>
              </div>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm text-ivory-200">{t.mode.label}</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {(['CLASSIC', 'MINI'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setMode(m)}
                    className={`rounded-xl border p-3 text-left transition ${
                      mode === m ? 'border-gold-400 bg-gold-400/20 ring-1 ring-gold-400' : 'border-white/15 bg-black/25 hover:border-gold-400/60'
                    }`}
                  >
                    <span className="block font-semibold">{t.mode[m]}</span>
                    <span className="block text-xs text-ivory-200/70">{t.mode[`${m}_hint`]}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm text-ivory-200">{t.boardCount}</legend>
              <div className="grid grid-cols-5 gap-2" role="radiogroup">
                {BOARD_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={boards === n}
                    onClick={() => setBoards(n)}
                    className={`min-h-12 rounded-xl border text-lg font-semibold transition ${
                      boards === n ? 'border-gold-400 bg-gold-400 text-charcoal-950 shadow' : 'border-white/15 bg-black/25 hover:border-gold-400/60'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-ivory-200/65">{t.boardEstimate(boards)}</p>
            </fieldset>
            <div className="flex flex-wrap gap-2 text-xs">
              {mode === 'CLASSIC' && <span className="rounded-full bg-black/30 px-3 py-1">{t.modeDuplicate}</span>}
              <span className="rounded-full bg-black/30 px-3 py-1">{t.fourPlayers}</span>
            </div>
            <Button variant="primary" className="mt-auto w-full text-lg" onClick={() => void create()} busy={creating} disabled={creating}>
              {t.createRoom}
            </Button>
            {createError && <ErrorBox message={createError} />}
          </section>

          <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-charcoal-900/85 p-5 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-white/10 text-xl" aria-hidden="true">
                🔑
              </span>
              <div>
                <h2 className="text-lg font-semibold">{t.joinRoom}</h2>
                <p className="text-sm text-ivory-200/70">{t.joinRoomHint}</p>
              </div>
            </div>
            <form onSubmit={(e) => void join(e)} className="flex flex-1 flex-col gap-3" noValidate>
              <label htmlFor="room-code" className="text-sm text-ivory-200">
                {t.roomCodeLabel}
              </label>
              <input
                id="room-code"
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  setJoinError(null);
                }}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="ABCD2345"
                aria-invalid={joinError !== null}
                className="min-h-14 w-full rounded-xl border border-white/20 bg-charcoal-950 px-4 text-center font-mono text-2xl tracking-[0.3em] text-ivory-50 uppercase placeholder:text-ivory-200/25 focus:border-gold-400 focus:outline-none"
              />
              <Button type="submit" variant="secondary" className="mt-auto w-full text-lg" busy={joining} disabled={joining || codeInput.trim() === ''}>
                {t.join}
              </Button>
              {joinError && <ErrorBox message={joinError} />}
            </form>
          </section>
        </div>

        <Panel className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{t.newToBridge}</h2>
            <p className="text-sm text-ivory-200/70">{t.newToBridgeHint}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate('/learn')}>📘 {t.learnNav}</Button>
            <Button variant="ghost" onClick={() => navigate('/learn/scoring')}>
              📊 {t.learn.scoringRef}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/learn/scoring#calc')}>
              🧮 {t.calcNav}
            </Button>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
};
