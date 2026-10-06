import { inspectLogoImage, MAX_LOGO_BYTES, validateSite, MAX_CONTENT_BYTES, type Site } from '../../../packages/core/src/index';

type Json = Record<string, unknown>;
export interface PublisherEnv {
  APP_ORIGIN?: string; GITHUB_OWNER?: string; GITHUB_REPO?: string; GITHUB_BRANCH?: string;
  GITHUB_INSTALLATION_ID?: string; GITHUB_APP_ID?: string; GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string; GITHUB_PRIVATE_KEY?: string; SESSION_SECRET?: string;
}
interface Session { login: string; avatarUrl?: string; accessToken: string; csrf: string; exp: number; }
interface OAuthState { browser: string; verifier: string; exp: number; }
const SESSION_COOKIE = 'openmasjid_session';
const OAUTH_COOKIE = 'openmasjid_oauth';
const MAX_COOKIE = 3800;
const GITHUB = 'https://api.github.com';
const encoder = new TextEncoder();


const b64 = (bytes: Uint8Array) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = (value: string) => { const s = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4); const raw = atob(s); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
const stdB64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); };


async function prepareLogoAsset(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('logo');
  const upload = value as Json;
  if (upload.mediaType !== 'image/png' || typeof upload.content !== 'string' || upload.content.length > Math.ceil(MAX_LOGO_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(upload.content)) throw new Error('logo');
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(upload.content), char => char.charCodeAt(0)); } catch { throw new Error('logo'); }
  if (bytes.byteLength > MAX_LOGO_BYTES) throw new Error('logo');
  let detectedMediaType: string;
  try { ({ mediaType: detectedMediaType } = await inspectLogoImage(bytes)); } catch { throw new Error('logo'); }
  if (detectedMediaType !== 'image/png') throw new Error('logo');
  const extension = 'png';
  const digestBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', digestBytes))).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
  const publicPath = `assets/uploads/organization-logo-${digest}.${extension}`;
  return { bytes, publicPath, repositoryPath: `apps/web/public/${publicPath}` };
}
export const prepareLogoAssetForTest = prepareLogoAsset;
const timingSafe = (a: string, b: string) => { const aa = encoder.encode(a), bb = encoder.encode(b); let n = aa.length ^ bb.length; for (let i = 0; i < Math.max(aa.length, bb.length); i++) n |= (aa[i % (aa.length || 1)] ?? 0) ^ (bb[i % (bb.length || 1)] ?? 0); return n === 0; };
const random = (n = 32) => { const bytes = new Uint8Array(n); crypto.getRandomValues(bytes); return b64(bytes); };

async function keyFor(secret: string) { const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret)); return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function encrypt(value: unknown, secret: string) { const iv = new Uint8Array(12); crypto.getRandomValues(iv); const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(secret), encoder.encode(JSON.stringify(value))); return `${b64(iv)}.${b64(new Uint8Array(ciphertext))}`; }
async function decrypt<T>(value: string | undefined, secret: string): Promise<T | null> { if (!value || value.length > MAX_COOKIE) return null; try { const [iv, ciphertext] = value.split('.'); if (!iv || !ciphertext) return null; const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await keyFor(secret), unb64(ciphertext)); const parsed = JSON.parse(new TextDecoder().decode(plain)) as T & { exp?: unknown }; if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null; return parsed as T; } catch { return null; } }
export const encryptForTest = encrypt;
export const decryptForTest = decrypt;

function configured(env: PublisherEnv) {
  return ['APP_ORIGIN','GITHUB_OWNER','GITHUB_REPO','GITHUB_BRANCH','GITHUB_INSTALLATION_ID','GITHUB_APP_ID','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET','GITHUB_PRIVATE_KEY','SESSION_SECRET'].every(k => typeof env[k as keyof PublisherEnv] === 'string' && String(env[k as keyof PublisherEnv]).length > 0) && /^https:\/\/[^/]+$/.test(env.APP_ORIGIN!);
}
function headers(extra: Record<string, string> = {}) { return { 'cache-control': 'no-store', ...extra }; }
function reply(body: unknown, status = 200, extra: Record<string, string> = {}) { return Response.json(body, { status, headers: headers(extra) }); }
function error(status: number, message: 'Unauthorized.' | 'Forbidden.' | 'Invalid request.' | 'Conflict.' | 'Publisher is not configured.' | 'GitHub request failed.' = 'Invalid request.') { return reply({ error: message }, status); }
function cookies(request: Request) { const out: Record<string, string> = {}; for (const piece of (request.headers.get('cookie') ?? '').split(';')) { const i = piece.indexOf('='); if (i > 0) out[piece.slice(0, i).trim()] = piece.slice(i + 1).trim(); } return out; }
function setCookie(name: string, value: string, maxAge: number) { return `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`; }
function clearCookie(name: string) { return `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`; }
function safeOrigin(request: Request, env: PublisherEnv) { return request.headers.get('origin') === env.APP_ORIGIN; }
function allowedMethod(request: Request, methods: string[]) { return methods.includes(request.method); }
function apiUrl(path: string) { return `${GITHUB}${path}`; }

