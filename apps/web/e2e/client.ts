/** Minimal Node test client: cookie-authenticated REST + WebSocket (undici WebSocket supports `headers`). */
import type { ClientCommandType, SeatSpecificSnapshot, ServerMessage } from '@bridge/shared';

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
export const ORIGIN = new URL(BASE).origin;
const WS_BASE = BASE.replace(/^http/, 'ws');

export interface Guest {
  readonly id: string;
  readonly name: string;
  readonly cookie: string;
}

/** Each simulated player gets its own documentation-range IP so local per-IP limits behave like distinct devices. */
const fakeIp = () => `198.51.100.${Math.floor(Math.random() * 254) + 1}`;

export const api = async (path: string, init: { method?: string; body?: unknown; cookie?: string; origin?: string | null } = {}) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'CF-Connecting-IP': fakeIp() };
  if (init.cookie) headers.Cookie = init.cookie;
  if (init.origin !== null) headers.Origin = init.origin ?? ORIGIN;
  const res = await fetch(`${BASE}/api${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
};

export const createGuest = async (name: string): Promise<Guest> => {
  const r = await api('/auth/guest', { method: 'POST', body: { displayName: name } });
  if (r.status !== 201) throw new Error(`guest failed ${r.status}`);
  const setCookie = r.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0] ?? '';
  return { id: (r.json.user as { id: string }).id, name, cookie };
};

type Pending = { resolve: (m: ServerMessage) => void };

export class RoomClient {
  readonly frames: string[] = [];
  snapshot: SeatSpecificSnapshot | null = null;
  version = 0;
  closed: { code: number; reason: string } | null = null;
  replaced = false;
  private readonly pending = new Map<string, Pending>();
  private waiters: Array<() => void> = [];

  private readonly ws: WebSocket;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (ev) => {
      const raw = String(ev.data);
      this.frames.push(raw);
      const msg = JSON.parse(raw) as ServerMessage;
      if (msg.type === 'session:replaced') {
        this.replaced = true;
        ws.close();
      } else if (msg.type === 'session:snapshot') {
        this.snapshot = msg.snapshot;
        this.version = msg.stateVersion;
      } else if (msg.requestId !== null && this.pending.has(msg.requestId)) {
        this.pending.get(msg.requestId)!.resolve(msg);
        this.pending.delete(msg.requestId);
      }
      const w = this.waiters;
      this.waiters = [];
      w.forEach((f) => f());
    });
    ws.addEventListener('close', (ev) => {
      this.closed = { code: ev.code, reason: ev.reason };
      const w = this.waiters;
      this.waiters = [];
      w.forEach((f) => f());
    });
  }

  static connect(code: string, headers: Record<string, string>): Promise<RoomClient> {
    return new Promise((resolve, reject) => {
      const WS = WebSocket as unknown as new (url: string, init: { headers: Record<string, string> }) => WebSocket;
      const ws = new WS(`${WS_BASE}/api/rooms/${code}/ws`, { headers });
      const client = new RoomClient(ws);
      ws.addEventListener('error', () => reject(new Error('ws error')));
      // resolve after first snapshot
      void client.waitFor(() => client.snapshot !== null, 5000).then(() => resolve(client), reject);
    });
  }

  waitFor(pred: () => boolean, timeoutMs = 5000): Promise<void> {
    if (pred()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('waitFor timeout')), timeoutMs);
      const check = () => {
        if (pred()) {
          clearTimeout(t);
          resolve();
        } else this.waiters.push(check);
      };
      this.waiters.push(check);
    });
  }

  sendRaw(data: string): void {
    this.ws.send(data);
  }

  /** Send a command; resolves with the ack/error and waits until the snapshot reaches the acked version. */
  async command(type: ClientCommandType, payload: unknown, opts: { requestId?: string; expectedVersion?: number } = {}): Promise<ServerMessage> {
    const requestId = opts.requestId ?? crypto.randomUUID();
    const p = new Promise<ServerMessage>((resolve) => this.pending.set(requestId, { resolve }));
    const frame: Record<string, unknown> = { protocolVersion: 1, requestId, type, payload };
    if (type !== 'state:requestSnapshot') frame.expectedVersion = opts.expectedVersion ?? this.version;
    this.ws.send(JSON.stringify(frame));
    const msg = await p;
    if (msg.type === 'command:ack') await this.waitFor(() => this.version >= msg.stateVersion);
    return msg;
  }

  close(): void {
    this.ws.close();
  }
}
