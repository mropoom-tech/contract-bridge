/**
 * Empty-room auto-close policy (pure, unit-tested).
 *
 * A room with nobody connected is closed after EMPTY_ROOM_TTL_MS. The grace
 * period covers page refreshes, flaky mobile networks and a short break.
 * A room is never closed while D1 summary writes are still pending, so no
 * result is lost.
 */
export const EMPTY_ROOM_TTL_MS = 15 * 60_000;

export interface LifecycleInput {
  readonly now: number;
  /** Epoch ms when the room became empty, or null while someone is connected. */
  readonly emptySince: number | null;
  readonly openConnections: number;
  readonly pendingWrites: number;
  /** Epoch ms of the next outbox retry, or null if none is scheduled. */
  readonly outboxRetryAt: number | null;
  /** Grace period; defaults to EMPTY_ROOM_TTL_MS. */
  readonly ttlMs?: number;
}

export const emptyDeadline = (emptySince: number | null, ttlMs = EMPTY_ROOM_TTL_MS): number | null =>
  emptySince === null ? null : emptySince + ttlMs;

/** Parse the optional ROOM_EMPTY_TTL_SECONDS var (10 s .. 24 h); anything else uses the default. */
export const parseTtlSeconds = (raw: string | undefined): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 10 && n <= 86_400 ? n * 1000 : EMPTY_ROOM_TTL_MS;
};

export const shouldCloseRoom = (i: LifecycleInput): boolean => {
  const deadline = emptyDeadline(i.emptySince, i.ttlMs);
  return deadline !== null && i.now >= deadline && i.openConnections === 0 && i.pendingWrites === 0;
};

/** Earliest time the DO alarm must fire, or null if no alarm is needed. */
export const nextAlarmAt = (i: LifecycleInput): number | null => {
  const times: number[] = [];
  if (i.pendingWrites > 0 && i.outboxRetryAt !== null) times.push(i.outboxRetryAt);
  // While writes are pending the outbox retry drives the next check (no busy loop).
  const deadline = i.openConnections === 0 && i.pendingWrites === 0 ? emptyDeadline(i.emptySince, i.ttlMs) : null;
  if (deadline !== null) times.push(Math.max(deadline, i.now));
  return times.length === 0 ? null : Math.min(...times);
};

/** Idempotent D1 statements that mark a room closed. Results already written stay untouched. */
export const archiveRoomStatements = (roomId: string, nowIso: string) => [
  {
    sql: `UPDATE matches SET status = 'abandoned' WHERE room_id = ? AND status = 'active'`,
    params: [roomId],
  },
  {
    sql: `UPDATE rooms SET status = 'archived', updated_at = ? WHERE id = ? AND status <> 'archived'`,
    params: [nowIso, roomId],
  },
];
