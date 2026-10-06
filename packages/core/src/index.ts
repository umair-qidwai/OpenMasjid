import { z } from 'zod';
export { localDateISO, getPrayerDay, getCampusEvents, getCampusAnnouncements, preparePublication, importTimetableCSV } from './prayers';
export { inspectLogoImage, MAX_LOGO_BYTES, MAX_LOGO_DIMENSION, MAX_LOGO_PIXELS } from './image';

export const MAX_CONTENT_BYTES = 1024 * 1024;
const text = (max: number) => z.string().trim().min(1).max(max);
const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64);
export const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
 const d = new Date(`${s}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s && s >= '1900-01-01' && s <= '2200-12-31';
}, 'Invalid calendar date (supported years 1900–2200)');
export const TimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const timestamp = z.string().max(40).datetime({offset:true}).refine(s => DateSchema.safeParse(s.slice(0,10)).success && Number.isFinite(Date.parse(s)), 'Invalid timestamp');
const https = z.string().max(2048).url().refine(s => { try { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password && !/[\s\\]/.test(s); } catch { return false; } }, 'HTTPS URL required');
const logo = z.union([https, z.string().min(1).max(512).refine(s => /^\/?[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:svg|png|webp|jpg|jpeg|avif)$/i.test(s), 'Safe relative image path required')]);
const email = z.string().max(254).email();
const phone = text(40);
const timezone = text(100).refine(s => { try { new Intl.DateTimeFormat('en', {timeZone:s}); return true; } catch { return false; } }, 'Invalid IANA timezone');
export const IqamahSchema = z.object({fajr:TimeSchema,dhuhr:TimeSchema,asr:TimeSchema,maghrib:TimeSchema,isha:TimeSchema}).strict();
export const PrayerDaySchema = z.object({date:DateSchema,fajr:TimeSchema,sunrise:TimeSchema,dhuhr:TimeSchema,asr:TimeSchema,maghrib:TimeSchema,isha:TimeSchema,iqamah:IqamahSchema.optional(),source:z.enum(['calculated','uploaded']).optional()}).strict();
export const CampusSchema = z.object({
 id,name:text(160),address:text(500),city:text(120),timezone,latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180),phone,email,
 facilities:z.array(text(100)).max(40),calculation:z.object({method:z.enum(['NorthAmerica','MuslimWorldLeague','Egyptian','Karachi','UmmAlQura','Dubai','MoonsightingCommittee']),madhab:z.enum(['Shafi','Hanafi'])}).strict(),
 iqamah:IqamahSchema,jumuah:z.array(z.object({label:text(100),time:TimeSchema}).strict()).max(10),timetable:z.array(PrayerDaySchema).max(1500)
}).strict();
const campusIds = z.array(id).max(20).refine(a => new Set(a).size === a.length, 'Duplicate campus references');
export const DetailsSchema = z.object({enabled:z.boolean(),content:z.string().max(50000),image:z.union([z.literal(''),logo]).default('')}).strict().superRefine((details,ctx) => {
 if (details.enabled && details.content.trim().length === 0) ctx.addIssue({code:z.ZodIssueCode.custom,path:['content'],message:'Details page content is required when enabled'});
}).default({enabled:false,content:'',image:''});
export const ProgramSchema = z.object({id,title:text(200),description:text(10000),campusIds,details:DetailsSchema}).strict();
export const ServiceSchema = ProgramSchema;
export const EventSchema = z.object({id,title:text(200),description:text(10000),startsAt:timestamp,endsAt:timestamp,campusIds,location:text(300),category:text(80)}).strict().refine(e => Date.parse(e.endsAt) > Date.parse(e.startsAt), 'Event must end after it starts');
export const AnnouncementSchema = z.object({id,title:text(200),body:text(10000),campusIds,publishedAt:timestamp,expiresAt:timestamp.nullable()}).strict().refine(a => a.expiresAt === null || Date.parse(a.expiresAt) > Date.parse(a.publishedAt), 'Expiry must follow publication');
export const DonationSchema = z.object({
 mode:z.enum(['none','external','custom']),externalUrl:https.nullable(),customHtml:z.string().max(100000)
}).strict().superRefine((donation,ctx) => {
 const issue = (path:string, message:string) => ctx.addIssue({code:z.ZodIssueCode.custom,path:[path],message});
 if (donation.mode === 'none' && (donation.externalUrl !== null || donation.customHtml !== '')) issue('mode','Disabled donation configuration must be empty');
 if (donation.mode === 'external' && (donation.externalUrl === null || donation.customHtml !== '')) issue('externalUrl','External donation mode requires only an HTTPS URL');
 if (donation.mode === 'custom' && (donation.externalUrl !== null || donation.customHtml.trim().length === 0)) issue('customHtml','Custom donation mode requires only non-empty HTML');
}).default({mode:'none',externalUrl:null,customHtml:''});
export const SiteSchema = z.object({schemaVersion:z.literal(1),updatedAt:timestamp,organization:z.object({name:text(200),tagline:text(300),description:text(20000),email,phone,website:https,logo,theme:z.object({accent:z.string().regex(/^#[\da-fA-F]{6}$/),background:z.string().regex(/^#[\da-fA-F]{6}$/)}).strict()}).strict(),donation:DonationSchema,campuses:z.array(CampusSchema).min(1).max(20),events:z.array(EventSchema).max(500),announcements:z.array(AnnouncementSchema).max(500),programs:z.array(ProgramSchema).max(500).default([]),services:z.array(ServiceSchema).max(500).default([])}).strict().superRefine((s,ctx) => {
 const issue = (path:(string|number)[], message:string) => ctx.addIssue({code:z.ZodIssueCode.custom,path,message});
 for (const collection of ['campuses','events','announcements','programs','services'] as const) { const seen = new Set<string>(); s[collection].forEach((v,i) => { if(seen.has(v.id)) issue([collection,i,'id'],'Duplicate ID'); seen.add(v.id); }); }
 const ids = new Set(s.campuses.map(c => c.id));
 for (const collection of ['events','announcements','programs','services'] as const) s[collection].forEach((v,i) => v.campusIds.forEach((ref,j) => { if(!ids.has(ref)) issue([collection,i,'campusIds',j],'Unknown campus'); }));
 s.campuses.forEach((c,i) => { const dates = new Set<string>(); c.timetable.forEach((d,j) => {if(dates.has(d.date)) issue(['campuses',i,'timetable',j,'date'],'Duplicate timetable date'); dates.add(d.date);}); });
 if (new TextEncoder().encode(JSON.stringify(s)).byteLength > MAX_CONTENT_BYTES) issue([], 'Content exceeds 1 MiB');
});
export type Site = z.infer<typeof SiteSchema>;
export type Campus = z.infer<typeof CampusSchema>;
export type PrayerDay = z.infer<typeof PrayerDaySchema>;
export type Event = z.infer<typeof EventSchema>;
export type Program = z.infer<typeof ProgramSchema>;
export type Service = z.infer<typeof ServiceSchema>;
export type Announcement = z.infer<typeof AnnouncementSchema>;
export function validateSite(value:unknown): Site {
 const serialized = JSON.stringify(value);
 if (!serialized || new TextEncoder().encode(serialized).byteLength > MAX_CONTENT_BYTES) throw new Error('Content exceeds 1 MiB or is not JSON');
 return SiteSchema.parse(value);
}
