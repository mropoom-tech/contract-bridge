import { useSyncExternalStore } from 'react';

export type Route =
  | { readonly name: 'landing' }
  | { readonly name: 'play'; readonly next: string | null }
  | { readonly name: 'lobby' }
  | { readonly name: 'room'; readonly code: string }
  | { readonly name: 'learn' }
  | { readonly name: 'lesson'; readonly id: string }
  | { readonly name: 'scoring' }
  | { readonly name: 'notFound' };

/** Only same-app relative paths are accepted as post-login redirects (no open redirect). */
export const safeNext = (next: string | null): string | null =>
  next && /^\/(lobby|room\/[A-Za-z0-9]{8})$/.test(next) ? next : null;

export const parseRoute = (pathname: string, search: string): Route => {
  if (pathname === '/' || pathname === '') return { name: 'landing' };
  if (pathname === '/play') return { name: 'play', next: safeNext(new URLSearchParams(search).get('next')) };
  if (pathname === '/lobby') return { name: 'lobby' };
  if (pathname === '/learn' || pathname === '/learn/') return { name: 'learn' };
  if (pathname === '/learn/scoring') return { name: 'scoring' };
  const lesson = /^\/learn\/([a-z0-9-]{1,32})\/?$/.exec(pathname);
  if (lesson?.[1]) return { name: 'lesson', id: lesson[1] };
  const m = /^\/room\/([A-Za-z0-9]{8})\/?$/.exec(pathname);
  if (m?.[1]) return { name: 'room', code: m[1].toUpperCase() };
  return { name: 'notFound' };
};

const EVENT = 'app:navigate';

export const navigate = (path: string, opts: { replace?: boolean } = {}): void => {
  if (opts.replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  window.dispatchEvent(new Event(EVENT));
};

const subscribe = (cb: () => void) => {
  window.addEventListener('popstate', cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener(EVENT, cb);
  };
};

const getLocation = () => `${location.pathname}${location.search}`;

export const useRoute = (): Route => {
  const loc = useSyncExternalStore(subscribe, getLocation);
  const url = new URL(loc, 'http://x');
  return parseRoute(url.pathname, url.search);
};
