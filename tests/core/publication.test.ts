import { describe, expect, it } from 'vitest';
import { demo } from './support';
import { preparePublication, validateSite } from '../../packages/core/src/index';

describe('publication coverage', () => {
  it('generates 400 campus-local days and preserves uploaded rows', () => {
    const site: any = demo();
    site.campuses[0].timetable = [{
      date: '2026-10-02', fajr: '05:01', sunrise: '06:30', dhuhr: '12:30', asr: '15:30', maghrib: '18:00', isha: '19:30', source: 'uploaded',
    }];
    const published = preparePublication(validateSite(site), new Date('2026-10-01T23:00:00Z'), 400);
    expect(published.campuses[0].timetable).toHaveLength(400);
    expect(published.campuses[0].timetable.find((row) => row.date === '2026-10-02')?.fajr).toBe('05:01');
    expect(published.campuses[0].timetable.every((row) => row.source)).toBe(true);
  });
});
