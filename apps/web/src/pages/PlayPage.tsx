import { useState, type FormEvent } from 'react';
import { t } from '../i18n/th';
import { ApiError } from '../lib/api';
import { navigate } from '../lib/router';
import { isValidNickname } from '../lib/validation';
import { useSession } from '../stores/session';
import { Button, ErrorBox, Panel } from '../components/ui';
import { AppShell } from './AppShell';


export const PlayPage = ({ next }: { next: string | null }) => {
  const login = useSession((s) => s.login);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = isValidNickname(name);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(name.trim());
      navigate(next ?? '/lobby', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'NETWORK' ? t.networkError : (t.errors[err instanceof ApiError ? err.code : ''] ?? t.genericError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <Panel>
        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          <h1 className="text-xl font-bold">{t.nicknameTitle}</h1>
          <div className="space-y-1">
            <label htmlFor="nickname" className="block text-sm font-medium text-ivory-200">
              {t.nicknameLabel}
            </label>
            <input
              id="nickname"
              autoFocus
              autoComplete="nickname"
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && !valid}
              aria-describedby="nickname-hint"
              className="w-full rounded-lg border border-white/20 bg-charcoal-950 px-3 py-2.5 text-lg text-ivory-50"
            />
            <p id="nickname-hint" className={`text-sm ${touched && !valid ? 'text-red-300' : 'text-ivory-200/70'}`}>
              {touched && !valid ? t.nicknameInvalid : t.nicknameHint}
            </p>
          </div>
          {error && <ErrorBox message={error} />}
          <Button type="submit" variant="primary" className="w-full" busy={busy} disabled={busy}>
            {t.continue}
          </Button>
        </form>
      </Panel>
    </AppShell>
  );
};