async function boundedText(response: Response | Request, limit = 2 * 1024 * 1024) {
  const length = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(length) && length > limit) throw new Error('response too large');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > limit) { await reader.cancel('response too large'); throw new Error('response too large'); }
      chunks.push(chunk);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
const decodeGithubContent = (encoded: string) => { const raw = atob(encoded.replace(/\s/g, '')); const bytes = Uint8Array.from(raw, c => c.charCodeAt(0)); if (bytes.byteLength > MAX_CONTENT_BYTES) throw new Error('content too large'); return validateSite(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); };
export const boundedTextForTest = boundedText;
export const decodeGithubContentForTest = decodeGithubContent;
async function github(path: string, init: RequestInit, limit = 2 * 1024 * 1024): Promise<Json> { const response = await fetch(apiUrl(path), { ...init, signal: AbortSignal.timeout(10000), headers: { accept: 'application/vnd.github+json', 'user-agent': 'OpenMasjid-Publisher', ...(init.headers ?? {}) } }); const text = await boundedText(response, limit); let body: Json = {}; try { body = text ? JSON.parse(text) as Json : {}; } catch { throw new Error('invalid github response'); } if (!response.ok) { const e = new Error('github error'); (e as Error & { status?: number }).status = response.status; throw e; } return body; }
async function githubPathExists(path: string, token: string) { const response = await fetch(apiUrl(path), { method: 'HEAD', signal: AbortSignal.timeout(10000), headers: { accept: 'application/vnd.github+json', 'user-agent': 'OpenMasjid-Publisher', authorization: ['Bea', 'rer ', token].join('') } }); if (response.status === 404) return false; if (!response.ok) { const error = new Error('github error'); (error as Error & { status?: number }).status = response.status; throw error; } return true; }

