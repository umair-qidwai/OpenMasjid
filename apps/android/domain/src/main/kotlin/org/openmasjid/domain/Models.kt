package org.openmasjid.domain

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable data class Site(
    val schemaVersion: Int, val updatedAt: String, val organization: Organization,
    val campuses: List<Campus>, val events: List<Event>, val announcements: List<Announcement>,
    val donation: Donation = Donation(DonationMode.none, null, ""),
    val programs: List<Program> = emptyList()
)
@Serializable data class Organization(val name: String, val tagline: String, val description: String, val email: String, val phone: String, val website: String, val logo: String, val theme: Theme)
@Serializable data class Theme(val accent: String, val background: String)
@Serializable enum class DonationMode { none, external, custom }
@Serializable data class Donation(val mode: DonationMode, val externalUrl: String?, val customHtml: String)
@Serializable data class Campus(
    val id: String, val name: String, val address: String, val city: String, val timezone: String,
    val latitude: Double, val longitude: Double, val phone: String, val email: String, val facilities: List<String>,
    val calculation: Calculation, val iqamah: Iqamah, val jumuah: List<Jumuah>, val timetable: List<PrayerDay>
)
@Serializable data class Calculation(val method: Method, val madhab: Madhab)
@Serializable enum class Method { NorthAmerica, MuslimWorldLeague, Egyptian, Karachi, UmmAlQura, Dubai, MoonsightingCommittee }
@Serializable enum class Madhab { Shafi, Hanafi }
@Serializable data class Iqamah(val fajr: String, val dhuhr: String, val asr: String, val maghrib: String, val isha: String)
@Serializable data class Jumuah(val label: String, val time: String)
@Serializable data class PrayerDay(val date: String, val fajr: String, val sunrise: String, val dhuhr: String, val asr: String, val maghrib: String, val isha: String, val iqamah: Iqamah? = null, val source: Source? = null)
@Serializable enum class Source { calculated, uploaded }
@Serializable data class Program(val id: String, val title: String, val description: String, val campusIds: List<String>)
@Serializable data class Event(val id: String, val title: String, val description: String, val startsAt: String, val endsAt: String, val campusIds: List<String>, val location: String, val category: String)
@Serializable data class Announcement(val id: String, val title: String, val body: String, val campusIds: List<String>, val publishedAt: String, val expiresAt: String?)

data class NextPrayer(val name: String, val time: String, val iqamah: String)
