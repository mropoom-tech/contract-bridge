import { describe, expect, it } from 'vitest';
import { createApp, HealthResponseSchema } from './app';

describe('worker API', () => {
  const app = createApp();

  it('GET /api/health returns a valid health payload', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(HealthResponseSchema.safeParse(await res.json()).success).toBe(true);
  });

  it('unknown API routes return a JSON 404', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