function pemBytes(pem: string) { const clean = pem.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g, ''); return unb64(clean); }
function derLen(bytes: Uint8Array, at: number): [number, number] { const first = bytes[at]; if (first < 128) return [first, at + 1]; const count = first & 127; let n = 0; for (let i = 0; i < count; i++) n = n * 256 + bytes[at + 1 + i]; return [n, at + 1 + count]; }
function derTlv(tag: number, content: Uint8Array) { const len = content.length < 128 ? Uint8Array.of(content.length) : (() => { const a: number[] = []; let n = content.length; while (n) { a.unshift(n & 255); n >>>= 8; } return Uint8Array.of(0x80 | a.length, ...a); })(); return Uint8Array.of(tag, ...len, ...content); }
function concat(...parts: Uint8Array[]) { const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; }
function pkcs1ToPkcs8(pkcs1: Uint8Array) { let at = 0; if (pkcs1[at++] !== 0x30) throw new Error('private key'); const [outer, after] = derLen(pkcs1, at); at = after; const ints: Uint8Array[] = []; const end = at + outer; while (at < end) { if (pkcs1[at++] !== 2) throw new Error('private key'); const [n, next] = derLen(pkcs1, at); at = next; ints.push(pkcs1.slice(at, at + n)); at += n; } const version = derTlv(2, Uint8Array.of(0)); const rsa = derTlv(0x30, concat(version, ...ints.map(x => derTlv(2, x)))); const rsaAlgorithm = derTlv(0x30, Uint8Array.of(0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00)); return derTlv(0x30, concat(derTlv(2, Uint8Array.of(0)), rsaAlgorithm, derTlv(3, concat(Uint8Array.of(0), rsa)))); }
async function importSigningKey(pem: string) { const der = pemBytes(pem); const pkcs8 = pem.includes('BEGIN RSA PRIVATE KEY') ? pkcs1ToPkcs8(der) : der; return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']); }
async function appJwt(env: PublisherEnv) { const now = Math.floor(Date.now() / 1000); const h = b64(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))); const p = b64(encoder.encode(JSON.stringify({ iat: now - 30, exp: now + 540, iss: env.GITHUB_APP_ID }))); const key = await importSigningKey(env.GITHUB_PRIVATE_KEY!); const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${h}.${p}`)); return `${h}.${p}.${b64(new Uint8Array(sig))}`; }
async function installationToken(env: PublisherEnv) { const token = await github(`/app/installations/${encodeURIComponent(env.GITHUB_INSTALLATION_ID!)}/access_tokens`, { method: 'POST', headers: { authorization: `Bearer ${await appJwt(env)}`, 'content-type': 'application/json' }, body: JSON.stringify({ repositories: [env.GITHUB_REPO], permissions: { contents: 'write' } }) }); if (typeof token.token !== 'string') throw new Error('token'); return token.token; }
async function userCanPush(login: string, token: string, env: PublisherEnv) { const repo = await github(`/repos/${encodeURIComponent(env.GITHUB_OWNER!)}/${encodeURIComponent(env.GITHUB_REPO!)}`, { method: 'GET', headers: { authorization: `Bearer ${token}` } }); if (repo.full_name !== `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`) return false; const permission = await github(`/repos/${encodeURIComponent(env.GITHUB_OWNER!)}/${encodeURIComponent(env.GITHUB_REPO!)}/collaborators/${encodeURIComponent(login)}/permission`, { method: 'GET', headers: { authorization: `Bearer ${token}` } }); return ['admin','maintain','push'].includes(String(permission.permission)); }
async function currentContent(env: PublisherEnv, token: string, ref = env.GITHUB_BRANCH!) { const path = `/repos/${encodeURIComponent(env.GITHUB_OWNER!)}/${encodeURIComponent(env.GITHUB_REPO!)}/contents/content/site.json?ref=${encodeURIComponent(ref)}`; const result = await github(path, { method: 'GET', headers: { authorization: ['Bea', 'rer ', token].join('') } }, MAX_CONTENT_BYTES + 50000); if (typeof result.sha !== 'string' || typeof result.content !== 'string') throw new Error('content'); const content = decodeGithubContent(result.content); return { content, sha: result.sha } as { content: Site; sha: string }; }
async function session(request: Request, env: PublisherEnv) { return decrypt<Session>(cookies(request)[SESSION_COOKIE], env.SESSION_SECRET!); }

async function login(request: Request, env: PublisherEnv) { const browser = random(24), state: OAuthState = { browser, verifier: random(32), exp: Date.now() + 10 * 60_000 }; const sealed = await encrypt(state as unknown as Json, env.SESSION_SECRET!); const challenge = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(state.verifier)))); const callback = `${env.APP_ORIGIN}/api/auth/callback`; const url = new URL('https://github.com/login/oauth/authorize'); url.searchParams.set('client_id', env.GITHUB_CLIENT_ID!); url.searchParams.set('redirect_uri', callback); url.searchParams.set('state', sealed); url.searchParams.set('code_challenge', challenge); url.searchParams.set('code_challenge_method', 'S256'); return new Response(null, { status: 302, headers: headers({ location: url.toString(), 'set-cookie': setCookie(OAUTH_COOKIE, sealed, 600) }) }); }
async function callback(request: Request, env: PublisherEnv) { const url = new URL(request.url); if (url.origin !== env.APP_ORIGIN) return error(400); const state = url.searchParams.get('state'); const stored = cookies(request)[OAUTH_COOKIE]; const oauth = await decrypt<OAuthState>(stored, env.SESSION_SECRET!); if (!state || !stored || !oauth || !timingSafe(state, stored)) return error(400); const code = url.searchParams.get('code'); if (!code) return error(400); const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', signal: AbortSignal.timeout(10000), headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${env.APP_ORIGIN}/api/auth/callback`, state, code_verifier: oauth.verifier }) }); const tokenBody = JSON.parse(await boundedText(tokenResponse, 32 * 1024)) as Json; if (!tokenResponse.ok || typeof tokenBody.access_token !== 'string') return error(502, 'GitHub request failed.'); const accessToken = tokenBody.access_token; const user = await github('/user', { method: 'GET', headers: { authorization: `Bearer ${accessToken}` } }); if (typeof user.login !== 'string' || !(await userCanPush(user.login, accessToken, env))) return error(403, 'Forbidden.'); const providerExpiry = typeof tokenBody.expires_in === 'number' ? Date.now() + tokenBody.expires_in * 1000 : Date.now() + 8 * 60 * 60_000; const exp = Math.min(Date.now() + 8 * 60 * 60_000, providerExpiry); const data: Session = { login: user.login, avatarUrl: typeof user.avatar_url === 'string' ? user.avatar_url : undefined, accessToken, csrf: random(24), exp }; const sealed = await encrypt(data as unknown as Json, env.SESSION_SECRET!); if (sealed.length > MAX_COOKIE) return error(500, 'GitHub request failed.'); const responseHeaders = new Headers(headers({ location: `${env.APP_ORIGIN}/admin/` })); responseHeaders.append('set-cookie', setCookie(SESSION_COOKIE, sealed, Math.max(1, Math.floor((exp - Date.now()) / 1000)))); responseHeaders.append('set-cookie', clearCookie(OAUTH_COOKIE)); return new Response(null, { status: 302, headers: responseHeaders }); }

