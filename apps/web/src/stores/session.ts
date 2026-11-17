import { create } from 'zustand';
import { api, ApiError } from '../lib/api';

export type SessionStatus = 'unknown' | 'loading' | 'anonymous' | 'authenticated' | 'error';

interface SessionState {
  status: SessionStatus;
  user: { id: string; displayName: string } | null;
  load: () => Promise<void>;
  login: (displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'unknown',
  user: null,
  load: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading' });
    try {
      const me = await api.me();
      set({ status: 'authenticated', user: me.user });
    } catch (e) {
      set({ status: e instanceof ApiError && e.status === 401 ? 'anonymous' : 'error', user: null });
    }
  },
  login: async (displayName) => {
    const me = await api.guest(displayName);
    set({ status: 'authenticated', user: me.user });
  },
  logout: async () => {
    await api.logout().catch(() => undefined);
    set({ status: 'anonymous', user: null });
  },
}));
