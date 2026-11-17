import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import {
  CreateRoomRequestSchema,
  GuestLoginRequestSchema,
  ROOM_CODE_ALPHABET,
  RoomCodeSchema,
  type ErrorCode,
  type MeResponse,
  type RoomSummary,
} from '@bridge/shared';
import {
  createGuestSession,
  findSessionUser,
  isAllowedOrigin,
  revokeSession,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type SessionUser,
} from './auth';
import { INTERNAL_USER_HEADER } from './room/internal';

/** Response contract for GET /api/health (validated in tests). */
export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal('contract-bridge-online'),
  time: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

type AppEnv = { Bindings: Env; Variables: { user: SessionUser } };
type Ctx = Context<AppEnv>;

const HTTP_STATUS: Partial<Record<ErrorCode, 400 | 401 | 403 | 404 | 409 | 429 | 500>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  ROOM_NOT_FOUND: 404,
  ROOM_FULL: 409,
  ROOM_CLOSED: 409,
  INVALID_PAYLOAD: 400,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

const apiError = (c: Ctx, code: ErrorCode, message: string) =>
  c.json({ ok: false as const, error: { code, message } }, HTTP_STATUS[code] ?? 400);

const generateRoomCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  // 256 % 31 bias is negligible for an index lookup that is not a secret; codes are also unique-checked.
  return [...bytes].map((b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
};

/** Max open (waiting/active) rooms a user may host within 24 h. */
export const MAX_OPEN_ROOMS_PER_HOST = 5;

/** True when the request must be rejected. Missing binding (e.g. unit tests) = no limit. */
const overLimit = async (limiter: RateLimit | undefined, key: string): Promise<boolean> => {
  if (!limiter) return false;
  const { success } = await limiter.limit({ key });
  return !success;
};

/** Cloudflare always sets CF-Connecting-IP in production; it is absent only in local dev, where IP limits are skipped. */
const clientIp = (c: Ctx): string | null => c.req.header('CF-Connecting-IP') ?? null;

const roomStub = (env: Env, roomId: string) => env.BRIDGE_ROOMS.get(env.BRIDGE_ROOMS.idFromName(roomId));

const findRoomId = async (db: D1Database, code: string): Promise<string | null> =>
  (await db.prepare("SELECT id FROM rooms WHERE code = ? AND status <> 'archived'").bind(code).first<{ id: string }>())?.id ?? null;

/** Reject cross-site requests on cookie-authenticated mutations (CSRF) and WS upgrades. */
const originGuard = createMiddleware<AppEnv>(async (c, next) => {
  const needsCheck = c.req.method !== 'GET' || c.req.header('Upgrade')?.toLowerCase() === 'websocket';
  if (needsCheck && !isAllowedOrigin(c.req.header('Origin') ?? null, c.req.url, c.env.ALLOWED_ORIGINS ?? '')) {
    return apiError(c, 'FORBIDDEN', 'Origin not allowed.');
  }
  await next();
});

const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await findSessionUser(c.env.DB, token) : null;
  if (!user) return apiError(c, 'UNAUTHENTICATED', 'Sign in as a guest first.');
  c.set('user', user);
  await next();
});

const parseJson = async <T>(c: Ctx, schema: z.ZodType<T>): Promise<T | null> => {
  const text = await c.req.text();
  if (text.length > 2048) return null;
  try {
    const r = schema.safeParse(text ? JSON.parse(text) : {});
    return r.success ? r.data : null;
  } catch {
    return null;
  }
};

