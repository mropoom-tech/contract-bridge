import { describe, expect, it } from 'vitest';
import {
  callFromPayload,
  ClientCommandSchema,
  DisplayNameSchema,
  payloadFromCall,
  RoomCodeSchema,
} from '../src/index.js';

const rid = '9d75cde9-7d59-4bde-b99b-edf7d75ac6d9';
const ok = (v: unknown) => ClientCommandSchema.safeParse(v).success;

describe('ClientCommandSchema', () => {
  it('accepts the documented example', () => {
    expect(ok({ protocolVersion: 1, requestId: rid, expectedVersion: 12, type: 'auction:call', payload: { kind: 'BID', level: 1, strain: 'S' } })).toBe(true);
    expect(ok({ protocolVersion: 1, requestId: rid, type: 'state:requestSnapshot', payload: {} })).toBe(true);
  });

  it('rejects bad versions, ids, enums, extra fields and missing expectedVersion', () => {
    const base = { protocolVersion: 1, requestId: rid, expectedVersion: 1 };
    expect(ok({ ...base, protocolVersion: 2, type: 'room:start', payload: {} })).toBe(false);
    expect(ok({ ...base, requestId: 'abc', type: 'room:start', payload: {} })).toBe(false);
    expect(ok({ protocolVersion: 1, requestId: rid, type: 'room:start', payload: {} })).toBe(false);
    expect(ok({ ...base, expectedVersion: -1, type: 'room:start', payload: {} })).toBe(false);
    expect(ok({ ...base, type: 'room:start', payload: { force: true } })).toBe(false);
    expect(ok({ ...base, type: 'room:start', payload: {}, userId: 'someone' })).toBe(false);
    expect(ok({ ...base, type: 'auction:call', payload: { kind: 'BID', level: 8, strain: 'S' } })).toBe(false);
    expect(ok({ ...base, type: 'auction:call', payload: { kind: 'BID', level: 1, strain: 'X' } })).toBe(false);
    expect(ok({ ...base, type: 'card:play', payload: { fromSeat: 'Q', card: 'AS' } })).toBe(false);
    expect(ok({ ...base, type: 'card:play', payload: { fromSeat: 'N', card: '10S' } })).toBe(false);
    expect(ok({ ...base, type: 'room:claimSeat', payload: { seat: 'N' } })).toBe(true);
    expect(ok({ ...base, type: 'nope', payload: {} })).toBe(false);
  });
});

describe('call payload mapping', () => {
  it('round-trips every call kind', () => {
    for (const p of [{ kind: 'PASS' }, { kind: 'DOUBLE' }, { kind: 'REDOUBLE' }, { kind: 'BID', level: 3, strain: 'NT' }] as const) {
      expect(payloadFromCall(callFromPayload(p))).toEqual(p);
    }
  });
});

describe('REST schemas', () => {
  it('display names are trimmed plain text, 1-24 chars', () => {
    expect(DisplayNameSchema.parse('  สมชาย  ')).toBe('สมชาย');
    expect(DisplayNameSchema.safeParse('').success).toBe(false);
    expect(DisplayNameSchema.safeParse('a'.repeat(25)).success).toBe(false);
    expect(DisplayNameSchema.safeParse('<b>hi</b>').success).toBe(false);
    expect(DisplayNameSchema.safeParse('tab\there').success).toBe(false);
  });
  it('room codes use the unambiguous alphabet', () => {
    expect(RoomCodeSchema.safeParse('ABCDEFGH').success).toBe(true);
    expect(RoomCodeSchema.safeParse('ABCDEFG0').success).toBe(false);
    expect(RoomCodeSchema.safeParse('abcdefgh').success).toBe(false);
  });
});
