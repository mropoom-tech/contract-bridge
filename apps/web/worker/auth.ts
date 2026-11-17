/** Guest sessions: random 256-bit bearer token in an HttpOnly cookie; only its SHA-256 is stored. */

export const SESSION_COOKIE = 'bridge_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const toHex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const generateSessionToken = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

export const hashToken = async (token: string): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));

/** Token shape check before hitting the DB (43 base64url chars). */
export const isWellFormedToken = (token: string): boolean => /^[A-Za-z0-9_-]{43}$/.test(token);

export interface SessionUser {
  readonly id: string;
  readonly displayName: string;
}

export const createGuestSession = async (
  db: D1Database,
  displayName: string,
  now: Date = new Date(),
): Promise<{ user: SessionUser; token: string }> => {
  const userId = crypto.randomUUID();
  const token = generateSessionToken();
  const iso = now.toISOString();
  const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db.batch([
    db
      .prepare('INSERT INTO users (id, display_name, user_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, displayName, 'guest', iso, iso),
    db
      .prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), userId, await hashToken(token), expires, iso),
  ]);
  return { user: { id: userId, displayName }, token };
};

export const findSessionUser = async (db: D1Database, token: string, now: Date = new Date()): Promise<SessionUser | null> => {
  if (!isWellFormedToken(token)) return null;
  const row = await db
    .prepare(
      `SELECT u.id AS id, u.display_name AS displayName
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?`,
    )
    .bind(await hashToken(token), now.toISOString())
    .first<SessionUser>();
  return row ?? null;
};

export const revokeSession = async (db: D1Database, token: string, now: Date = new Date()): Promise<void> => {
  if (!isWellFormedToken(token)) return;
  await db
    .prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
    .bind(now.toISOString(), await hashToken(token))
    .run();
};

/** Same-origin always allowed; extra origins from comma-separated config. */
export const isAllowedOrigin = (origin: string | null, requestUrl: string, extra: string): boolean => {
  if (!origin) return false;
  if (origin === new URL(requestUrl).origin) return true;
  return extra
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(origin);
};
