package org.openmasjid.domain

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import kotlinx.serialization.json.Json

private val json = Json { ignoreUnknownKeys = false; explicitNulls = true; isLenient = false }
private val dateRegex = Regex("\\d{4}-\\d{2}-\\d{2}")
private val timeRegex = Regex("(?:[01]\\d|2[0-3]):[0-5]\\d")
private val hexRegex = Regex("#[0-9a-fA-F]{6}")
private val slugRegex = Regex("[a-z0-9]+(?:-[a-z0-9]+)*")

    fun decodeSite(raw: String): Site = runCatching { require(raw.toByteArray().size <= 1_048_576) { "Payload exceeds 1 MiB" }; json.decodeFromString<Site>(raw).also(::validateSite) }
        .getOrElse { if (it is IllegalArgumentException) throw it else throw IllegalArgumentException("Invalid site document", it) }

fun validateSite(site: Site) {
    require(site.schemaVersion == 1) { "Unsupported schema version" }
    requireTimestamp(site.updatedAt); require(site.campuses.isNotEmpty() && site.campuses.size <= 20 && site.events.size <= 500 && site.announcements.size <= 500 && site.programs.size <= 500 && site.services.size <= 500) { "Array bounds" }
    val campusIds = site.campuses.map { it.id }.toSet()
    require(campusIds.size == site.campuses.size && campusIds.all { validSlug(it) }) { "Invalid or duplicate campus id" }
    require(site.events.map { it.id }.toSet().size == site.events.size) { "Duplicate event id" }
    require(site.announcements.map { it.id }.toSet().size == site.announcements.size) { "Duplicate announcement id" }
    require(validText(site.organization.name,200) && validText(site.organization.tagline,300) && validText(site.organization.description,20000) && validEmail(site.organization.email) && validText(site.organization.phone,40))
    require(site.organization.theme.accent.matches(hexRegex) && site.organization.theme.background.matches(hexRegex)) { "Theme colors must be hex" }
    requireHttps(site.organization.website); requireSafeLogo(site.organization.logo)
    require(site.donation.customHtml.length <= 100_000) { "Donation HTML is too large" }
    when (site.donation.mode) {
        DonationMode.none -> require(site.donation.externalUrl == null && site.donation.customHtml.isEmpty()) { "Disabled donation configuration must be empty" }
        DonationMode.external -> { require(site.donation.customHtml.isEmpty() && site.donation.externalUrl != null) { "External donation configuration is incomplete" }; requireHttps(site.donation.externalUrl) }
        DonationMode.custom -> require(site.donation.externalUrl == null && site.donation.customHtml.isNotBlank()) { "Custom donation configuration is incomplete" }
    }
    val volunteer = site.volunteer
    require(validText(volunteer.title, 200) && validText(volunteer.description, 10000) && validText(volunteer.buttonLabel, 80) && volunteer.opportunities.size <= 50) { "Invalid volunteer content" }
    require(volunteer.opportunities.map { it.id }.toSet().size == volunteer.opportunities.size) { "Duplicate volunteer opportunity id" }
    volunteer.opportunities.forEach { opportunity ->
        require(validSlug(opportunity.id) && validText(opportunity.title, 200) && validText(opportunity.description, 10000) && validText(opportunity.buttonLabel, 80)) { "Invalid volunteer opportunity" }
        requireHttps(opportunity.url)
    }
    when (volunteer.mode) {
        VolunteerMode.external -> {
            require(volunteer.opportunities.isEmpty()) { "Direct volunteer mode cannot include opportunities" }
            volunteer.externalUrl?.let(::requireHttps)
            if (volunteer.enabled) require(volunteer.externalUrl != null) { "Enabled direct volunteer mode requires a URL" }
        }
        VolunteerMode.page -> {
            require(volunteer.externalUrl == null) { "Volunteer page mode cannot include a direct URL" }
            if (volunteer.enabled) require(volunteer.opportunities.isNotEmpty()) { "Enabled volunteer page requires opportunities" }
        }
    }
    site.campuses.forEach { c ->
        require(validText(c.name,160) && validText(c.address,500) && validText(c.city,120) && validText(c.phone,40) && validEmail(c.email) && c.facilities.size <= 40 && c.facilities.all { validText(it,100) } && c.jumuah.size <= 10 && c.timetable.size <= 1500)
        require(c.timezone in ZoneId.getAvailableZoneIds()) { "Invalid timezone" }; require(c.latitude in -90.0..90.0 && c.longitude in -180.0..180.0)
        val dates = mutableSetOf<String>(); c.timetable.forEach { p -> require(dates.add(p.date)) { "Duplicate timetable date" }; requireDate(p.date); listOf(p.fajr,p.sunrise,p.dhuhr,p.asr,p.maghrib,p.isha).forEach(::requireTime); p.iqamah?.let(::validateIqamah) }
        validateIqamah(c.iqamah); c.jumuah.forEach { require(validText(it.label,100)); requireTime(it.time) }
    }
    require(site.programs.map { it.id }.toSet().size == site.programs.size) { "Duplicate program id" }
    site.programs.forEach { p ->
        require(validSlug(p.id) && validText(p.title,200) && validText(p.description,10000))
        require(p.campusIds.size <= 20 && p.campusIds.distinct().size == p.campusIds.size && p.campusIds.all(campusIds::contains))
        require(p.details.content.length <= 50000 && (!p.details.enabled || p.details.content.isNotBlank()))
        if (p.details.image.isNotEmpty()) requireSafeLogo(p.details.image)
    }
    require(site.services.map { it.id }.toSet().size == site.services.size) { "Duplicate service id" }
    site.services.forEach { s ->
        require(validSlug(s.id) && validText(s.title,200) && validText(s.description,10000))
        require(s.campusIds.size <= 20 && s.campusIds.distinct().size == s.campusIds.size && s.campusIds.all(campusIds::contains))
        require(s.details.content.length <= 50000 && (!s.details.enabled || s.details.content.isNotBlank()))
        if (s.details.image.isNotEmpty()) requireSafeLogo(s.details.image)
    }
    site.events.forEach { e -> require(validSlug(e.id) && validText(e.title,200) && validText(e.description,10000) && validText(e.location,300) && validText(e.category,80)); requireTimestamp(e.startsAt); requireTimestamp(e.endsAt); require(e.campusIds.distinct().size == e.campusIds.size); val starts = runCatching { Instant.parse(e.startsAt) }.getOrNull(); val ends = runCatching { Instant.parse(e.endsAt) }.getOrNull(); require(e.campusIds.size <= 20 && starts != null && ends != null && ends.isAfter(starts)); require(e.campusIds.all(campusIds::contains)) }
    site.announcements.forEach { a -> require(validSlug(a.id) && validText(a.title,200) && validText(a.body,10000)); require(a.campusIds.size <= 20 && a.campusIds.all(campusIds::contains)); require(a.campusIds.distinct().size == a.campusIds.size); requireTimestamp(a.publishedAt); a.expiresAt?.let { requireTimestamp(it); require(Instant.parse(it).isAfter(Instant.parse(a.publishedAt))) } }
}
private fun validateIqamah(i: Iqamah) = listOf(i.fajr,i.dhuhr,i.asr,i.maghrib,i.isha).forEach(::requireTime)
private fun validSlug(s: String) = s.length in 1..64 && s.matches(slugRegex)
private fun requireDate(s: String) { require(s.matches(dateRegex)); try { LocalDate.parse(s) } catch (_: DateTimeParseException) { error("Invalid date") } }
private fun requireTime(s: String) { require(s.matches(timeRegex)) { "Time must be HH:mm" }; LocalTime.parse(s) }
private fun requireInstant(s: String) { require(runCatching { Instant.parse(s) }.isSuccess) { "Invalid timestamp" } }
private fun requireTimestamp(s: String) {
    require(s.length <= 40 && Regex("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})").matches(s)) { "Invalid timestamp" }
    val date = s.substring(0, 10)
    require(date.substring(0, 4).toInt() in 1900..2200) { "Invalid timestamp" }
    requireDate(date)
    requireInstant(s)
}
private fun validText(s: String, max: Int) = s.isNotBlank() && s.length <= max
private fun validEmail(s: String) = s.length <= 254 && Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$").matches(s)
private fun requireHttps(s: String) { val u = runCatching { java.net.URI(s) }.getOrNull(); require(s.length <= 2048 && u != null && u.scheme.equals("https", true) && u.userInfo == null && u.host != null && !s.any { it.isWhitespace() || it == '\\' }) { "HTTPS URL required" } }
private fun requireSafeLogo(s: String) {
    val relative = Regex("^/?[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*\\.(svg|png|webp|jpg|jpeg|avif)$", RegexOption.IGNORE_CASE)
    if (s.startsWith("https://", ignoreCase = true)) requireHttps(s) else require(relative.matches(s)) { "Unsafe logo URL" }
}