async function privileged(request: Request, env: PublisherEnv) { const current = await session(request, env); if (!current) return { response: error(401, 'Unauthorized.') }; if (!(await userCanPush(current.login, current.accessToken, env))) return { response: error(403, 'Forbidden.') }; return { current }; }
async function content(request: Request, env: PublisherEnv) { const auth = await privileged(request, env); if (auth.response) return auth.response; try { const token = await installationToken(env); const result = await currentContent(env, token); return reply(result); } catch { return error(502, 'GitHub request failed.'); } }
async function publish(request: Request, env: PublisherEnv) {
  if (!safeOrigin(request, env)) return error(403, 'Forbidden.');
  const csrf = request.headers.get('x-csrf-token');
  const auth = await privileged(request, env);
  if (auth.response) return auth.response;
  if (!csrf || !timingSafe(csrf, auth.current!.csrf)) return error(403, 'Forbidden.');
  const maxPublishBytes = MAX_CONTENT_BYTES + Math.ceil(MAX_LOGO_BYTES / 3) * 4 + 50_000;
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > maxPublishBytes) return error(400);
  let body: Json;
  try { body = JSON.parse(await boundedText(request, maxPublishBytes)) as Json; } catch { return error(400); }
  if (!body || typeof body.sha !== 'string' || !body.content || typeof body.content !== 'object' || Array.isArray(body.content)) return error(400);
  let parsed: Site;
  try { parsed = validateSite(body.content); } catch { return error(400); }
  try {
    const logoAsset = body.logoUpload === undefined ? null : await prepareLogoAsset(body.logoUpload);
    if (logoAsset) parsed = validateSite({ ...parsed, organization: { ...parsed.organization, logo: logoAsset.publicPath } });
    const token = await installationToken(env);
    const repo = `/repos/${encodeURIComponent(env.GITHUB_OWNER!)}/${encodeURIComponent(env.GITHUB_REPO!)}`;
    const branch = encodeURIComponent(env.GITHUB_BRANCH!);
    const ref = await github(`${repo}/git/ref/heads/${branch}`, { method: 'GET', headers: { authorization: ['Bea', 'rer ', token].join('') } });
    const headSha = (ref.object as Json | undefined)?.sha;
    if (typeof headSha !== 'string') throw new Error('ref');
    const head = await github(`${repo}/git/commits/${encodeURIComponent(headSha)}`, { method: 'GET', headers: { authorization: ['Bea', 'rer ', token].join('') } });
    const baseTree = (head.tree as Json | undefined)?.sha;
    if (typeof baseTree !== 'string') throw new Error('tree');
    const current = await currentContent(env, token, headSha);
    if (current.sha !== body.sha) return error(409, 'Conflict.');
    parsed = validateSite({ ...parsed, updatedAt: new Date().toISOString() });
    const siteBytes = encoder.encode(JSON.stringify(parsed));
    if (siteBytes.byteLength > MAX_CONTENT_BYTES) return error(400);
    const siteBlob = await github(`${repo}/git/blobs`, { method: 'POST', headers: { authorization: ['Bea', 'rer ', token].join(''), 'content-type': 'application/json' }, body: JSON.stringify({ content: new TextDecoder().decode(siteBytes), encoding: 'utf-8' }) });
    if (typeof siteBlob.sha !== 'string') throw new Error('blob');
    const tree: Array<Record<string, unknown>> = [{ path: 'content/site.json', mode: '100644', type: 'blob', sha: siteBlob.sha }];
    if (logoAsset) {
      const logoBlob = await github(`${repo}/git/blobs`, { method: 'POST', headers: { authorization: ['Bea', 'rer ', token].join(''), 'content-type': 'application/json' }, body: JSON.stringify({ content: stdB64(logoAsset.bytes), encoding: 'base64' }) });
      if (typeof logoBlob.sha !== 'string') throw new Error('blob');
      tree.push({ path: logoAsset.repositoryPath, mode: '100644', type: 'blob', sha: logoBlob.sha });
    }
    const oldLogo = current.content.organization.logo;
    if (/^assets\/uploads\/organization-logo-[a-f0-9]{16}\.(?:png|jpg|webp)$/.test(oldLogo) && oldLogo !== parsed.organization.logo) {
      const oldRepositoryPath = `apps/web/public/${oldLogo}`;
      if (await githubPathExists(`${repo}/contents/${oldRepositoryPath}?ref=${encodeURIComponent(headSha)}`, token)) tree.push({ path: oldRepositoryPath, mode: '100644', type: 'blob', sha: null });
    }
    const newTree = await github(`${repo}/git/trees`, { method: 'POST', headers: { authorization: ['Bea', 'rer ', token].join(''), 'content-type': 'application/json' }, body: JSON.stringify({ base_tree: baseTree, tree }) });
    if (typeof newTree.sha !== 'string') throw new Error('tree');
    const commit = await github(`${repo}/git/commits`, { method: 'POST', headers: { authorization: ['Bea', 'rer ', token].join(''), 'content-type': 'application/json' }, body: JSON.stringify({ message: logoAsset ? 'Update site content and organization logo' : 'Update site content', tree: newTree.sha, parents: [headSha] }) });
    if (typeof commit.sha !== 'string' || typeof commit.html_url !== 'string') throw new Error('commit');
    await github(`${repo}/git/refs/heads/${branch}`, { method: 'PATCH', headers: { authorization: ['Bea', 'rer ', token].join(''), 'content-type': 'application/json' }, body: JSON.stringify({ sha: commit.sha, force: false }) });
    return reply({ commitSha: commit.sha, commitUrl: commit.html_url, status: 'committed', ...(logoAsset ? { assetPath: logoAsset.publicPath } : {}) });
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    if (status === 409 || status === 422) return error(409, 'Conflict.');
    return error(502, 'GitHub request failed.');
  }
}

