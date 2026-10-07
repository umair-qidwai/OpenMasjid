export type PrayerKey = 'fajr'|'sunrise'|'dhuhr'|'asr'|'maghrib'|'isha';
export type PrayerRow = Record<PrayerKey, string> & { date?: string; iqamah?: Partial<Record<PrayerKey, string>> };
export type CampusLike = { id: string; timezone: string };
export type SiteLike = { campuses: CampusLike[]; events: any[]; announcements: any[] };

export function resolveCampusId(site: SiteLike, requested?: string, remembered?: string) {
  const valid = new Set(site.campuses.map((c) => c.id));
  return (requested && valid.has(requested) ? requested : remembered && valid.has(remembered) ? remembered : site.campuses[0]?.id ?? '');
}
export function campusEvents<T extends { campusIds: string[] }>(site: SiteLike & { events: T[] }, campusId: string) {
  return site.events.filter((event) => event.campusIds.length === 0 || event.campusIds.includes(campusId));
}
export function campusAnnouncements<T extends { campusIds: string[]; publishedAt?: string; expiresAt?: string | null }>(site: SiteLike & { announcements: T[] }, campusId: string, now = new Date()) {
  const nowMs = now.getTime();
  return site.announcements.filter((item) => {
    if (item.campusIds.length && !item.campusIds.includes(campusId)) return false;
    if (!item.publishedAt) return true;
    const published = Date.parse(item.publishedAt);
    const expires = item.expiresAt ? Date.parse(item.expiresAt) : Number.POSITIVE_INFINITY;
    return published <= nowMs && nowMs < expires;
  });
}
export const prayerKeys: PrayerKey[] = ['fajr','sunrise','dhuhr','asr','maghrib','isha'];
export const salahKeys: PrayerKey[] = ['fajr','dhuhr','asr','maghrib','isha'];

export function getNextPrayer(row: PrayerRow, current: string) {
  const next = salahKeys.find((key) => row[key] > current) ?? 'fajr';
  return { key: next, time: row[next] };
}

const zonedPartFormatters = new Map<string, Intl.DateTimeFormat>();

function zonedParts(timeZone: string, date: Date) {
  let formatter = zonedPartFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    zonedPartFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  return Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, Number(value)]));
}

function zonedDateTime(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  const candidates = new Set<number>();
  for (let offsetHours = -36; offsetHours <= 36; offsetHours += 6) {
    const probe = wallTime + offsetHours * 3_600_000;
    const parts = zonedParts(timeZone, new Date(probe));
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const candidate = wallTime - (represented - probe);
    const actual = zonedParts(timeZone, new Date(candidate));
    if (actual.year === year && actual.month === month && actual.day === day && actual.hour === hour && actual.minute === minute) candidates.add(candidate);
  }
  if (!candidates.size) return null;
  // During a fall-back fold, use the later occurrence consistently.
  return new Date(Math.max(...candidates));
}

type DatedPrayerRow = PrayerRow & { date: string };
type PrayerEvent = { key: PrayerKey; time: string; date: string; instant: number };
const sortedRowCache = new WeakMap<PrayerRow[], DatedPrayerRow[]>();
const rowEventCache = new WeakMap<PrayerRow, Map<string, PrayerEvent[]>>();

function sortedPrayerRows(rows: PrayerRow[]) {
  let sorted = sortedRowCache.get(rows);
  if (!sorted) {
    sorted = rows.filter((row): row is DatedPrayerRow => Boolean(row.date)).sort((a, b) => a.date.localeCompare(b.date));
    sortedRowCache.set(rows, sorted);
  }
  return sorted;
}

function prayerEvents(row: DatedPrayerRow, timeZone: string) {
  let byTimeZone = rowEventCache.get(row);
  if (!byTimeZone) { byTimeZone = new Map(); rowEventCache.set(row, byTimeZone); }
  let events = byTimeZone.get(timeZone);
  if (!events) {
    events = salahKeys.flatMap((key) => {
      const instant = zonedDateTime(row.date, row[key], timeZone);
      return instant ? [{ key, time: row[key], date: row.date, instant: instant.getTime() }] : [];
    }).sort((a, b) => a.instant - b.instant);
    byTimeZone.set(timeZone, events);
  }
  return events;
}

export function getPrayerTiming(rows: PrayerRow[], timeZone: string, now = new Date()) {
  const datedRows = sortedPrayerRows(rows);
  const date = localDate(timeZone, now);
  const insertion = datedRows.findIndex((row) => row.date >= date);
  const start = insertion < 0 ? datedRows.length - 1 : Math.max(0, insertion - 1);
  const end = insertion < 0 ? datedRows.length : Math.min(datedRows.length, insertion + 2);
  const events = datedRows.slice(start, end).flatMap((row) => prayerEvents(row, timeZone)).sort((a, b) => a.instant - b.instant);
  const nowMs = now.getTime();
  const next = events.find((event) => event.instant > nowMs);
  if (!next) return null;
  const current = [...events].reverse().find((event) => event.instant <= nowMs);
  return {
    currentKey: current?.key ?? 'isha',
    nextKey: next.key,
    nextTime: next.time,
    nextDate: next.date,
    countdownSeconds: Math.floor((next.instant - nowMs) / 1000),
  };
}

export function formatPrayerCountdown(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':');
}
export function safeAssetUrl(value: string) {
  if (/^\/?[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:svg|png|webp|jpg|jpeg|avif)$/i.test(value)) return `/${value.replace(/^\//, '')}`;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !/[\s\\]/.test(value) ? url.href : '';
  } catch { return ''; }
}
export function resolveAssetUrl(value: string, basePath: string, fallback = 'assets/logo.svg') {
  const safe = safeAssetUrl(value);
  if (/^https:\/\//i.test(safe)) return safe;
  return `${basePath}${(safe || fallback).replace(/^\//, '')}`;
}
export function resolveTabLogo(site: { organization: { logo: string; tabLogo?: string; tabLogoDark?: string; sameLogoEverywhere?: boolean } }, basePath: string, dark = false) {
  const value = site.organization.sameLogoEverywhere ? site.organization.logo : (dark ? site.organization.tabLogoDark : site.organization.tabLogo) || site.organization.logo;
  return resolveAssetUrl(value, basePath);
}
export function localTime(timeZone: string, date = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}
export function localDate(timeZone: string, date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
