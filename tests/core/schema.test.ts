import { describe, expect, it } from 'vitest';
import { validateSite, SiteSchema } from '../../packages/core/src/index';
import { demo } from './support';

describe('strict site validation', () => {
  it('accepts a fictional two-campus document', () => {
    expect(validateSite(demo()).campuses).toHaveLength(2);
    expect(SiteSchema.safeParse(demo()).success).toBe(true);
  });
  it('defaults donation to disabled for existing schema-v1 documents', () => {
    const existing: any = demo();
    delete existing.donation;
    expect(validateSite(existing).donation).toEqual({ mode: 'none', externalUrl: null, customHtml: '' });
  });
  it('accepts one coherent donation mode and rejects unsafe or conflicting configuration', () => {
    const external: any = demo();
    external.donation = { mode: 'external', externalUrl: 'https://give.example.org/openmasjid', customHtml: '' };
    expect(validateSite(external).donation.mode).toBe('external');
    external.donation.externalUrl = 'http://give.example.org';
    expect(() => validateSite(external)).toThrow();

    const custom: any = demo();
    custom.donation = { mode: 'custom', externalUrl: null, customHtml: '<form><button>Donate securely</button></form>' };
    expect(validateSite(custom).donation.mode).toBe('custom');
    custom.donation.externalUrl = 'https://give.example.org';
    expect(() => validateSite(custom)).toThrow();
  });
  it.each([
    ['unknown field', (s:any) => { s.organization.script = 'x'; }],
    ['unsafe website', (s:any) => { s.organization.website = 'javascript:alert(1)'; }],
    ['unsafe logo', (s:any) => { s.organization.logo = '//evil.test/logo.svg'; }],
    ['path traversal', (s:any) => { s.organization.logo = '/assets/../evil.svg'; }],
    ['invalid timezone', (s:any) => { s.campuses[0].timezone = 'Mars/Olympus'; }],
    ['invalid coordinates', (s:any) => { s.campuses[0].latitude = 91; }],
    ['invalid clock', (s:any) => { s.campuses[0].iqamah.fajr = '24:00'; }],
    ['duplicate campus', (s:any) => { s.campuses[1].id = s.campuses[0].id; }],
    ['unsafe id', (s:any) => { s.campuses[0].id = '../x'; }],
    ['unknown reference', (s:any) => { s.events[0].campusIds = ['missing']; }],
    ['duplicate reference', (s:any) => { s.events[0].campusIds = ['garden','garden']; }],
    ['event reversed', (s:any) => { s.events[0].endsAt = '2026-01-01T00:00:00Z'; }],
    ['invalid calendar date', (s:any) => { s.events[0].startsAt = '2026-02-30T10:00:00Z'; }],
    ['no offset', (s:any) => { s.events[0].startsAt = '2026-10-02T10:00:00'; }],
    ['no campuses', (s:any) => { s.campuses = []; }],
    ['oversize text', (s:any) => { s.organization.description = 'x'.repeat(20001); }],
  ])('rejects %s', (_label, mutate) => { const s = demo(); mutate(s); expect(() => validateSite(s)).toThrow(); });
});
