/**
 * Manual check for empty-room auto-close (not part of CI: it needs a short TTL).
 *
 *   echo ROOM_EMPTY_TTL_SECONDS=10 > apps/web/.dev.vars   # then restart `npm run dev`
 *   node apps/web/e2e/room-close-check.ts
 *
 * Expects: an emptied room disappears (404, D1 status 'archived') after the TTL,
 * while a room that still has a connected player stays open.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api, createGuest, ORIGIN, RoomClient } from './client.ts';

const TTL_S = Number(process.argv[2] ?? 10);
const WEB_DIR = fileURLToPath(new URL('..', import.meta.url));
const WRANGLER = join(dirname(createRequire(import.meta.url).resolve('wrangler')), '..', 'bin', 'wrangler.js');
const d1Status = (code: string): string | undefined => {
  const r = spawnSync(process.execPath, [WRANGLER, 'd1', 'execute', 'DB', '--local', '--json', '--command', `SELECT status FROM rooms WHERE code = '${code}'`], {
    cwd: WEB_DIR,
    encoding: 'utf8',
  });
  const start = r.stdout.indexOf('[');
  return start < 0 ? undefined : (JSON.parse(r.stdout.slice(start)) as { results: { status: string }[] }[])[0]?.results[0]?.status;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const makeRoom = async (name: string) => {
  const g = await createGuest(name);
  const res = await api('/rooms', { method: 'POST', body: { targetBoards: 1 }, cookie: g.cookie });
  const code = (res.json as { code: string }).code;
  const client = await RoomClient.connect(code, { Cookie: g.cookie, Origin: ORIGIN });
  return { g, code, client };
};

const emptied = await makeRoom('ว่าง');
const busy = await makeRoom('ยังอยู่');
emptied.client.close();
console.log(`waiting ${TTL_S + 8}s (TTL ${TTL_S}s)…`);
await sleep((TTL_S + 8) * 1000);

const gone = await api(`/rooms/${emptied.code}`, { cookie: emptied.g.cookie });
const stays = await api(`/rooms/${busy.code}`, { cookie: busy.g.cookie });
const results = {
  emptiedHttp: gone.status,
  emptiedD1: d1Status(emptied.code),
  occupiedHttp: stays.status,
  occupiedD1: d1Status(busy.code),
  occupiedSocketOpen: busy.client.closed === null,
};
console.log(results);
const pass = results.emptiedHttp === 404 && results.emptiedD1 === 'archived' && results.occupiedHttp === 200 && results.occupiedD1 === 'waiting' && results.occupiedSocketOpen;
console.log(pass ? 'PASS' : 'FAIL');
busy.client.close();
process.exit(pass ? 0 : 1);
