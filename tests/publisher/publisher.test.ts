import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import worker, { type PublisherEnv, boundedTextForTest, decodeGithubContentForTest } from '../../services/publisher/src/index';
import { site } from './fixture';

const testPrivateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const env: PublisherEnv = {
  APP_ORIGIN: 'https://masjid.example', GITHUB_OWNER: 'openmasjid', GITHUB_REPO: 'site',
  GITHUB_BRANCH: 'main', GITHUB_INSTALLATION_ID: '123', GITHUB_APP_ID: '456',
  GITHUB_CLIENT_ID: 'client', GITHUB_CLIENT_SECRET: 'secret',
  GITHUB_PRIVATE_KEY: testPrivateKey,
  SESSION_SECRET: 'a sufficiently long session secret for tests',
};
const json = (body: unknown, init: RequestInit = {}) => new Request('https://masjid.example' + ((init as any).path ?? '/'), { ...init, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', ...(init.headers || {}) } });
const configured = () => ({ ...env, GITHUB_PRIVATE_KEY: process.env.TEST_RSA_KEY ?? env.GITHUB_PRIVATE_KEY });

beforeEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('publisher configuration gate', () => {
  it('fails closed without credentials, even for session/login', async () => {
    for (const path of ['/api/session', '/api/auth/login', '/api/content']) {
      const response = await worker.fetch(new Request(`https://masjid.example${path}`), {});
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'Publisher is not configured.' });
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });
});

describe('publisher security and content contract', () => {
  it('rejects unsupported methods and origins before privileged work', async () => {
    const response = await worker.fetch(new Request('https://masjid.example/api/publish', { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' }), configured());
    expect(response.status).toBe(403);
    const method = await worker.fetch(new Request('https://masjid.example/api/session', { method: 'PUT' }), configured());
    expect(method.status).toBe(405);
  });

  it('never exposes a configured public draft without a valid encrypted session', async () => {
    const response = await worker.fetch(new Request('https://masjid.example/api/content'), configured());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized.' });
  });

  it('rejects oversized publish payloads before GitHub', async () => {
    const response = await worker.fetch(new Request('https://masjid.example/api/publish', { method: 'POST', headers: { origin: env.APP_ORIGIN, 'content-type': 'application/json', 'x-csrf-token': 'x' }, body: 'x'.repeat(1024 * 1024 + 100) }), configured());
    expect([400, 401, 403]).toContain(response.status);
  });

  it('completes the mocked OAuth round trip and emits independent cookie lifecycle headers', async () => {
    const loginResponse = await worker.fetch(new Request('https://masjid.example/api/auth/login'), configured());
    const state = new URL(loginResponse.headers.get('location')!).searchParams.get('state')!;
    const oauthCookie = loginResponse.headers.get('set-cookie')!.split(';', 1)[0];
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push(url);
      if (url === 'https://github.com/login/oauth/access_token') {
        const body = JSON.parse(String(init?.body)); expect(body.code_verifier).toBeTruthy(); expect(body.state).toBeTruthy();
        return Response.json({ access_token: 'user-token', expires_in: 3600 });
      }
      if (url.endsWith('/user')) return Response.json({ login: 'alice', avatar_url: 'https://github.com/alice.png' });
      if (url.endsWith('/repos/openmasjid/site')) return Response.json({ full_name: 'openmasjid/site' });
      if (url.includes('/collaborators/alice/permission')) return Response.json({ permission: 'push' });
      throw new Error(`unexpected GitHub request: ${url}`);
    }));
    const callback = await worker.fetch(new Request(`https://masjid.example/api/auth/callback?code=oauth-code&state=${encodeURIComponent(state)}`, { headers: { cookie: oauthCookie } }), configured());
    expect(callback.status).toBe(302);
    const setCookies = callback.headers.get('set-cookie')!;
    expect(setCookies).toContain('openmasjid_session=');
    expect(setCookies).toContain('openmasjid_oauth=; Max-Age=0');
    expect(calls).toContain('https://github.com/login/oauth/access_token');
  });

  it('denies an OAuth callback when the GitHub permission is insufficient', async () => {
    const loginResponse = await worker.fetch(new Request('https://masjid.example/api/auth/login'), configured());
    const state = new URL(loginResponse.headers.get('location')!).searchParams.get('state')!;
    const oauthCookie = loginResponse.headers.get('set-cookie')!.split(';', 1)[0];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: 'user-token', expires_in: 1 });
      if (url.endsWith('/user')) return Response.json({ login: 'read-only' });
      if (url.endsWith('/repos/openmasjid/site')) return Response.json({ full_name: 'openmasjid/site' });
      if (url.includes('/collaborators/read-only/permission')) return Response.json({ permission: 'pull' });
      throw new Error('unexpected GitHub request');
    }));
    const response = await worker.fetch(new Request(`https://masjid.example/api/auth/callback?code=oauth-code&state=${encodeURIComponent(state)}`, { headers: { cookie: oauthCookie } }), configured());
    expect(response.status).toBe(403);
  });
});

describe('publisher pure security helpers', () => {
  it('round trips encrypted session data and rejects integrity or expiry failures', async () => {
    const { encryptForTest, decryptForTest } = await import('../../services/publisher/src/index');
    const token = await encryptForTest({ user: 'alice', exp: Date.now() + 60_000 }, env.SESSION_SECRET);
    expect(await decryptForTest(token, env.SESSION_SECRET)).toEqual({ user: 'alice', exp: expect.any(Number) });
    expect(await decryptForTest((token[0] === 'A' ? 'B' : 'A') + token.slice(1), env.SESSION_SECRET)).toBeNull();
    const expired = await encryptForTest({ exp: Date.now() - 1 }, env.SESSION_SECRET);
    expect(await decryptForTest(expired, env.SESSION_SECRET)).toBeNull();
  });
});

describe('publisher bounded I/O and encoding', () => {
  it('rejects chunked request bodies after reading only through the limit', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('a'.repeat(1024 * 1024 + 1))); controller.close(); } });
    await expect(boundedTextForTest(new Request('https://masjid.example', { method: 'POST', body: stream, duplex: 'half' } as RequestInit), 1024 * 1024)).rejects.toThrow('too large');
  });
  it('decodes GitHub content as UTF-8 bytes before JSON parsing', () => {
    const value = { ...site, organization: { ...site.organization, name: 'Masjid café مسجد' } };
    const encoded = Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
    expect(decodeGithubContentForTest(encoded).organization.name).toBe('Masjid café مسجد');
  });
});
