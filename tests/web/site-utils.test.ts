import { describe, expect, it } from 'vitest';
import { campusEvents, campusAnnouncements, getNextPrayer, resolveCampusId, safeAssetUrl } from '../../apps/web/src/lib/site';

const site = {
  campuses: [{ id: 'north', timezone: 'America/New_York' }, { id: 'south', timezone: 'America/Chicago' }],
  events: [{ id: 'all', campusIds: [], startsAt: '2026-10-04T10:00:00-04:00' }, { id: 'north-only', campusIds: ['north'], startsAt: '2026-10-05T10:00:00-04:00' }],
  announcements: [{ id: 'all-news', campusIds: [] }, { id: 'south-news', campusIds: ['south'] }],
};

describe('site runtime helpers', () => {
  it('resolves URL campus first and remembers only valid campus ids', () => {
    expect(resolveCampusId(site, 'south', 'north')).toBe('south');
    expect(resolveCampusId(site, 'invalid', 'north')).toBe('north');
    expect(resolveCampusId(site, undefined, 'missing')).toBe('north');
  });
  it('includes global content and filters targeted and expired content', () => {
    const withExpiry = { ...site, announcements: [...site.announcements, { id: 'expired', campusIds: [], publishedAt: '2026-01-01T00:00:00Z', expiresAt: '2026-02-01T00:00:00Z' }, { id: 'future', campusIds: [], publishedAt: '2027-01-01T00:00:00Z', expiresAt: null }] };
    expect(campusEvents(site, 'north').map((x) => x.id)).toEqual(['all', 'north-only']);
    expect(campusAnnouncements(withExpiry, 'north', new Date('2026-10-01T00:00:00Z')).map((x) => x.id)).toEqual(['all-news']);
  });
  it('selects the next prayer after the current local time', () => {
    expect(getNextPrayer({ fajr: '05:00', sunrise: '06:30', dhuhr: '13:00', asr: '16:00', maghrib: '19:00', isha: '21:00' }, '15:00')?.key).toBe('asr');
    expect(getNextPrayer({ fajr: '05:00', sunrise: '06:30', dhuhr: '13:00', asr: '16:00', maghrib: '19:00', isha: '21:00' }, '22:00')?.key).toBe('fajr');
  });
  it('only permits safe relative media paths', () => {
    expect(safeAssetUrl('assets/logo.svg')).toBe('/assets/logo.svg');
    expect(safeAssetUrl('javascript:alert(1)')).toBe('');
  });
});
