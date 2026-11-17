import type { MeResponse, RoomSummary } from '@bridge/shared';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const request = async <T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError('NETWORK', 0, 'network error');
  }
  const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!res.ok) {
    throw new ApiError(data?.error?.code ?? 'INTERNAL_ERROR', res.status, data?.error?.message ?? res.statusText);
  }
  return data as T;
};

export const api = {
  me: () => request<MeResponse>('/auth/me'),
  guest: (displayName: string) => request<MeResponse>('/auth/guest', { method: 'POST', body: { displayName } }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  createRoom: (targetBoards: number) => request<{ code: string }>('/rooms', { method: 'POST', body: { targetBoards } }),
  room: (code: string) => request<RoomSummary>(`/rooms/${encodeURIComponent(code)}`),
  join: (code: string) => request<{ ok: true; code: string }>(`/rooms/${encodeURIComponent(code)}/join`, { method: 'POST' }),
};

/** Extract a room code from raw input or an invite URL. */
export const parseRoomCode = (input: string): string | null => {
  const trimmed = input.trim();
  const fromUrl = /\/room\/([A-Za-z0-9]{8})(?:[/?#]|$)/.exec(trimmed)?.[1];
  const code = (fromUrl ?? trimmed).toUpperCase();
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/.test(code) ? code : null;
};
