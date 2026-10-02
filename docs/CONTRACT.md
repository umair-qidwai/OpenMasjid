# OpenMasjid v1 implementation contract

This is the agreed interface for the parallel implementation. Source of truth is `content/site.json`. Public endpoint is `data/v1/site.json` relative to deployed website base. This single content document permits atomic GitHub commits and conflict detection. Published document has same shape, plus generated timetables; no secret data.

TypeScript shared package: `@openmasjid/core`, exports `SiteSchema`, `validateSite(value)` (returns parsed Site or throws), `type Site`, `type Campus`, `type PrayerDay`, `type Event`, `type Announcement`, `getPrayerDay(site,campusId,dateISO)`, `localDateISO(now,timeZone)`, `getCampusEvents(site,campusId)` and `getCampusAnnouncements(site,campusId)`. Use Zod. Public constructors/types must match schema below. Avoid importing core from Swift/Kotlin: implement Codable/kotlinx.serialization models matching JSON.

```ts
interface Site {
 schemaVersion: 1;
 updatedAt: string; // ISO timestamp
 organization: { name: string; tagline: string; description: string; email: string; phone: string; website: string; logo: string; theme: { accent: string; background: string }; };
 campuses: Campus[];
 events: Event[];
 announcements: Announcement[];
}
interface Campus {
 id: string; name: string; address: string; city: string; timezone: string;
 latitude: number; longitude: number; phone: string; email: string;
 facilities: string[];
 calculation: { method: 'NorthAmerica'|'MuslimWorldLeague'|'Egyptian'|'Karachi'|'UmmAlQura'|'Dubai'|'MoonsightingCommittee'; madhab: 'Shafi'|'Hanafi'; };
 iqamah: { fajr:string; dhuhr:string; asr:string; maghrib:string; isha:string; }; // HH:mm, fixed schedule; explicit timetable overrides take precedence
 jumuah: { label:string; time:string; }[];
 timetable: PrayerDay[];
}
interface PrayerDay {
 date:string; // YYYY-MM-DD campus-local
 fajr:string; sunrise:string; dhuhr:string; asr:string; maghrib:string; isha:string; // HH:mm campus-local
 iqamah?: { fajr:string; dhuhr:string; asr:string; maghrib:string; isha:string; };
 source?: 'calculated'|'uploaded';
}
interface Event { id:string; title:string; description:string; startsAt:string; endsAt:string; campusIds:string[]; location:string; category:string; } // campusIds [] means all campuses; RFC3339 timestamps with offset
interface Announcement { id:string; title:string; body:string; campusIds:string[]; publishedAt:string; expiresAt:string|null; }
```

IDs lower-case safe slugs max 64; unique globally within entity collections. Reject unknown fields (schema strict). Validate timestamps, real calendar dates, HH:mm, timezones, hex colors, HTTPS website/logo URLs (logo may be safe root/base-relative asset path), email/phone lengths; no HTML rendering of content. Reject arbitrary executable URL schemes. Limit content payload 1 MiB and bounded arrays/strings. At least one campus required; all referenced campus IDs exist.

`tools/publish-content.ts`: validate source, generate missing prayer rows from adhan calculation for current date through at least the next 365 days (preserve uploaded rows), write public copy `apps/web/public/data/v1/site.json`. Template sample organization/campuses MUST be explicitly labeled fictional demo, not represent live mosque data. CSV import header date,fajr,sunrise,dhuhr,asr,maghrib,isha and optional iqamah_fajr,iqamah_dhuhr,iqamah_asr,iqamah_maghrib,iqamah_isha. Reject invalid/duplicate dates atomically.

## Publisher API (same-origin recommended)

Worker owns auth routes. Configure trusted exact APP_ORIGIN and server-side GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, GITHUB_INSTALLATION_ID, GITHUB_APP_ID, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_PRIVATE_KEY and SESSION_SECRET. No arbitrary browser-specified repo/path/branch. Content file fixed `content/site.json`. One configured repository per publisher in v1 (do not claim multi-tenant hosting). Official app can be installed by many mosques, but a shared publisher needs explicit per-tenant authorization and is future scope.

GET /api/auth/login -> GitHub App user OAuth redirect; GET /api/auth/callback -> session then /admin/.
GET /api/session -> `{ authenticated:boolean, user?:{login:string,avatarUrl?:string}, csrfToken?:string }`.
POST /api/auth/logout -> clears session; CSRF required.
GET /api/content -> `{ content:Site, sha:string }` for authorized editor, never public draft read.
POST /api/publish body `{ content: Site, sha: string }` -> `{ commitSha:string, commitUrl:string, status:'committed' }`; requires exact Origin + session-bound X-CSRF-Token. 409 stale SHA. 400 invalid, 401 unauthenticated, 403 unauthorized, 503 unconfigured. GitHub-backed authorization checks repository push permission on login AND privileged calls; app installation token limited to configured repo and Contents:write. Private key/token never in client. Sessions encrypted with authenticated encryption; Secure HttpOnly SameSite cookie; state bound to browser, expiring, PKCE if supported. Signed/encrypted state cannot substitute for CSRF binding. Short-lived sessions and generic errors. No arbitrary redirects.

Static admin at /admin/ uses PUBLIC_PUBLISHER_URL optional absolute origin config; default same-origin `/api/`. The recommended Cloudflare deployment bundles static assets and the publisher in one Worker, with `/api/*` routed Worker-first. For cross-origin helpers exact allowed origin and credentials CORS needed; no wildcard. No fake successful publishing in demo mode. In unconfigured mode give setup instructions, content editor can offer explicit local import/export but cannot pretend to save remotely.

## Design

Warm ivory #f6f3ec, ink #183c34, muted brass #a67c43, serif editorial headings plus system sans UI. Refined whitespace; readable prayer timetable; clear next prayer/campus. Subtle arch motif through CSS geometry, no generic purple SaaS gradients. Scroll-driven reveal/parallax progressively enhanced; reduced-motion support, no scroll hijacking. Native iOS SwiftUI controls/materials and Android Material3 Compose. Keep time-critical information above decorative sections. Responsive 360px to large desktop, semantic keyboard-friendly 44px controls.
