import { describe, expect, it } from 'vitest';
import { campusEvents, campusAnnouncements, getNextPrayer, getPrayerTiming, resolveCampusId, safeAssetUrl, resolveAssetUrl } from '../../apps/web/src/lib/site';

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
  it('returns an exact second-precision countdown to the next prayer', () => {
    const rows = [{ date: '2026-10-07', fajr: '05:43', sunrise: '06:58', dhuhr: '12:45', asr: '15:56', maghrib: '18:30', isha: '19:45' }];
    const timing = getPrayerTiming(rows, 'America/New_York', new Date('2026-10-07T16:44:55Z'));
    expect(timing).toMatchObject({ currentKey: 'fajr', nextKey: 'dhuhr', nextTime: '12:45', nextDate: '2026-10-07', countdownSeconds: 5 });
  });
  it('rolls the next prayer to tomorrow’s timetable row after Isha', () => {
    const rows = [
      { date: '2026-10-07', fajr: '05:43', sunrise: '06:58', dhuhr: '12:45', asr: '15:56', maghrib: '18:30', isha: '19:45' },
      { date: '2026-10-08', fajr: '05:44', sunrise: '06:59', dhuhr: '12:45', asr: '15:55', maghrib: '18:28', isha: '19:43' },
    ];
    const timing = getPrayerTiming(rows, 'America/New_York', new Date('2026-10-08T00:00:00Z'));
    expect(timing).toMatchObject({ currentKey: 'isha', nextKey: 'fajr', nextTime: '05:44', nextDate: '2026-10-08', countdownSeconds: 35040 });
  });
  it('returns unavailable when the published schedule has no future prayer', () => {
    const rows = [{ date: '2026-10-07', fajr: '05:43', sunrise: '06:58', dhuhr: '12:45', asr: '15:56', maghrib: '18:30', isha: '19:45' }];
    expect(getPrayerTiming(rows, 'America/New_York', new Date('2026-10-08T00:00:00Z'))).toBeNull();
    expect(getPrayerTiming(rows, 'America/New_York', new Date('2026-10-08T16:00:00Z'))).toBeNull();
  });
  it('sorts timetable rows before selecting the earliest future prayer', () => {
    const rows = [
      { date: '2026-10-09', fajr: '05:45', sunrise: '07:00', dhuhr: '12:45', asr: '15:54', maghrib: '18:27', isha: '19:42' },
      { date: '2026-10-08', fajr: '05:44', sunrise: '06:59', dhuhr: '12:45', asr: '15:55', maghrib: '18:28', isha: '19:43' },
    ];
    expect(getPrayerTiming(rows, 'America/New_York', new Date('2026-10-08T08:00:00Z'))).toMatchObject({ nextKey: 'fajr', nextDate: '2026-10-08', nextTime: '05:44' });
  });
  it('uses the later occurrence of an ambiguous wall time during the DST fold', () => {
    const rows = [{ date: '2026-11-01', fajr: '01:30', sunrise: '07:28', dhuhr: '11:40', asr: '14:28', maghrib: '16:50', isha: '18:08' }];
    expect(getPrayerTiming(rows, 'America/New_York', new Date('2026-11-01T06:15:00Z'))).toMatchObject({ nextKey: 'fajr', nextTime: '01:30', countdownSeconds: 900 });
  });
  it('permits safe relative and HTTPS media URLs', () => {
    expect(safeAssetUrl('assets/logo.svg')).toBe('/assets/logo.svg');
    expect(safeAssetUrl('https://cdn.example.org/masjid/logo.png')).toBe('https://cdn.example.org/masjid/logo.png');
    expect(safeAssetUrl('https://cdn.example.org/masjid/logo')).toBe('https://cdn.example.org/masjid/logo');
    expect(safeAssetUrl('https://user:pass@cdn.example.org/logo.png')).toBe('');
    expect(safeAssetUrl('javascript:alert(1)')).toBe('');
    expect(resolveAssetUrl('assets/logo.svg', '/mosque/')).toBe('/mosque/assets/logo.svg');
    expect(resolveAssetUrl('https://cdn.example.org/logo.svg', '/mosque/')).toBe('https://cdn.example.org/logo.svg');
    expect(resolveAssetUrl('https://cdn.example.org/logo', '/mosque/')).toBe('https://cdn.example.org/logo');
  });
});