fun localDateISO(now: Instant, timeZone: String): String = now.atZone(ZoneId.of(timeZone)).toLocalDate().toString()
fun getPrayerDay(site: Site, campusId: String, dateISO: String): PrayerDay? = site.campuses.firstOrNull { it.id == campusId }?.timetable?.firstOrNull { it.date == dateISO }
fun getCampusEvents(site: Site, campusId: String): List<Event> = site.events.filter { it.campusIds.isEmpty() || campusId in it.campusIds }.sortedBy { it.startsAt }
fun getCampusAnnouncements(site: Site, campusId: String): List<Announcement> = site.announcements.filter { it.campusIds.isEmpty() || campusId in it.campusIds }.sortedByDescending { it.publishedAt }
    fun nextPrayer(campus: Campus, now: Instant): NextPrayer? {
    val day = getPrayerDay(Site(schemaVersion=1,updatedAt="",organization=Organization("","","","","","https://example.org","assets/logo.svg",Theme("#000000","#000000")),campuses=listOf(campus),events=emptyList(),announcements=emptyList()), campus.id, localDateISO(now,campus.timezone)) ?: return null
    val localNow = now.atZone(ZoneId.of(campus.timezone)).toLocalTime(); val values = listOf("Fajr" to day.fajr,"Dhuhr" to day.dhuhr,"Asr" to day.asr,"Maghrib" to day.maghrib,"Isha" to day.isha)
    val next = values.firstOrNull { LocalTime.parse(it.second).isAfter(localNow) } ?: return null
    val iq = day.iqamah ?: campus.iqamah; return NextPrayer(next.first,next.second,when(next.first){"Fajr"->iq.fajr;"Dhuhr"->iq.dhuhr;"Asr"->iq.asr;"Maghrib"->iq.maghrib;else->iq.isha})
}
