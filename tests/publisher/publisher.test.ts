import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { crc32 } from 'node:zlib';
import worker, { type PublisherEnv, boundedTextForTest, decodeGithubContentForTest, encryptForTest, prepareLogoAssetForTest } from '../../services/publisher/src/index';
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

describe('publisher logo assets', () => {
  it('derives an immutable repository path from verified image bytes', async () => {
    const bytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgaGD4DwAChAGA+gVWHQAAAABJRU5ErkJggg==', 'base64'));
    const asset = await prepareLogoAssetForTest({ mediaType: 'image/png', content: Buffer.from(bytes).toString('base64') });
    expect(asset.publicPath).toMatch(/^assets\/uploads\/organization-logo-[a-f0-9]{16}\.png$/);
    expect(asset.repositoryPath).toBe(`apps/web/public/${asset.publicPath}`);
    expect(asset.bytes).toEqual(bytes);
  });

  it('rejects malformed, unsupported, and oversized logo payloads', async () => {
    await expect(prepareLogoAssetForTest({ mediaType: 'image/png', content: 'bm90IGFuIGltYWdl' })).rejects.toThrow('logo');
    await expect(prepareLogoAssetForTest({ mediaType: 'image/svg+xml', content: 'PHN2Zz48L3N2Zz4=' })).rejects.toThrow('logo');
    await expect(prepareLogoAssetForTest({ mediaType: 'image/png', content: 'iVBORw0KGgo=' })).rejects.toThrow('logo');
    await expect(prepareLogoAssetForTest({ mediaType: 'image/png', content: 'A'.repeat(Math.ceil((2 * 1024 * 1024) / 3) * 4 + 4) })).rejects.toThrow('logo');
    const hugeDimensions = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgaGD4DwAChAGA+gVWHQAAAABJRU5ErkJggg==', 'base64');
    hugeDimensions.writeUInt32BE(5000, 16);
    hugeDimensions.writeUInt32BE(crc32(hugeDimensions.subarray(12, 29)), 29);
    await expect(prepareLogoAssetForTest({ mediaType: 'image/png', content: hugeDimensions.toString('base64') })).rejects.toThrow('logo');
    const invalidBitDepth = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgaGD4DwAChAGA+gVWHQAAAABJRU5ErkJggg==', 'base64');
    invalidBitDepth[24] = 3;
    invalidBitDepth.writeUInt32BE(crc32(invalidBitDepth.subarray(12, 29)), 29);
    await expect(prepareLogoAssetForTest({ mediaType: 'image/png', content: invalidBitDepth.toString('base64') })).rejects.toThrow('logo');
    const invalidPixels = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgaGD4DwAChAGA+gVWHQAAAABJRU5ErkJggg==', 'base64');
    invalidPixels[45] ^= 0xff;
    invalidPixels.writeUInt32BE(crc32(invalidPixels.subarray(37, 54)), 54);
    await expect(prepareLogoAssetForTest({ mediaType: 'image/png', content: invalidPixels.toString('base64') })).rejects.toThrow('logo');
    const validPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgaGD4DwAChAGA+gVWHQAAAABJRU5ErkJggg==', 'base64');
    const duplicateHeader = Buffer.concat([validPng.subarray(0, 33), validPng.subarray(8, 33), validPng.subarray(33)]);
    await expect(prepareLogoAssetForTest({ mediaType: 'image/png', content: duplicateHeader.toString('base64') })).rejects.toThrow('logo');
    const pngChunk = (type: string, data: Buffer) => { const name = Buffer.from(type); const chunk = Buffer.alloc(12 + data.length); chunk.writeUInt32BE(data.length, 0); name.copy(chunk, 4); data.copy(chunk, 8); chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length); return chunk; };
    const unknownCritical = Buffer.concat([validPng.subarray(0, 33), pngChunk('ABCD', Buffer.alloc(0)), validPng.subarray(33)]);
    await expect(prepareLogoAssetForTest({ mediaType: 'image/png', content: unknownCritical.toString('base64') })).rejects.toThrow('logo');
    const palette = pngChunk('PLTE', Buffer.from([0, 0, 0]));
    const duplicatePalette = Buffer.concat([validPng.subarray(0, 33), palette, palette, validPng.subarray(33)]);
    await expect(prepareLogoAssetForTest({ mediaType: 'image/png', content: duplicatePalette.toString('base64') })).rejects.toThrow('logo');
    await expect(prepareLogoAssetForTest({ mediaType: 'image/jpeg', content: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgaGD4DwAChAGA+gVWHQAAAABJRU5ErkJggg==', 'base64').toString('base64') })).rejects.toThrow('logo');
    const jpegLike = Buffer.from([0xff,0xd8,0xff,0xc0,0x00,0x08,0x08,0x00,0x01,0x00,0x01,0x01,0xff,0xda,0xff,0xd9]);
    await expect(prepareLogoAssetForTest({ mediaType: 'image/png', content: jpegLike.toString('base64') })).rejects.toThrow('logo');
  });

  it('commits the logo and site content together in one Git commit', async () => {
    const csrf = 'csrf-token';
    const session = await encryptForTest({ login: 'alice', accessToken: 'user-token', csrf, exp: Date.now() + 60_000 }, env.SESSION_SECRET);
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgaGD4DwAChAGA+gVWHQAAAABJRU5ErkJggg==', 'base64'));
    let committedTree: any;
    const previousLogo = 'assets/uploads/organization-logo-aaaaaaaaaaaaaaaa.png';
    const currentSite = { ...site, organization: { ...site.organization, logo: previousLogo } };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/repos/openmasjid/site')) return Response.json({ full_name: 'openmasjid/site' });
      if (url.includes('/collaborators/alice/permission')) return Response.json({ permission: 'push' });
      if (url.includes('/app/installations/123/access_tokens')) return Response.json({ token: 'installation-token' });
      if (url.includes('/contents/content/site.json')) { expect(url).toContain('ref=head-sha'); return Response.json({ sha: 'content-sha', content: Buffer.from(JSON.stringify(currentSite)).toString('base64') }); }
      if (url.includes('/contents/apps/web/public/assets/uploads/organization-logo-aaaaaaaaaaaaaaaa.png')) { expect(init?.method).toBe('HEAD'); return new Response(null, { status: 200 }); }
      if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: 'head-sha' } });
      if (url.endsWith('/git/commits/head-sha')) return Response.json({ tree: { sha: 'base-tree' } });
      if (url.endsWith('/git/blobs')) {
        const body = JSON.parse(String(init?.body));
        return Response.json({ sha: body.encoding === 'base64' ? 'logo-blob' : 'site-blob' });
      }
      if (url.endsWith('/git/trees')) { committedTree = JSON.parse(String(init?.body)); return Response.json({ sha: 'new-tree' }); }
      if (url.endsWith('/git/commits')) return Response.json({ sha: 'new-commit', html_url: 'https://github.com/openmasjid/site/commit/new-commit' });
      if (url.endsWith('/git/refs/heads/main') && init?.method === 'PATCH') return Response.json({ object: { sha: 'new-commit' } });
      throw new Error(`unexpected GitHub request: ${url}`);
    }));

    const response = await worker.fetch(json({
      sha: 'content-sha', content: site,
      logoUpload: { mediaType: 'image/png', content: Buffer.from(png).toString('base64') },
    }, { path: '/api/publish', method: 'POST', headers: { origin: env.APP_ORIGIN, cookie: `openmasjid_session=${session}`, 'x-csrf-token': csrf } }), configured());

    expect(response.status).toBe(200);
    const result = await response.json() as any;
    expect(result.assetPath).toMatch(/^assets\/uploads\/organization-logo-[a-f0-9]{16}\.png$/);
    expect(committedTree.base_tree).toBe('base-tree');
    expect(committedTree.tree).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'content/site.json', sha: 'site-blob' }),
      expect.objectContaining({ path: `apps/web/public/${result.assetPath}`, sha: 'logo-blob' }),
      expect.objectContaining({ path: `apps/web/public/${previousLogo}`, sha: null }),
    ]));
  }, 15_000);
});
