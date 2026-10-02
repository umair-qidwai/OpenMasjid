import XCTest
@testable import OpenMasjidCore

final class OpenMasjidCoreTests: XCTestCase {
    private let json = """
    {"schemaVersion":1,"updatedAt":"2026-01-01T12:00:00Z","organization":{"name":"Demo","tagline":"Fictional demo","description":"Demo","email":"hello@example.org","phone":"+1 555 0100","website":"https://example.org","logo":"/logo.png","theme":{"accent":"#A67C43","background":"#F6F3EC"}},"campuses":[{"id":"north-campus","name":"North","address":"1 Main","city":"Demo","timezone":"America/New_York","latitude":1,"longitude":2,"phone":"+1 555 0100","email":"north@example.org","facilities":[],"calculation":{"method":"NorthAmerica","madhab":"Shafi"},"iqamah":{"fajr":"05:30","dhuhr":"13:00","asr":"17:00","maghrib":"19:00","isha":"20:30"},"jumuah":[{"label":"First","time":"13:15"}],"timetable":[{"date":"2026-01-01","fajr":"05:00","sunrise":"06:30","dhuhr":"12:10","asr":"15:00","maghrib":"17:40","isha":"19:00","source":"uploaded"}]}],"events":[{"id":"open-house","title":"Open House","description":"Welcome","startsAt":"2026-01-02T18:00:00-05:00","endsAt":"2026-01-02T20:00:00-05:00","campusIds":[],"location":"Hall","category":"Community"}],"announcements":[{"id":"welcome","title":"Welcome","body":"Hello","campusIds":["north-campus"],"publishedAt":"2026-01-01T10:00:00Z","expiresAt":null}]}
    """
    func testDecodesStrictSchemaAndRejectsUnknownFields() throws { let site=try JSONDecoder().decode(Site.self,from:Data(json.utf8)); XCTAssertEqual(site.campuses.count,1); var bad=json; bad=bad.replacingOccurrences(of:"\"schemaVersion\":1",with:"\"unexpected\":true,\"schemaVersion\":1"); XCTAssertThrowsError(try JSONDecoder().decode(Site.self,from:Data(bad.utf8))) }
    func testAcceptsFractionalRFC3339Timestamps() throws { let fractional = json.replacingOccurrences(of: "2026-01-01T12:00:00Z", with: "2026-01-01T12:00:00.123Z"); XCTAssertNoThrow(try JSONDecoder().decode(Site.self, from: Data(fractional.utf8))) }
    func testLocalDateUsesCampusTimezone() { let d=ISO8601DateFormatter().date(from:"2026-01-02T00:30:00Z")!; XCTAssertEqual(localDateISO(d,timeZone:TimeZone(identifier:"America/New_York")!),"2026-01-01") }
    func testFiltersGlobalAndCampusContent() throws { let site=try JSONDecoder().decode(Site.self,from:Data(json.utf8)); XCTAssertEqual(getCampusEvents(site,campusId:"north-campus").count,1); XCTAssertEqual(getCampusAnnouncements(site,campusId:"north-campus").count,1); XCTAssertNil(getCampusAnnouncements(site,campusId:"other").first) }
    func testConfigurationRequiresHTTPSAndBuildsEndpoint() throws { XCTAssertThrowsError(try SiteConfiguration(websiteBase:URL(string:"http://example.org")!)); let c=try SiteConfiguration(websiteBase:URL(string:"https://example.org/mosque/")!); XCTAssertEqual(c.endpoint.absoluteString,"https://example.org/mosque/data/v1/site.json") }
    func testRejectsProtocolRelativeLogo() { let bad=json.replacingOccurrences(of:"\"/logo.png\"",with:"\"//attacker.example/logo.png\""); XCTAssertThrowsError(try JSONDecoder().decode(Site.self,from:Data(bad.utf8))) }
    func testRejectsCredentialWhitespaceBackslashAndOverlongHTTPSWebsite() {
        for website in ["https://user:pass@example.org", "https://example.org/has space", "https://example.org/has\\\\slash", "https://" + String(repeating: "a", count: 2041) + ".org"] {
            let bad = json.replacingOccurrences(of: "https://example.org", with: website)
            XCTAssertThrowsError(try JSONDecoder().decode(Site.self, from: Data(bad.utf8)), website)
        }
    }
    func testEnforcesSharedTextAndCollectionBounds() {
        let cases = [
            json.replacingOccurrences(of: "\"name\":\"Demo\"", with: "\"name\":\"\""),
            json.replacingOccurrences(of: "\"facilities\":[]", with: "\"facilities\":[\"" + String(repeating: "x", count: 101) + "\"]"),
            json.replacingOccurrences(of: "\"campusIds\":[]", with: "\"campusIds\":[\"north-campus\",\"north-campus\"]")
        ]
        for bad in cases { XCTAssertThrowsError(try JSONDecoder().decode(Site.self, from: Data(bad.utf8))) }
    }
    func testUnicodeUsesUTF16ContractLimit() {
        let bad = json.replacingOccurrences(of: "\"name\":\"Demo\"", with: "\"name\":\"" + String(repeating: "😀", count: 101) + "\"")
        XCTAssertThrowsError(try JSONDecoder().decode(Site.self, from: Data(bad.utf8)))
    }
    func testRejectsAnnouncementExpiryBeforePublication() {
        let bad = json.replacingOccurrences(of: "\"expiresAt\":null", with: "\"expiresAt\":\"2025-12-31T10:00:00Z\"")
        XCTAssertThrowsError(try JSONDecoder().decode(Site.self, from: Data(bad.utf8)))
    }
    func testPrayerLookup() throws { let site=try JSONDecoder().decode(Site.self,from:Data(json.utf8)); XCTAssertEqual(getPrayerDay(site,campusId:"north-campus",dateISO:"2026-01-01")?.fajr,"05:00") }
}
