import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from 'adhan';
import { DateSchema, PrayerDaySchema, type Site, type PrayerDay, type Campus, validateSite } from './index';

export function localDateISO(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
  const get = (key:string) => parts.find(p=>p.type===key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
const calculationCache = new Map<string, ReturnType<typeof CalculationMethod.NorthAmerica>>();
const formatterCache = new Map<string, Intl.DateTimeFormat>();
function calculatedDay(campus: Campus, date: string): PrayerDay {
  const [year,month,day] = DateSchema.parse(date).split('-').map(Number);
  const calculationKey = `${campus.calculation.method}:${campus.calculation.madhab}`;
  let params = calculationCache.get(calculationKey);
  if (!params) {
    params = CalculationMethod[campus.calculation.method]();
    params.madhab = campus.calculation.madhab === 'Hanafi' ? Madhab.Hanafi : Madhab.Shafi;
    calculationCache.set(calculationKey, params);
  }
  const formatterKey = campus.timezone;
  let formatter = formatterCache.get(formatterKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB',{timeZone:campus.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    formatterCache.set(formatterKey, formatter);
  }
  const times = new PrayerTimes(new Coordinates(campus.latitude,campus.longitude),new Date(Date.UTC(year,month-1,day)),params);
  const format = (time:Date) => formatter!.format(time);
  return PrayerDaySchema.parse({date,source:'calculated',fajr:format(times.fajr),sunrise:format(times.sunrise),dhuhr:format(times.dhuhr),asr:format(times.asr),maghrib:format(times.maghrib),isha:format(times.isha)});
}
export function getPrayerDay(site:Site,campusId:string,date:string): PrayerDay | undefined {
  DateSchema.parse(date);
  const campus = site.campuses.find(c=>c.id===campusId);
  if(!campus) return undefined;
  const uploaded = campus.timetable.find(t=>t.date===date);
  if(uploaded) return uploaded;
  try { return calculatedDay(campus,date); } catch { return undefined; }
}
export function getCampusEvents(site:Site,campusId:string) {
  return site.events.filter(e=>!e.campusIds.length || e.campusIds.includes(campusId)).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
}
export function getCampusAnnouncements(site:Site,campusId:string) {
  return site.announcements.filter(e=>!e.campusIds.length || e.campusIds.includes(campusId)).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
}
export function preparePublication(input:Site,now=new Date(),days=400):Site {
  if(!Number.isInteger(days)||days<1||days>730) throw new Error('Coverage must be 1–730 days');
  const site = structuredClone(validateSite(input));
  for(const campus of site.campuses) {
    const rows = new Map(campus.timetable.filter(r=>r.source!=='calculated').map(r=>[r.date,r]));
    const first = localDateISO(now,campus.timezone);
    for(let n=0;n<days;n++) {
      const d=new Date(`${first}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);const date=d.toISOString().slice(0,10);
      if(!rows.has(date)) {
        try { rows.set(date,calculatedDay(campus,date)); }
        catch { throw new Error(`Cannot calculate ${campus.id} on ${date}. Supply an approved timetable for this location/date.`); }
      }
    }
    campus.timetable=[...rows.values()].sort((a,b)=>a.date.localeCompare(b.date));
  }
  return validateSite(site);
}
/** Deliberately narrow CSV format: timetable values need no quoting or embedded commas. */
export function importTimetableCSV(csv:string):PrayerDay[] {
  if(new TextEncoder().encode(csv).byteLength>1024*1024) throw new Error('CSV exceeds 1 MiB');
  const lines=csv.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  const required=['date','fajr','sunrise','dhuhr','asr','maghrib','isha'];
  const optional=['iqamah_fajr','iqamah_dhuhr','iqamah_asr','iqamah_maghrib','iqamah_isha'];
  const header=lines.shift()!.split(',').map(s=>s.trim());
  if(new Set(header).size!==header.length || required.some(k=>!header.includes(k)) || header.some(k=>![...required,...optional].includes(k))) throw new Error('Invalid CSV headers');
  const count=optional.filter(k=>header.includes(k)).length;
  if(count!==0&&count!==5) throw new Error('Provide all five iqamah columns or none');
  if(!lines.length || lines.length>1500) throw new Error('CSV requires 1–1500 rows');
  const seen=new Set<string>();
  return lines.map((line,index)=>{
    const cells=line.split(',').map(s=>s.trim().replace(/^"([^"\r\n]*)"$/,'$1'));
    if(cells.length!==header.length) throw new Error(`Wrong column count at row ${index+2}`);
    const values=Object.fromEntries(header.map((h,n)=>[h,cells[n]]));
    const row:Record<string,unknown>={source:'uploaded'};
    for(const k of required) row[k]=values[k];
    if(count) row.iqamah=Object.fromEntries(optional.map(k=>[k.slice(7),values[k]]));
    const parsed=PrayerDaySchema.parse(row);
    if(seen.has(parsed.date)) throw new Error(`Duplicate date ${parsed.date}`);
    seen.add(parsed.date);return parsed;
  }).sort((a,b)=>a.date.localeCompare(b.date));
}
