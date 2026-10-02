package org.openmasjid.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class SiteConfigTest {
    @Test fun preservesHostedMosquePathInEndpoint() {
        assertEquals("https://example.org/mosque/data/v1/site.json", SiteConfig.endpoint("https://EXAMPLE.org/mosque/"))
    }
    @Test fun rejectsProtocolAndQueryVariants() {
        assertThrows(IllegalArgumentException::class.java) { SiteConfig.normalizeBase("//attacker.example") }
        assertThrows(IllegalArgumentException::class.java) { SiteConfig.normalizeBase("https://example.org/mosque?next=evil") }
    }
}
