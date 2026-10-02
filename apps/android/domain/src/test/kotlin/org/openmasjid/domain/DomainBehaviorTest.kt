package org.openmasjid.domain

import java.time.Instant
import org.junit.Assert.*
import org.junit.Test

class DomainBehaviorTest {
    private fun fixture() = javaClass.getResource("/demo-site.json")!!.readText()
    @Test fun localDateUsesCampusTimezone() { assertEquals("2026-09-30", localDateISO(Instant.parse("2026-10-01T03:30:00Z"), "America/New_York")) }
    @Test fun globalEventsAndAnnouncementsAreIncluded() { val site=decodeSite(fixture()); assertEquals(1,getCampusEvents(site,"demo-central").size); assertEquals(1,getCampusAnnouncements(site,"demo-central").size) }
    @Test fun explicitIqamahOverridesFixedSchedule() { val site=decodeSite(fixture()); val p=getPrayerDay(site,"demo-central","2026-10-01")!!; assertEquals("06:20",p.iqamah!!.fajr) }
    @Test fun rejectsHttpWebsite() { assertThrows(IllegalArgumentException::class.java) { decodeSite(fixture().replace("https://example.org","http://example.org")) } }
    @Test fun nextPrayerUsesCampusLocalDay() { val site=decodeSite(fixture()); val n=nextPrayer(site.campuses.first(),Instant.parse("2026-10-01T18:00:00Z")); assertEquals("Asr",n?.name) }
}
