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
export function getNextPrayer(row: PrayerRow, current: string) {
  const keys: PrayerKey[] = ['fajr','dhuhr','asr','maghrib','isha'];
  const next = keys.find((key) => row[key] > current) ?? 'fajr';
  return { key: next, time: row[next] };
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
export function localTime(timeZone: string, date = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}
export function localDate(timeZone: string, date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
