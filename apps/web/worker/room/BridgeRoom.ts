import { DurableObject } from 'cloudflare:workers';
import { createCryptoRandom } from '@bridge/game-engine';
import {
  ClientCommandSchema,
  MAX_FRAME_LENGTH,
  PROTOCOL_VERSION,
  type ErrorCode,
  type RoomSummary,
  type ServerMessage,
} from '@bridge/shared';
import { projectRoomForUser } from './room-projection';
import { d1Store } from './d1-store';
import { flushWrites, retryDelayMs } from './result-sync';
import {
  acknowledgeWrites,
  createRoomState,
  handleCommand,
  isMember,
  joinRoom,
  migrateRoomState,
  type Member,
  type RoomError,
  type RoomInit,
  type RoomState,
} from './room-state';

import { INTERNAL_USER_HEADER } from './internal';

const STATE_KEY = 'room:state';
const SYNC_ATTEMPT_KEY = 'room:sync-attempt';
const CLOSE_REPLACED = 4001;
const CLOSE_REMOVED = 4003;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_FRAMES = 60;

interface Attachment {
  readonly userId: string;
}

export class BridgeRoom extends DurableObject<Env> {
  private room: RoomState | null = null;
  private readonly rng = createCryptoRandom(crypto);
  /** In-memory frame counters; reset on hibernation, which is acceptable. */
  private readonly rate = new WeakMap<WebSocket, { start: number; count: number }>();
  private flushing: Promise<void> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      const raw = await ctx.storage.get<unknown>(STATE_KEY);
      // Restore after eviction/hibernation/deploy; upgrade older snapshot schemas.
      this.room = raw === undefined ? null : migrateRoomState(raw);
      if (this.room && this.room.pendingWrites.length > 0 && (await ctx.storage.getAlarm()) === null) {
        await ctx.storage.setAlarm(Date.now() + retryDelayMs(0));
      }
    });
  }

  // ---------- D1 outbox ----------

  /** Flush pending D1 summary writes once at a time; on failure retry via alarm with backoff. */
  private flushOutbox(): Promise<void> {
    if (this.flushing) return this.flushing;
    const run = async () => {
      const writes = this.room?.pendingWrites ?? [];
      if (writes.length === 0) return;
      // Safety net first: if this isolate dies mid-flush the alarm still retries.
      if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + retryDelayMs(0));
      const result = await flushWrites(d1Store(this.env.DB), writes);
      for (const id of result.conflicts) {
        console.error('d1_result_conflict', { roomId: this.room?.roomId, writeId: id });
      }
      if (result.done.size > 0 && this.room) await this.save(acknowledgeWrites(this.room, result.done));
      if (result.error) {
        const attempt = ((await this.ctx.storage.get<number>(SYNC_ATTEMPT_KEY)) ?? 0) + 1;
        await this.ctx.storage.put(SYNC_ATTEMPT_KEY, attempt);
        await this.ctx.storage.setAlarm(Date.now() + retryDelayMs(attempt));
        console.error('d1_sync_failed', { roomId: this.room?.roomId, attempt, name: (result.error as Error)?.name });
      } else {
        await this.ctx.storage.delete(SYNC_ATTEMPT_KEY);
        if ((this.room?.pendingWrites.length ?? 0) === 0) await this.ctx.storage.deleteAlarm();
      }
    };
    this.flushing = run().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  override async alarm(): Promise<void> {
    await this.flushOutbox();
  }

  private async save(next: RoomState): Promise<void> {
    await this.ctx.storage.put(STATE_KEY, next);
    this.room = next;
  }

  // ---------- RPC (called only by our Worker) ----------

  async initialize(init: RoomInit): Promise<boolean> {
    if (this.room) return false;
    await this.save(createRoomState(init));
    return true;
  }

  async summary(userId: string): Promise<RoomSummary | null> {
    const r = this.room;
    if (!r) return null;
    return {
      code: r.code,
      phase: r.phase,
      targetBoards: r.targetBoards,
      memberCount: r.members.length,
      seatsTaken: Object.values(r.seats).filter(Boolean).length,
      isMember: isMember(r, userId),
    };
  }

  async join(member: Member): Promise<{ ok: true } | { ok: false; error: RoomError }> {
    if (!this.room) return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'Room not found.' } };
    const r = joinRoom(this.room, member);
    if (!r.ok) return r;
    if (r.changed) {
      await this.save(r.state);
      this.broadcastSnapshots();
    }
    return { ok: true };
  }

  // ---------- WebSocket ----------

  override async fetch(request: Request): Promise<Response> {
    const userId = request.headers.get(INTERNAL_USER_HEADER);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    if (!this.room) return new Response('Room not found', { status: 404 });
    if (!userId || !isMember(this.room, userId)) return new Response('Forbidden', { status: 403 });

    const previous = this.ctx.getWebSockets(userId);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [userId]);
    server.serializeAttachment({ userId } satisfies Attachment);

    // One active connection per user: newest wins, older tabs are told why.
    // An explicit message first: a server close() issued from fetch() is not always
    // delivered promptly through the local dev proxy, so clients must not rely on it alone.
    for (const old of previous) {
      this.send(old, { protocolVersion: PROTOCOL_VERSION, type: 'session:replaced' });
      try {
        old.close(CLOSE_REPLACED, 'Replaced by a newer connection');
      } catch {
        /* already closing */
      }
    }
    const online = this.onlineUsers();
    online.add(userId);
    this.sendSnapshot(server, userId, online);
    this.broadcastSnapshots(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const room = this.room;
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!room || !att) {
      ws.close(1011, 'Room unavailable');
      return;
    }
    const { userId } = att;
    if (!isMember(room, userId)) {
      ws.close(CLOSE_REMOVED, 'Not a member');
      return;
    }
    if (!this.allowFrame(ws)) {
      this.sendError(ws, null, 'RATE_LIMITED', 'Too many messages.');
      return;
    }
    if (typeof message !== 'string' || message.length > MAX_FRAME_LENGTH) {
      this.sendError(ws, null, 'INVALID_PAYLOAD', 'Frame must be JSON text under the size limit.');
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(message);
    } catch {
      this.sendError(ws, null, 'INVALID_PAYLOAD', 'Malformed JSON.');
      return;
    }
    const parsed = ClientCommandSchema.safeParse(raw);
    if (!parsed.success) {
      const rid = typeof (raw as { requestId?: unknown })?.requestId === 'string' ? (raw as { requestId: string }).requestId : null;
      this.sendError(ws, rid && rid.length <= 64 ? rid : null, 'INVALID_PAYLOAD', 'Command failed validation.');
      return;
    }
    const cmd = parsed.data;
    if (cmd.type === 'state:requestSnapshot') {
      this.sendSnapshot(ws, userId);
      return;
    }

    const outcome = handleCommand(room, userId, cmd, {
      rng: this.rng,
      newId: () => crypto.randomUUID(),
      now: () => new Date().toISOString(),
    });
    if (outcome.persist) {
      try {
        await this.save(outcome.state); // persist state + dedup record before ack
      } catch (e) {
        console.error('room_persist_failed', { roomId: room.roomId, type: cmd.type, name: (e as Error).name });
        this.sendError(ws, cmd.requestId, 'INTERNAL_ERROR', 'Could not save; please retry.');
        return;
      }
    }
    const res = outcome.response;
    this.send(
      ws,
      res.status === 'accepted'
        ? { protocolVersion: PROTOCOL_VERSION, type: 'command:ack', requestId: cmd.requestId, stateVersion: res.stateVersion, status: 'accepted' }
        : { protocolVersion: PROTOCOL_VERSION, type: 'command:error', requestId: cmd.requestId, stateVersion: res.stateVersion, code: res.code, message: res.message },
    );
    if (outcome.broadcast) this.broadcastSnapshots();
    if (outcome.state.pendingWrites.length > room.pendingWrites.length) void this.flushOutbox();
    if (cmd.type === 'room:leave' && res.status === 'accepted') {
      for (const s of this.ctx.getWebSockets(userId)) s.close(CLOSE_REMOVED, 'Left the room');
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
    this.broadcastSnapshots(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.broadcastSnapshots(ws);
  }

  // ---------- helpers ----------

  private allowFrame(ws: WebSocket): boolean {
    const now = Date.now();
    const r = this.rate.get(ws);
    if (!r || now - r.start > RATE_WINDOW_MS) {
      this.rate.set(ws, { start: now, count: 1 });
      return true;
    }
    r.count += 1;
    return r.count <= RATE_MAX_FRAMES;
  }

  private openSockets(exclude?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((s) => s !== exclude && s.readyState === WebSocket.OPEN);
  }

  private onlineUsers(exclude?: WebSocket): Set<string> {
    const set = new Set<string>();
    for (const s of this.openSockets(exclude)) {
      const a = s.deserializeAttachment() as Attachment | null;
      if (a) set.add(a.userId);
    }
    return set;
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket closing; client will resync on reconnect */
    }
  }

  private sendError(ws: WebSocket, requestId: string | null, code: ErrorCode, message: string): void {
    this.send(ws, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'command:error',
      requestId,
      stateVersion: this.room?.version ?? 0,
      code,
      message,
    });
  }

  private sendSnapshot(ws: WebSocket, userId: string, online = this.onlineUsers()): void {
    const room = this.room;
    if (!room) return;
    this.send(ws, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'session:snapshot',
      stateVersion: room.version,
      snapshot: projectRoomForUser(room, userId, online),
    });
  }

  /** Each socket receives its OWN seat-specific projection; never a shared payload. */
  private broadcastSnapshots(exclude?: WebSocket): void {
    const online = this.onlineUsers(exclude);
    for (const s of this.openSockets(exclude)) {
      const a = s.deserializeAttachment() as Attachment | null;
      if (a) this.sendSnapshot(s, a.userId, online);
    }
  }
}
