import { describe, expect, it } from 'vitest';
import type { SeatSpecificSnapshot } from '@bridge/shared';
import { announce } from './announce';
import { parseRoomCode } from './api';
import { callText, cardLabel, contractText, groupBySuit, positionOfSeat, seatAtPosition } from './cards';
import { parseRoute, safeNext } from './router';
import { isValidNickname } from './validation';

describe('router', () => {
  it('parses known routes', () => {
    expect(parseRoute('/', '')).toEqual({ name: 'landing' });
    expect(parseRoute('/lobby', '')).toEqual({ name: 'lobby' });
    expect(parseRoute('/room/abcd2345', '')).toEqual({ name: 'room', code: 'ABCD2345' });
    expect(parseRoute('/play', '?next=%2Froom%2FABCD2345')).toEqual({ name: 'play', next: '/room/ABCD2345' });
    expect(parseRoute('/room/short', '')).toEqual({ name: 'notFound' });
    expect(parseRoute('/nope', '')).toEqual({ name: 'notFound' });
  });
  it('rejects open redirects', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/room/ABCD2345/../x', 'javascript:alert(1)', null]) {
      expect(safeNext(bad)).toBeNull();
    }
    expect(safeNext('/lobby')).toBe('/lobby');
  });
});

describe('room code input', () => {
  it('accepts codes and invite URLs, rejects ambiguous characters', () => {
    expect(parseRoomCode(' abcd2345 ')).toBe('ABCD2345');
    expect(parseRoomCode('https://bridge.example/room/ABCD2345')).toBe('ABCD2345');
    expect(parseRoomCode('http://localhost:5173/room/abcd2345?x=1')).toBe('ABCD2345');
    expect(parseRoomCode('ABCD0OIL')).toBeNull();
    expect(parseRoomCode('ABC')).toBeNull();
  });
});

describe('nickname validation', () => {
  it('2-24 code points, no angle brackets', () => {
    expect(isValidNickname('ก')).toBe(false);
    expect(isValidNickname('  สมชาย ')).toBe(true);
    expect(isValidNickname('a'.repeat(25))).toBe(false);
    expect(isValidNickname('<b>')).toBe(false);
  });
});

describe('cards and seats', () => {
  it('labels cards in Thai', () => {
    expect(cardLabel('AS')).toBe('เอซโพดำ');
    expect(cardLabel('TD')).toBe('สิบข้าวหลามตัด');
  });
  it('rotates the table so self is at the bottom', () => {
    expect(['bottom', 'left', 'top', 'right'].map((p) => seatAtPosition('S', p as 'bottom'))).toEqual(['S', 'W', 'N', 'E']);
    expect(['bottom', 'left', 'top', 'right'].map((p) => seatAtPosition('E', p as 'bottom'))).toEqual(['E', 'S', 'W', 'N']);
    expect(positionOfSeat('N', 'S')).toBe('top');
    expect(positionOfSeat('W', 'N')).toBe('left');
  });
  it('formats calls and contracts', () => {
    expect(callText({ kind: 'BID', level: 3, strain: 'NT' })).toBe('3NT');
    expect(callText({ kind: 'DOUBLE' })).toBe('X');
    expect(contractText({ level: 4, strain: 'S', doubled: 2 })).toBe('4♠ XX');
  });
  it('groups a hand by suit in S,H,D,C order', () => {
    expect(groupBySuit(['2C', 'AS', 'KH']).map((g) => g.suit)).toEqual(['S', 'H', 'C']);
  });
});

const snap = (over: Partial<SeatSpecificSnapshot['public']>, actions: Partial<SeatSpecificSnapshot['allowedActions']> = {}, seat: 'S' | 'N' = 'S'): SeatSpecificSnapshot =>
  ({
    public: {
      roomCode: 'ABCD2345', phase: 'BIDDING', version: 1, targetBoards: 1,
      seats: { N: null, E: null, S: null, W: null }, lobby: [], boardNumber: 1, dealer: 'N', vulnerability: 'NONE',
      turnSeat: 'N', controllerSeat: 'N', auctionHistory: [], contract: null, dummySeat: null, dummyCards: null,
      cardCounts: null, currentTrick: [], completedTricks: [], result: null, completedBoards: [], totalNsScore: 0, nextBoardReady: null,
      ...over,
    },
    you: { userId: 'u', displayName: 'u', seat, isHost: false, yourHand: [] },
    allowedActions: { claimSeat: [], ready: false, start: false, leave: false, calls: [], play: null, readyNext: false, ...actions },
  }) as SeatSpecificSnapshot;

describe('announcements', () => {
  it('announces my turn, contract and trick winner', () => {
    expect(announce(snap({}), snap({}, { calls: [{ kind: 'PASS' }] }))).toBe('ถึงตาคุณแล้ว');
    const contract = { level: 4, strain: 'S', doubled: 0, declarer: 'N', dummy: 'S', openingLeader: 'E' } as const;
    expect(announce(snap({}), snap({ phase: 'PLAYING', contract }))).toContain('4♠');
    const trick = { leader: 'E', winner: 'W', cards: [] } as const;
    expect(announce(snap({ phase: 'PLAYING', contract }), snap({ phase: 'PLAYING', contract, completedTricks: [trick] }))).toContain('ตะวันตก');
    expect(announce(snap({}), snap({}))).toBeNull();
  });
  it('distinguishes playing from dummy', () => {
    expect(announce(snap({}), snap({}, { play: { fromSeat: 'S', cards: ['2C'] } }, 'N'))).toBe('ถึงตาคุณ — กำลังเล่นจากไพ่ Dummy');
  });
});