export const createApp = () => {
  const app = new Hono<AppEnv>().basePath('/api');
  app.use('*', originGuard);

  app.get('/health', (c) =>
    c.json<HealthResponse>({ ok: true, service: 'contract-bridge-online', time: new Date().toISOString() }),
  );

  // ----- auth -----
  app.post('/auth/guest', async (c) => {
    const ip = clientIp(c);
    if (ip && (await overLimit(c.env.GUEST_LIMITER, `guest:${ip}`))) {
      return apiError(c, 'RATE_LIMITED', 'Too many sign-ins; try again in a minute.');
    }
    const body = await parseJson(c, GuestLoginRequestSchema);
    if (!body) return apiError(c, 'INVALID_PAYLOAD', 'Display name must be 2-24 plain characters.');
    const { user, token } = await createGuestSession(c.env.DB, body.displayName);
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === 'https:',
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });
    return c.json<MeResponse>({ user: { id: user.id, displayName: user.displayName } }, 201);
  });

  app.get('/auth/me', requireUser, (c) => {
    const u = c.get('user');
    return c.json<MeResponse>({ user: { id: u.id, displayName: u.displayName } });
  });

  app.post('/auth/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await revokeSession(c.env.DB, token);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  // ----- rooms -----
  app.post('/rooms', requireUser, async (c) => {
    const body = await parseJson(c, CreateRoomRequestSchema);
    if (!body) return apiError(c, 'INVALID_PAYLOAD', 'targetBoards must be 1-16.');
    const user = c.get('user');
    if (await overLimit(c.env.ROOM_LIMITER, `room:${user.id}`)) {
      return apiError(c, 'RATE_LIMITED', 'Too many requests; try again in a minute.');
    }
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const open = await c.env.DB.prepare(
      `SELECT count(*) AS n FROM rooms WHERE host_user_id = ? AND status IN ('waiting','active') AND created_at > ?`,
    )
      .bind(user.id, since)
      .first<{ n: number }>();
    if ((open?.n ?? 0) >= MAX_OPEN_ROOMS_PER_HOST) {
      return apiError(c, 'RATE_LIMITED', 'Too many open rooms; finish or reuse an existing room.');
    }
    const roomId = crypto.randomUUID();
    const now = new Date().toISOString();
    let code: string | null = null;
    for (let attempt = 0; attempt < 5 && code === null; attempt++) {
      const candidate = generateRoomCode();
      const res = await c.env.DB.prepare(
        `INSERT INTO rooms (id, code, host_user_id, status, created_at, updated_at)
         VALUES (?, ?, ?, 'waiting', ?, ?) ON CONFLICT(code) DO NOTHING`,
      )
        .bind(roomId, candidate, user.id, now, now)
        .run();
      if (res.meta.changes === 1) code = candidate;
    }
    if (code === null) return apiError(c, 'INTERNAL_ERROR', 'Could not allocate a room code.');
    await roomStub(c.env, roomId).initialize({
      roomId,
      code,
      host: { userId: user.id, displayName: user.displayName },
      targetBoards: body.targetBoards,
      createdAt: now,
    });
    return c.json({ code }, 201);
  });

  app.get('/rooms/:code', requireUser, async (c) => {
    const code = RoomCodeSchema.safeParse(c.req.param('code').toUpperCase());
    if (!code.success) return apiError(c, 'ROOM_NOT_FOUND', 'Room not found.');
    const roomId = await findRoomId(c.env.DB, code.data);
    const summary = roomId ? await roomStub(c.env, roomId).summary(c.get('user').id) : null;
    if (!summary) return apiError(c, 'ROOM_NOT_FOUND', 'Room not found.');
    return c.json<RoomSummary>(summary);
  });

  app.post('/rooms/:code/join', requireUser, async (c) => {
    const code = RoomCodeSchema.safeParse(c.req.param('code').toUpperCase());
    if (!code.success) return apiError(c, 'ROOM_NOT_FOUND', 'Room not found.');
    const roomId = await findRoomId(c.env.DB, code.data);
    if (!roomId) return apiError(c, 'ROOM_NOT_FOUND', 'Room not found.');
    const user = c.get('user');
    if (await overLimit(c.env.ROOM_LIMITER, `room:${user.id}`)) {
      return apiError(c, 'RATE_LIMITED', 'Too many requests; try again in a minute.');
    }
    const r = await roomStub(c.env, roomId).join({ userId: user.id, displayName: user.displayName });
    if (!r.ok) return apiError(c, r.error.code, r.error.message);
    return c.json({ ok: true, code: code.data });
  });

  app.get('/rooms/:code/ws', requireUser, async (c) => {
    if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') {
      return apiError(c, 'INVALID_PAYLOAD', 'Expected a WebSocket upgrade.');
    }
    const code = RoomCodeSchema.safeParse(c.req.param('code').toUpperCase());
    const roomId = code.success ? await findRoomId(c.env.DB, code.data) : null;
    if (!roomId) return apiError(c, 'ROOM_NOT_FOUND', 'Room not found.');
    // Build a fresh internal request: only the upgrade header plus our verified identity.
    const headers = new Headers({ Upgrade: 'websocket', [INTERNAL_USER_HEADER]: c.get('user').id });
    return roomStub(c.env, roomId).fetch(new Request('https://room.internal/ws', { headers }));
  });

  app.notFound((c) => c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Unknown API route' } }, 404));
  app.onError((err, c) => {
    console.error('unhandled_error', { path: c.req.path, name: err.name });
    return c.json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
  });

  return app;
};
