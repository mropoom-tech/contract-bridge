/**
 * Room connection store. The server is authoritative: the client only holds the
 * latest seat-specific snapshot and at most one in-flight command.
 */
import { create } from 'zustand';
import {
  PROTOCOL_VERSION,
  type ClientCommandType,
  type SeatSpecificSnapshot,
  type ServerMessage,
} from '@bridge/shared';
import { announce } from '../lib/announce';
import { api, ApiError } from '../lib/api';

export type ConnStatus = 'idle' | 'joining' | 'connecting' | 'open' | 'reconnecting' | 'replaced' | 'fatal' | 'left';

export interface PendingCommand {
  readonly requestId: string;
  readonly frame: string;
  readonly type: ClientCommandType;
}

interface RoomStore {
  code: string | null;
  status: ConnStatus;
  /** True once a snapshot has arrived on the current socket. */
  synced: boolean;
  snapshot: SeatSpecificSnapshot | null;
  pending: PendingCommand | null;
  /** Last error code from the server or join step (localized in UI). */
  error: string | null;
  /** Latest accessible live-region text. */
  announcement: string;
  connect: (code: string) => void;
  disconnect: () => void;
  takeOver: () => void;
  /** Returns false if the command cannot be sent now (not synced or one already pending). */
  send: (type: Exclude<ClientCommandType, 'state:requestSnapshot'>, payload: unknown) => boolean;
  clearError: () => void;
}

let socket: WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
let manualClose = false;

const wsUrl = (code: string) =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms/${encodeURIComponent(code)}/ws`;

export const useRoom = create<RoomStore>((set, get) => {
  const clearRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };

  const closeSocket = () => {
    if (socket) {
      manualClose = true;
      socket.close();
      socket = null;
    }
  };

  const scheduleReconnect = () => {
    clearRetry();
    const delay = Math.min(10_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 300);
    attempt += 1;
    set({ status: 'reconnecting', synced: false });
    retryTimer = setTimeout(() => openSocket(), delay);
  };

  const sendSnapshotRequest = () => {
    socket?.send(
      JSON.stringify({ protocolVersion: PROTOCOL_VERSION, requestId: crypto.randomUUID(), type: 'state:requestSnapshot', payload: {} }),
    );
  };

  const onMessage = (msg: ServerMessage) => {
    switch (msg.type) {
      case 'session:snapshot': {
        const firstOnSocket = !get().synced;
        const said = announce(get().snapshot, msg.snapshot);
        set({ snapshot: msg.snapshot, synced: true, status: 'open', ...(said ? { announcement: said } : {}) });
        attempt = 0;
        // After a reconnect, resend an unacknowledged command with the SAME requestId:
        // the server either replays the original ack or reports STALE_VERSION.
        const p = get().pending;
        if (firstOnSocket && p) socket?.send(p.frame);
        return;
      }
      case 'session:replaced':
        clearRetry();
        closeSocket();
        set({ status: 'replaced', synced: false, pending: null });
        return;
      case 'command:ack': {
        const p = get().pending;
        if (p?.requestId !== msg.requestId) return;
        if (p.type === 'room:leave') {
          clearRetry();
          closeSocket();
          set({ pending: null, status: 'left', synced: false });
        } else set({ pending: null });
        return;
      }
      case 'command:error': {
        const mine = msg.requestId !== null && get().pending?.requestId === msg.requestId;
        set({ error: msg.code, ...(mine ? { pending: null } : {}) });
        if (msg.code === 'STALE_VERSION') sendSnapshotRequest();
        return;
      }
    }
  };

  const openSocket = () => {
    const code = get().code;
    if (!code) return;
    closeSocket();
    manualClose = false;
    set({ status: attempt === 0 ? 'connecting' : 'reconnecting', synced: false });
    const ws = new WebSocket(wsUrl(code));
    socket = ws;
    ws.addEventListener('message', (ev) => {
      if (socket !== ws) return;
      try {
        onMessage(JSON.parse(String(ev.data)) as ServerMessage);
      } catch {
        /* ignore malformed server frame */
      }
    });
    ws.addEventListener('close', (ev) => {
      if (socket !== ws) return;
      socket = null;
      const st = get().status;
      if (manualClose || st === 'replaced' || st === 'fatal' || st === 'left') return;
      if (ev.code === 4001) {
        set({ status: 'replaced', synced: false });
        return;
      }
      if (ev.code === 4003) {
        set({ status: 'fatal', synced: false, error: 'FORBIDDEN' });
        return;
      }
      scheduleReconnect();
    });
  };

  return {
    code: null,
    status: 'idle',
    synced: false,
    snapshot: null,
    pending: null,
    error: null,
    announcement: '',

    connect: (code) => {
      if (get().code === code && get().status !== 'idle' && get().status !== 'fatal') return;
      clearRetry();
      closeSocket();
      attempt = 0;
      set({ code, status: 'joining', synced: false, snapshot: null, pending: null, error: null });
      // Joining is idempotent for existing members; it never claims a seat.
      api
        .join(code)
        .then(() => {
          if (get().code === code) openSocket();
        })
        .catch((e: unknown) => {
          if (get().code !== code) return;
          const errCode = e instanceof ApiError ? e.code : 'INTERNAL_ERROR';
          if (errCode === 'NETWORK') scheduleReconnect();
          else set({ status: 'fatal', error: errCode });
        });
    },

    disconnect: () => {
      clearRetry();
      closeSocket();
      set({ code: null, status: 'idle', synced: false, snapshot: null, pending: null, error: null });
    },

    takeOver: () => {
      attempt = 0;
      openSocket();
    },

    send: (type, payload) => {
      const { synced, pending, snapshot, status } = get();
      if (status !== 'open' || !synced || pending || !snapshot || !socket) return false;
      const requestId = crypto.randomUUID();
      const frame = JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        requestId,
        expectedVersion: snapshot.public.version,
        type,
        payload,
      });
      set({ pending: { requestId, frame, type }, error: null });
      socket.send(frame);
      return true;
    },

    clearError: () => set({ error: null }),
  };
});
