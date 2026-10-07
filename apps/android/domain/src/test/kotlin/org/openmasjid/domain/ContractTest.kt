package org.openmasjid.domain

import org.junit.Assert.*
import org.junit.Test

class ContractTest {
    private fun fixture() = javaClass.getResource("/demo-site.json")!!.readText()
    private fun withVolunteer(value: String) = fixture().replaceFirst("{", "{\"volunteer\":$value,")
    @Test fun volunteerDefaultsAndDecodesPageConfiguration() {
        assertEquals(Volunteer(), decodeSite(fixture()).volunteer)
        val site = decodeSite(withVolunteer("""{"enabled":true,"title":"Volunteer","description":"Help the community","mode":"page","buttonLabel":"See opportunities","externalUrl":null,"opportunities":[{"id":"food-pantry","title":"Food pantry","description":"Pack boxes","buttonLabel":"Sign up","url":"HTTPS://example.org/volunteer"}]}"""))
        assertEquals(VolunteerMode.page, site.volunteer.mode)
        assertEquals("food-pantry", site.volunteer.opportunities.single().id)
    }
    @Test fun volunteerRejectsNullPartialAndUnknownObjects() {
        val invalid = listOf(
            "null", "{}", "{\"enabled\":false}",
            """{"enabled":false,"title":"Volunteer","description":"Help","mode":"external","buttonLabel":"Join","externalUrl":null,"opportunities":[],"unknown":true}""",
            """{"enabled":false,"title":"Volunteer","description":"Help","mode":"page","buttonLabel":"Join","externalUrl":null,"opportunities":[{"id":"helper","title":"Help","description":"Help","buttonLabel":"Join","url":"https://example.org","unknown":true}]}"""
        )
        invalid.forEach { assertThrows(IllegalArgumentException::class.java) { decodeSite(withVolunteer(it)) } }
    }
    @Test fun volunteerEnforcesModesBoundsUrlsAndUniqueOpportunityIds() {
        val site = decodeSite(fixture())
        val opportunity = VolunteerOpportunity("helper", "Help", "Help out", "Join", "https://example.org/help")
        val base = Volunteer()
        val invalid = listOf(
            base.copy(enabled = true),
            base.copy(opportunities = listOf(opportunity)),
            base.copy(mode = VolunteerMode.page, externalUrl = "https://example.org"),
            base.copy(enabled = true, mode = VolunteerMode.page),
            base.copy(mode = VolunteerMode.page, opportunities = listOf(opportunity, opportunity)),
            base.copy(mode = VolunteerMode.page, opportunities = List(51) { opportunity.copy(id = "helper-$it") }),
            base.copy(mode = VolunteerMode.page, opportunities = listOf(opportunity.copy(url = "http://example.org"))),
            base.copy(title = " "),
            base.copy(buttonLabel = "x".repeat(81))
        )
        invalid.forEach { assertThrows(IllegalArgumentException::class.java) { validateSite(site.copy(volunteer = it)) } }
    }
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
        val raw = fixture().replaceFirst("{", """{"programs":[{"id":"prayer","title":"Prayer","description":"Fictional","campusIds":["demo-central"],"details":{"enabled":true,"content":"Join us","image":"HTTPS://example.org/prayer.jpg"}}],""")
        val site = decodeSite(raw)
        assertEquals(1, site.schemaVersion)
        assertEquals("HTTPS://example.org/prayer.jpg", site.programs.single().details.image)
    }
    @Test fun programsDefaultAndValidation() {
        val site = decodeSite(fixture())
        assertTrue(site.programs.isEmpty())
        assertTrue(site.services.isEmpty())
        assertThrows(IllegalArgumentException::class.java) { decodeSite(fixture().replaceFirst("{", """{"programs":null,""")) }
        assertThrows(IllegalArgumentException::class.java) { decodeSite(fixture().replaceFirst("{", """{"services":null,""")) }
        for (details in listOf("null", "{}", "{\"enabled\":false}", "{\"content\":\"\"}")) {
            val raw = fixture().replaceFirst("{", """{"programs":[{"id":"prayer","title":"Prayer","description":"Fictional","campusIds":[],"details":$details}],""")
            assertThrows(IllegalArgumentException::class.java) { decodeSite(raw) }
        }
        assertThrows(IllegalArgumentException::class.java) { decodeSite(fixture().replaceFirst("{", """{"programs":[{"id":"prayer","title":"Prayer","description":"Fictional","campusIds":[],"unknown":true}],""")) }
        val program = Program("prayer", "Prayer", "Fictional", listOf(site.campuses.first().id))
        assertEquals("", program.details.image)
        validateSite(site.copy(programs = listOf(program)))
        validateSite(site.copy(services = listOf(program.copy(id = "care"))))
        assertThrows(IllegalArgumentException::class.java) { validateSite(site.copy(services = listOf(program.copy(id = "care", details = OfferingDetails(true, " "))))) }
        val unsafeImage = fixture().replaceFirst("{", """{"programs":[{"id":"prayer","title":"Prayer","description":"Fictional","campusIds":[],"details":{"enabled":false,"content":"","image":"../private.png"}}],""")
        assertThrows(IllegalArgumentException::class.java) { decodeSite(unsafeImage) }
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