import { describe, it, expect } from 'vitest';
import app from '../../services/publisher/src/app';

describe('single Cloudflare deployment', () => {
  it('serves public files without GitHub credentials', async () => {
    const env = { ASSETS: { fetch: async () => new Response('static website') } };
    expect(await (await app.fetch(new Request('https://example.org/'), env)).text()).toBe('static website');
  });
  it('keeps API requests out of static fallback and fails closed before setup', async () => {
    const env = { ASSETS: { fetch: async () => new Response('must not be served') } };
    const result = await app.fetch(new Request('https://example.org/api/session'), env);
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: 'Publisher is not configured.' });
  });
});