export default { async fetch(request: Request, env: PublisherEnv): Promise<Response> {
  if (!configured(env)) return error(503, 'Publisher is not configured.');
  const path = new URL(request.url).pathname;
  try {
    if (path === '/api/auth/login' && allowedMethod(request, ['GET'])) return login(request, env);
    if (path === '/api/auth/callback' && allowedMethod(request, ['GET'])) return callback(request, env);
    if (path === '/api/session' && allowedMethod(request, ['GET'])) { const s = await session(request, env); return reply(s ? { authenticated: true, user: { login: s.login, ...(s.avatarUrl ? { avatarUrl: s.avatarUrl } : {}) }, csrfToken: s.csrf } : { authenticated: false }); }
    if (path === '/api/auth/logout' && allowedMethod(request, ['POST'])) { if (!safeOrigin(request, env)) return error(403, 'Forbidden.'); const s = await session(request, env); if (!s || request.headers.get('x-csrf-token') !== s.csrf) return error(403, 'Forbidden.'); return new Response(JSON.stringify({ ok: true }), { status: 200, headers: headers({ 'content-type': 'application/json', 'set-cookie': clearCookie(SESSION_COOKIE) }) }); }
    if (path === '/api/content' && allowedMethod(request, ['GET'])) return content(request, env);
    if (path === '/api/publish' && allowedMethod(request, ['POST'])) return publish(request, env);
    if (['/api/auth/login','/api/auth/callback','/api/session','/api/auth/logout','/api/content','/api/publish'].includes(path)) return reply({ error: 'Method not allowed.' }, 405, { allow: path.includes('login') || path.includes('callback') || path === '/api/session' || path === '/api/content' ? 'GET' : 'POST' });
    return reply({ error: 'Not found.' }, 404);
  } catch { return error(500, 'Invalid request.'); }
} };
