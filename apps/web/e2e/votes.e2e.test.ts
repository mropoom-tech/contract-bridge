/**
 * e2e (against `npm run dev`): a disconnected player is replaced by the server
 * bot after a vote and the bot keeps the game moving; kick vote removes a
 * player from the waiting room and closes their socket.
 */
import { describe, expect, it } from 'vitest';
import { SEATS, type Seat } from '@bridge/game-engine';
import { api, createGuest, ORIGIN, RoomClient, type Guest } from './client';

const setup = async (start: boolean) => {
  const guests = {} as Record<Seat, Guest>;
  const clients = {} as Record<Seat, RoomClient>;
  for (const s of SEATS) guests[s] = await createGuest(`โหวต-${s}`);
  const code = (await api('/rooms', { method: 'POST', body: { targetBoards: 1 }, cookie: guests.N.cookie })).json.code as string;
  for (const s of ['E', 'S', 'W'] as const) await api(`/rooms/${code}/join`, { method: 'POST', cookie: guests[s].cookie });
  for (const s of SEATS) clients[s] = await RoomClient.connect(code, { Cookie: guests[s].cookie, Origin: ORIGIN });
  const sync = () => {
    const v = Math.max(...SEATS.filter((s) => clients[s].closed === null).map((s) => clients[s].version));
    return Promise.all(SEATS.filter((s) => clients[s].closed === null).map((s) => clients[s].waitFor(() => clients[s].version >= v)));
  };
  const act = async (seat: Seat, type: Parameters<RoomClient['command']>[0], payload: unknown) => {
    await sync();
    const m = await clients[seat].command(type, payload);
    if (m.type !== 'command:ack') throw new Error(`${seat} ${type} -> ${m.type === 'command:error' ? m.code : m.type}`);
  };
  for (const s of SEATS) {
    await act(s, 'room:claimSeat', { seat: s });
    await act(s, 'room:ready', { ready: true });
  }
  if (start) await act('N', 'room:start', {});
  return { guests, clients, code, act, sync };
};

describe('disconnected players: bot takeover and kick votes', () => {
  it('BOT vote: W drops, N+E vote, the bot plays W and readies for the next step', async () => {
    const { clients, act, guests, code } = await setup(true);
    clients.W.close();
    await clients.N.waitFor(() => clients.N.snapshot?.public.seats.W?.online === false);
    expect(clients.N.snapshot?.allowedActions.startVote).toContainEqual({ seat: 'W', kinds: ['BOT', 'KICK'] });
    await act('N', 'vote:start', { seat: 'W', kind: 'BOT' });
    await clients.E.waitFor(() => clients.E.snapshot?.public.vote !== null);
    const voteId = clients.E.snapshot?.public.vote?.id ?? '';
    expect(clients.E.snapshot?.allowedActions.castVote).toBe(true);
    await act('E', 'vote:cast', { voteId, yes: true });
    await clients.N.waitFor(() => clients.N.snapshot?.public.botSeats.W === true);
    // Dealer N; N, E, S pass. The bot (W) must pass by itself → passed out → board result.
    await act('N', 'auction:call', { kind: 'PASS' });
    await act('E', 'auction:call', { kind: 'PASS' });
    await act('S', 'auction:call', { kind: 'PASS' });
    await clients.N.waitFor(() => clients.N.snapshot?.public.phase === 'BOARD_RESULT', 8000);
    await clients.N.waitFor(() => clients.N.snapshot?.public.nextBoardReady?.W === true, 8000);
    // W returns and takes the seat back.
    const back = await RoomClient.connect(code, { Cookie: guests.W.cookie, Origin: ORIGIN });
    expect(back.snapshot?.allowedActions.reclaim).toBe(true);
    const r = await back.command('seat:reclaim', {});
    expect(r.type).toBe('command:ack');
    expect(back.snapshot?.public.botSeats.W).toBe(false);
    for (const s of ['N', 'E', 'S'] as const) clients[s].close();
    back.close();
  }, 30_000);

  it('KICK vote in the waiting room removes the player, closes their socket and blocks rejoin', async () => {
    const { clients, act, guests, code } = await setup(false);
    await act('N', 'vote:start', { seat: 'E', kind: 'KICK' });
    await clients.S.waitFor(() => clients.S.snapshot?.public.vote !== null);
    const voteId = clients.S.snapshot?.public.vote?.id ?? '';
    await act('S', 'vote:cast', { voteId, yes: true });
    await clients.E.waitFor(() => clients.E.closed !== null, 5000);
    expect(clients.E.closed?.code).toBe(4003);
    await clients.N.waitFor(() => clients.N.snapshot?.public.seats.E === null);
    const rejoin = await api(`/rooms/${code}/join`, { method: 'POST', cookie: guests.E.cookie });
    expect(rejoin.status).toBe(403);
    for (const s of ['N', 'S', 'W'] as const) clients[s].close();
  }, 30_000);
});
