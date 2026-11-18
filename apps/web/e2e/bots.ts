/**
 * Dev helper: fill empty seats of a room with simple bots so a human can play
 * a full board locally. Bots pass in the auction, play their first legal card,
 * and ready up for the next board.
 *
 *   node apps/web/e2e/bots.ts <ROOMCODE> [count=3] [--open]
 *
 * --open: bot 1 opens 1NT when nobody has bid yet (to reach a declarer/dummy
 * layout where the human defends).
 *
 * Requires `npm run dev`. Not part of the product; local testing only.
 */
import { createGuest, ORIGIN, RoomClient, api } from './client.ts';

const code = (process.argv[2] ?? '').toUpperCase();
const count = Number(process.argv[3] ?? 3);
const openBid = process.argv.includes('--open');
if (!/^[A-Z2-9]{8}$/.test(code)) {
  console.error('usage: node apps/web/e2e/bots.ts <ROOMCODE> [count]');
  process.exit(1);
}

const runBot = async (i: number) => {
  const guest = await createGuest(`บอท ${i}`);
  const j = await api(`/rooms/${code}/join`, { method: 'POST', cookie: guest.cookie });
  if (j.status !== 200) throw new Error(`bot ${i} join failed: ${JSON.stringify(j.json)}`);
  const client = await RoomClient.connect(code, { Cookie: guest.cookie, Origin: ORIGIN });
  let busy = false;

  const tick = async () => {
    const snap = client.snapshot;
    if (busy || !snap) return;
    const a = snap.allowedActions;
    const pub = snap.public;
    let cmd: [Parameters<RoomClient['command']>[0], unknown] | null = null;
    if (pub.phase === 'WAITING') {
      if (!snap.you.seat && a.claimSeat[0]) cmd = ['room:claimSeat', { seat: a.claimSeat[0] }];
      else if (snap.you.seat && !pub.seats[snap.you.seat]?.ready) cmd = ['room:ready', { ready: true }];
    } else if (a.miniChoices.length > 0) cmd = ['mini:declare', { strain: 'NT', game: false }];
    else if (a.calls.length > 0) {
      const noBidYet = pub.auctionHistory.every((h) => h.call.kind !== 'BID');
      cmd = ['auction:call', openBid && i === 1 && noBidYet ? { kind: 'BID', level: 1, strain: 'NT' } : { kind: 'PASS' }];
    }
    else if (a.play) cmd = ['card:play', { fromSeat: a.play.fromSeat, card: a.play.cards[0] }];
    else if (a.readyNext && snap.you.seat && !pub.nextBoardReady?.[snap.you.seat]) cmd = ['board:readyNext', { ready: true }];
    if (!cmd) return;
    busy = true;
    await new Promise((r) => setTimeout(r, 400)); // human-ish pacing
    const res = await client.command(cmd[0], cmd[1]).catch(() => null);
    busy = false;
    if (res?.type === 'command:error' && res.code !== 'STALE_VERSION') console.log(`bot ${i}: ${res.code}`);
    void tick();
  };

  setInterval(() => void tick(), 300);
  console.log(`bot ${i} connected`);
};

for (let i = 1; i <= count; i++) await runBot(i);
