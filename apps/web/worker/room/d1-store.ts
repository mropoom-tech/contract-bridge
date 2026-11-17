import type { ResultStore } from './result-sync';

/** D1 adapter for the outbox flush. */
export const d1Store = (db: D1Database): ResultStore => ({
  batch: async (statements) => {
    await db.batch(statements.map((s) => db.prepare(s.sql).bind(...s.params)));
  },
  first: (sql, params) => db.prepare(sql).bind(...params).first(),
});
