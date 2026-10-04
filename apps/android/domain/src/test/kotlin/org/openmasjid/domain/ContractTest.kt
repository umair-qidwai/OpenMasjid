package org.openmasjid.domain

import org.junit.Assert.*
import org.junit.Test

class ContractTest {
    private fun fixture() = javaClass.getResource("/demo-site.json")!!.readText()
    @Test fun rejectsDuplicateReferencesAndOutOfRangeContentTimestamps() {
        val site = decodeSite(fixture())
        val event = Event("test-event", "Test", "Description", "2026-10-01T12:00:00Z", "2026-10-01T13:00:00Z", listOf(site.campuses.first().id), "Hall", "Community")
        validateSite(site.copy(events = listOf(event)))
        assertThrows(IllegalArgumentException::class.java) { validateSite(site.copy(events = listOf(event.copy(campusIds = event.campusIds + event.campusIds)))) }
        assertThrows(IllegalArgumentException::class.java) { validateSite(site.copy(events = listOf(event.copy(startsAt = "1800-10-01T12:00:00Z")))) }
        val announcement = Announcement("notice", "Notice", "Body", listOf(site.campuses.first().id), "2026-10-01T12:00:00Z", null)
        validateSite(site.copy(announcements = listOf(announcement)))
        assertThrows(IllegalArgumentException::class.java) { validateSite(site.copy(announcements = listOf(announcement.copy(campusIds = announcement.campusIds + announcement.campusIds)))) }
        assertThrows(IllegalArgumentException::class.java) { validateSite(site.copy(announcements = listOf(announcement.copy(publishedAt = "1800-10-01T12:00:00Z")))) }
    }
    @Test fun acceptsAdditivePrograms() {
        val raw = fixture().replaceFirst("{", """{"programs":[{"id":"prayer","title":"Prayer","description":"Fictional","campusIds":["demo-central"]}],""")
        assertEquals(1, decodeSite(raw).schemaVersion)
    }
    @Test fun programsDefaultAndValidation() {
        val site = decodeSite(fixture())
        assertTrue(site.programs.isEmpty())
        assertThrows(IllegalArgumentException::class.java) { decodeSite(fixture().replaceFirst("{", """{"programs":null,""")) }
        assertThrows(IllegalArgumentException::class.java) { decodeSite(fixture().replaceFirst("{", """{"programs":[{"id":"prayer","title":"Prayer","description":"Fictional","campusIds":[],"unknown":true}],""")) }
        val program = Program("prayer", "Prayer", "Fictional", listOf(site.campuses.first().id))
        validateSite(site.copy(programs = listOf(program)))
        for (programs in listOf(listOf(program, program), listOf(program.copy(campusIds = listOf("missing"))), listOf(program.copy(campusIds = program.campusIds + program.campusIds)))) {
            assertThrows(IllegalArgumentException::class.java) { validateSite(site.copy(programs = programs)) }
        }
    }
    @Test fun decodesExactContract() {
        val site = decodeSite(fixture())
        assertEquals(1, site.schemaVersion)
        assertEquals("demo-central", site.campuses.first().id)
        assertEquals(Source.uploaded, site.campuses.first().timetable.first().source)
        assertEquals(DonationMode.none, site.donation.mode)
    }
    @Test fun defaultsMissingDonationForSchemaV1() {
        val old = fixture().replace(Regex("""\s*\"donation\"\s*:\s*\{[^}]*},?"""), "")
        assertEquals(DonationMode.none, decodeSite(old).donation.mode)
    }
    @Test fun rejectsUnknownFields() {
        assertThrows(IllegalArgumentException::class.java) { decodeSite(fixture().replace("\"schemaVersion\": 1", "\"alien\": true, \"schemaVersion\": 1")) }
    }
    @Test fun rejectsInvalidCalendarDate() {
        assertThrows(IllegalArgumentException::class.java) { decodeSite(fixture().replace("2026-10-01", "2026-02-30")) }
    }
    @Test fun rejectsInvalidUpdatedAtTimestamp() {
        assertThrows(IllegalArgumentException::class.java) { decodeSite(fixture().replace("2026-10-01T00:00:00Z", "not-a-timestamp")) }
        assertThrows(IllegalArgumentException::class.java) { decodeSite(fixture().replace("2026-10-01T00:00:00Z", "1899-12-31T12:00:00Z")) }
        assertThrows(IllegalArgumentException::class.java) { decodeSite(fixture().replace("2026-10-01T00:00:00Z", "2026-10-01T00:00:00.123456789012345678901234567890Z")) }
    }
    @Test fun rejectsUnsupportedSchema() {
        assertThrows(IllegalArgumentException::class.java) { decodeSite(fixture().replace("\"schemaVersion\": 1", "\"schemaVersion\": 2")) }
    }
    @Test fun rejectsUnknownCampusReference() {
        assertThrows(IllegalArgumentException::class.java) { decodeSite(fixture().replace("\"campusIds\": []", "\"campusIds\": [\"unknown\"]")) }
    }
    @Test fun rejectsUnsafeProtocolRelativeLogo() {
        assertThrows(IllegalArgumentException::class.java) { decodeSite(fixture().replace("assets/logo.svg", "//attacker.example/logo.svg")) }
    }
    @Test fun rejectsDuplicateTimetableDates() {
        val site = decodeSite(fixture())
        val campus = site.campuses.first()
        val row = campus.timetable.first()
        assertThrows(IllegalArgumentException::class.java) { validateSite(site.copy(campuses = listOf(campus.copy(timetable = listOf(row, row))))) }
    }
    @Test fun rejectsDuplicateEventIds() {
        val site = decodeSite(fixture())
        val event = Event("event-one", "Event", "Description", "2026-10-01T12:00:00Z", "2026-10-01T13:00:00Z", emptyList(), "Hall", "Community")
        assertThrows(IllegalArgumentException::class.java) { validateSite(site.copy(events = listOf(event, event))) }
    }
}