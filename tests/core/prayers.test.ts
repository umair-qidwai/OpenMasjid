import {describe,it,expect} from 'vitest';
import * as core from '../../packages/core/src/index';
import {demo} from './support';
describe('campus prayer and publishing helpers',()=>{
 it('uses campus local calendar date around UTC midnight',()=>{expect(core.localDateISO(new Date('2026-10-02T01:00:00Z'),'America/Toronto')).toBe('2026-10-01')});
 it('calculates today with uploaded rows taking precedence',()=>{const site=core.validateSite(demo());const row=core.getPrayerDay(site,'garden','2026-10-01');expect(row?.fajr).toMatch(/^\d\d:\d\d$/);site.campuses[0].timetable=[{...row!,fajr:'05:01',source:'uploaded'}];expect(core.getPrayerDay(site,'garden','2026-10-01')?.fajr).toBe('05:01')});
 it('filters campus and global content',()=>{const s=core.validateSite(demo());s.events.push({...s.events[0],id:'private-campus',campusIds:['riverside']});expect(core.getCampusEvents(s,'garden')).toHaveLength(1)});
 it('imports strict CSV and rejects malformed/duplicate days',()=>{const csv='date,fajr,sunrise,dhuhr,asr,maghrib,isha\n2026-10-01,05:00,06:30,12:30,15:30,18:00,19:30';expect(core.importTimetableCSV(csv)[0].source).toBe('uploaded');expect(()=>core.importTimetableCSV(csv+'\n2026-10-01,05:00,06:30,12:30,15:30,18:00,19:30')).toThrow();expect(()=>core.importTimetableCSV(csv.replace('2026-10-01','2026-02-30'))).toThrow()});
 it('generates requested coverage without changing uploaded days',()=>{const s=core.validateSite(demo());const published=core.preparePublication(s,new Date('2026-10-01T12:00:00Z'),3);expect(published.campuses[0].timetable).toHaveLength(3);expect(s.campuses[0].timetable).toHaveLength(0)});
});
