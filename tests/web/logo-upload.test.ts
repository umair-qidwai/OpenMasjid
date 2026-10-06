import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareLogoUpload, publishDraft } from '../../apps/web/src/lib/admin.js';
import { site } from '../publisher/fixture';

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgaGD4DwAChAGA+gVWHQAAAABJRU5ErkJggg==', 'base64'));

describe('admin logo uploads', () => {
  afterEach(() => vi.restoreAllMocks());
  it('prepares a validated PNG for the publisher without trusting the filename', async () => {
    const upload = await prepareLogoUpload(new File([png], 'logo.exe', { type: 'application/octet-stream' }));
    expect(upload.mediaType).toBe('image/png');
    expect(upload.content).toBe(Buffer.from(png).toString('base64'));
    expect(upload.previewUrl).toMatch(/^blob:/);
  });

  it('rejects unsupported or oversized files', async () => {
    await expect(prepareLogoUpload(new File(['not an image'], 'logo.png', { type: 'image/png' }))).rejects.toThrow('PNG, JPEG, or WebP');
    await expect(prepareLogoUpload(new File([Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])], 'truncated.png', { type: 'image/png' }))).rejects.toThrow('valid');
    await expect(prepareLogoUpload(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))).rejects.toThrow('2 MiB');
  });

  it('keeps a previously prepared logo usable after a later invalid file', async () => {
    const first = await prepareLogoUpload(new File([png], 'valid.png', { type: 'image/png' }));
    await expect(prepareLogoUpload(new File(['bad'], 'bad.png', { type: 'image/png' }))).rejects.toThrow();
    expect(first.previewUrl).toMatch(/^blob:/);
  });

  it('publishes a pending logo and adopts the committed asset path', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      if (url.endsWith('/session')) return Response.json({ authenticated: true, csrfToken: 'csrf' });
      if (url.endsWith('/content')) return Response.json({ sha: 'content-sha', content: site });
      return Response.json({ status: 'committed', assetPath: 'assets/uploads/organization-logo-abc.png' });
    }));
    const state = { content: structuredClone(site), dirty: true };
    const message = { textContent: '' };
    const form = { querySelectorAll: () => [] };
    const upload = { mediaType: 'image/png', content: 'aW1hZ2U=', previewUrl: 'blob:test' };

    await publishDraft(state, message, form, upload);

    const body = JSON.parse(String(requests[2].init?.body));
    expect(body.logoUpload).toEqual({ mediaType: 'image/png', content: 'aW1hZ2U=' });
    expect(state.content.organization.logo).toBe('assets/uploads/organization-logo-abc.png');
    expect(message.textContent).toContain('Committed');
  });
});
