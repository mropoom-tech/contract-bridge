import { describe, expect, it } from 'vitest';
import { EMPTY_ROOM_TTL_MS as TTL, nextAlarmAt, parseTtlSeconds, shouldCloseRoom, type LifecycleInput } from './room-lifecycle';

const base: LifecycleInput = { now: 1_000_000, emptySince: null, openConnections: 0, pendingWrites: 0, outboxRetryAt: null };

describe('empty room lifecycle', () => {
  it('does not close or schedule while someone is connected', () => {
    const i = { ...base, emptySince: base.now - 2 * TTL, openConnections: 1 };
    expect(shouldCloseRoom(i)).toBe(false);
    expect(nextAlarmAt(i)).toBeNull();
  });

  it('schedules the close at emptySince + TTL and closes only after it', () => {
    const i = { ...base, emptySince: base.now };
    expect(nextAlarmAt(i)).toBe(base.now + TTL);
    expect(shouldCloseRoom(i)).toBe(false);
    expect(shouldCloseRoom({ ...i, now: base.now + TTL - 1 })).toBe(false);
    expect(shouldCloseRoom({ ...i, now: base.now + TTL })).toBe(true);
  });

  it('never closes while D1 writes are pending; the outbox retry drives the next check', () => {
    const i = { ...base, emptySince: base.now - 2 * TTL, pendingWrites: 2, outboxRetryAt: base.now + 5_000 };
    expect(shouldCloseRoom(i)).toBe(false);
    expect(nextAlarmAt(i)).toBe(base.now + 5_000);
  });

  it('keeps the earlier outbox retry when the room is not yet due', () => {
    const i = { ...base, emptySince: base.now, pendingWrites: 1, outboxRetryAt: base.now + 2_000 };
    expect(nextAlarmAt(i)).toBe(base.now + 2_000);
  });

  it('outbox retry only, nobody ever empty', () => {
    expect(nextAlarmAt({ ...base, openConnections: 3, pendingWrites: 1, outboxRetryAt: 42 })).toBe(42);
  });

  it('ttl override and parsing', () => {
    expect(nextAlarmAt({ ...base, emptySince: base.now, ttlMs: 30_000 })).toBe(base.now + 30_000);
    expect(parseTtlSeconds('30')).toBe(30_000);
    expect(parseTtlSeconds(undefined)).toBe(TTL);
    expect(parseTtlSeconds('5')).toBe(TTL);
    expect(parseTtlSeconds('abc')).toBe(TTL);
  });
});
