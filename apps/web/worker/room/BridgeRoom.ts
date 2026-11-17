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
  applyBotStep,
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
import { archiveRoomStatements, nextAlarmAt, parseTtlSeconds, shouldCloseRoom } from './room-lifecycle';

const STATE_KEY = 'room:state';
const SYNC_ATTEMPT_KEY = 'room:sync-attempt';
const RETRY_AT_KEY = 'room:outbox-retry-at';
const EMPTY_SINCE_KEY = 'room:empty-since';
const BOT_DUE_KEY = 'room:bot-due';
const ARCHIVE_RETRY_MS = 60_000;
/** Pause between bot moves so humans can follow them. */
const BOT_DELAY_MS = 700;
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
      if (!this.room) return;
      if (this.room.pendingWrites.length > 0 && (await ctx.storage.get<number>(RETRY_AT_KEY)) === undefined) {
        await ctx.storage.put(RETRY_AT_KEY, Date.now() + retryDelayMs(0));
      }
      // Rooms created before auto-close existed (or woken with nobody connected) start their empty timer now.
      if (ctx.getWebSockets().length === 0 && (await ctx.storage.get<number>(EMPTY_SINCE_KEY)) === undefined) {
        await ctx.storage.put(EMPTY_SINCE_KEY, Date.now());
      }
      await this.scheduleAlarm();
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
      await this.ctx.storage.put(RETRY_AT_KEY, Date.now() + retryDelayMs(0));
      await this.scheduleAlarm();
      const result = await flushWrites(d1Store(this.env.DB), writes);
      for (const id of result.conflicts) {
        console.error('d1_result_conflict', { roomId: this.room?.roomId, writeId: id });
      }
      if (result.done.size > 0 && this.room) await this.save(acknowledgeWrites(this.room, result.done));
      if (result.error) {
        const attempt = ((await this.ctx.storage.get<number>(SYNC_ATTEMPT_KEY)) ?? 0) + 1;
        await this.ctx.storage.put(SYNC_ATTEMPT_KEY, attempt);
        await this.ctx.storage.put(RETRY_AT_KEY, Date.now() + retryDelayMs(attempt));
        console.error('d1_sync_failed', { roomId: this.room?.roomId, attempt, name: (result.error as Error)?.name });
      } else {
        await this.ctx.storage.delete(SYNC_ATTEMPT_KEY);
        if ((this.room?.pendingWrites.length ?? 0) === 0) await this.ctx.storage.delete(RETRY_AT_KEY);
      }
      await this.scheduleAlarm();
    };
    this.flushing = run().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  // ---------- alarm: outbox retry + empty-room auto-close ----------

  private async lifecycleInput() {
    return {
      now: Date.now(),
      emptySince: (await this.ctx.storage.get<number>(EMPTY_SINCE_KEY)) ?? null,
      openConnections: this.openSockets().length,
      pendingWrites: this.room?.pendingWrites.length ?? 0,
      outboxRetryAt: (await this.ctx.storage.get<number>(RETRY_AT_KEY)) ?? null,
      ttlMs: parseTtlSeconds(this.env.ROOM_EMPTY_TTL_SECONDS),
    };
  }

  /** One alarm serves both the outbox retry and the empty-room deadline. */
  private async scheduleAlarm(): Promise<void> {
    if (!this.room) return;
    const lifecycleAt = nextAlarmAt(await this.lifecycleInput());
    const botDue = (await this.ctx.storage.get<number>(BOT_DUE_KEY)) ?? null;
    const times = [lifecycleAt, botDue].filter((x): x is number => x !== null);
    const at = times.length === 0 ? null : Math.min(...times);
    if (at === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(at);
  }

  private async markEmptyIfNobodyLeft(exclude?: WebSocket): Promise<void> {
    if (!this.room || this.openSockets(exclude).length > 0) return;
    if ((await this.ctx.storage.get<number>(EMPTY_SINCE_KEY)) === undefined) await this.ctx.storage.put(EMPTY_SINCE_KEY, Date.now());
    await this.scheduleAlarm();
  }

  override async alarm(): Promise<void> {
    if (!this.room) return;
    const botDue = await this.ctx.storage.get<number>(BOT_DUE_KEY);
    if (botDue !== undefined && botDue <= Date.now()) {
      await this.ctx.storage.delete(BOT_DUE_KEY);
      await this.botStep();
    }
    if (this.room.pendingWrites.length > 0) await this.flushOutbox();
    if (shouldCloseRoom(await this.lifecycleInput())) await this.closeRoom();
    else await this.scheduleAlarm();
  }

  /** Archive in D1, then delete all DO storage. Results were already flushed (checked by shouldCloseRoom). */
  private async closeRoom(): Promise<void> {
    const room = this.room;
    if (!room) return;
    try {
      const nowIso = new Date().toISOString();
      await this.env.DB.batch(archiveRoomStatements(room.roomId, nowIso).map((st) => this.env.DB.prepare(st.sql).bind(...st.params)));
    } catch (e) {
      console.error('room_archive_failed', { roomId: room.roomId, name: (e as Error).name });
      await this.ctx.storage.setAlarm(Date.now() + ARCHIVE_RETRY_MS);
      return;
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.room = null;
    console.log('room_closed', { roomId: room.roomId, reason: 'empty' });
  }

  private async save(next: RoomState): Promise<void> {
    await this.ctx.storage.put(STATE_KEY, next);
    this.room = next;
  }

  // ---------- RPC (called only by our Worker) ----------

  async initialize(init: RoomInit): Promise<boolean> {
    if (this.room) return false;
    await this.save(createRoomState(init));
    // Nobody is connected yet: the creator must open the room before the empty timer runs out.
    await this.ctx.storage.put(EMPTY_SINCE_KEY, Date.now());
    await this.scheduleAlarm();
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
    await this.ctx.storage.delete(EMPTY_SINCE_KEY);
    await this.scheduleAlarm();
    const online = this.onlineUsers();
    online.add(userId);
    this.sendSnapshot(server, userId, online);
    this.broadcastSnapshots(server);
    void this.driveBots(); // resume bots after hibernation/eviction
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

    const outcome = handleCommand(room, userId, cmd, this.deps());
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
    if (res.status === 'accepted') {
      this.closeRemovedMembers();
      void this.driveBots();
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
    this.broadcastSnapshots(ws);
    await this.markEmptyIfNobodyLeft(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.broadcastSnapshots(ws);
    await this.markEmptyIfNobodyLeft(ws);
  }

  // ---------- bots ----------

  private deps() {
    return {
      rng: this.rng,
      newId: () => crypto.randomUUID(),
      now: () => new Date().toISOString(),
      online: this.onlineUsers(),
    };
  }

  /** Disconnect anyone who is no longer a member (removed by vote). */
  private closeRemovedMembers(): void {
    const room = this.room;
    if (!room) return;
    for (const s of this.ctx.getWebSockets()) {
      const a = s.deserializeAttachment() as Attachment | null;
      if (a && !isMember(room, a.userId)) {
        try {
          s.close(CLOSE_REMOVED, 'Removed from the room');
        } catch {
          /* already closing */
        }
      }
    }
  }

  /**
   * If a bot-played seat must act, schedule its move via the DO alarm (durable:
   * survives hibernation/eviction, unlike in-memory timers).
   */
  private async driveBots(): Promise<void> {
    const room = this.room;
    if (!room || applyBotStep(room, this.deps()) === null) return;
    if ((await this.ctx.storage.get<number>(BOT_DUE_KEY)) !== undefined) return;
    await this.ctx.storage.put(BOT_DUE_KEY, Date.now() + BOT_DELAY_MS);
    await this.scheduleAlarm();
  }

  private async botStep(): Promise<void> {
    const room = this.room;
    if (!room) return;
    try {
      const next = applyBotStep(room, this.deps());
      if (!next) return;
      await this.save(next);
      this.broadcastSnapshots();
      if (next.pendingWrites.length > room.pendingWrites.length) void this.flushOutbox();
    } catch (e) {
      console.error('bot_step_failed', { roomId: room.roomId, name: (e as Error).name });
    }
    await this.driveBots();
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
