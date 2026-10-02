package org.openmasjid.app

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.openmasjid.domain.Site
import org.openmasjid.domain.decodeSite
import java.net.HttpURLConnection
import java.net.URL

object SiteConfig {
    const val DEFAULT_BASE_URL = "https://example.org"
    const val PREFS = "openmasjid"
    const val URL_KEY = "site_base_url"
    const val CAMPUS_KEY = "campus_id"
    fun normalizeBase(value: String): String {
        val uri = java.net.URI(value.trim())
        require(uri.scheme.equals("https", ignoreCase = true) && !uri.isOpaque && uri.userInfo == null && uri.query == null && uri.fragment == null && !uri.host.isNullOrBlank())
        val path = if (uri.path.isNullOrEmpty()) "/" else "/" + uri.path.trim('/') + "/"
        return java.net.URI("https", null, uri.host.lowercase(), uri.port, path, null, null).toString().trimEnd('/')
    }
    fun endpoint(base: String): String = normalizeBase(base) + "/data/v1/site.json"
}
sealed interface SiteState { data object Loading: SiteState; data class Ready(val site: Site, val stale: Boolean): SiteState; data class Error(val message: String, val cached: Site?): SiteState }
class SiteRepository(private val context: Context) {
    private val prefs get() = context.getSharedPreferences(SiteConfig.PREFS, Context.MODE_PRIVATE)
    fun baseUrl(): String = runCatching { SiteConfig.normalizeBase(prefs.getString(SiteConfig.URL_KEY, SiteConfig.DEFAULT_BASE_URL) ?: SiteConfig.DEFAULT_BASE_URL) }.getOrDefault(SiteConfig.DEFAULT_BASE_URL)
    fun endpoint(): String = SiteConfig.endpoint(baseUrl())
    fun setUrl(value: String) { prefs.edit().putString(SiteConfig.URL_KEY, SiteConfig.normalizeBase(value)).apply() }
    fun campusId(): String? = prefs.getString(SiteConfig.CAMPUS_KEY, null)
    fun setCampus(id: String) = prefs.edit().putString(SiteConfig.CAMPUS_KEY, id).apply()
    private fun cacheKey(base: String) = "last_good:${SiteConfig.normalizeBase(base)}"
    private fun cached(base: String): Site? = prefs.getString(cacheKey(base), null)?.let { runCatching { decodeSite(it) }.getOrNull() }
    private fun readBounded(input: java.io.InputStream, limit: Int): String {
        input.use { stream ->
            val out = java.io.ByteArrayOutputStream(); val buffer = ByteArray(16 * 1024)
            while (true) { val count = stream.read(buffer); if (count < 0) break; if (out.size() + count > limit) throw IllegalArgumentException("Payload exceeds 1 MiB"); out.write(buffer, 0, count) }
            return out.toByteArray().toString(Charsets.UTF_8)
        }
    }
    suspend fun load(force: Boolean = false): SiteState = withContext(Dispatchers.IO) {
        val base = baseUrl(); val old = cached(base); var connection: HttpURLConnection? = null
        try {
            val target = URL(SiteConfig.endpoint(base)); connection = (target.openConnection() as HttpURLConnection).apply { connectTimeout=8_000; readTimeout=10_000; requestMethod="GET"; setRequestProperty("Accept","application/json"); if (force) setRequestProperty("Cache-Control", "no-cache") }
            connection.connect(); require(connection.responseCode in 200..299) { "Server returned ${connection.responseCode}" }
            require(connection.contentLengthLong <= 1_048_576L || connection.contentLengthLong < 0) { "Payload exceeds 1 MiB" }
            val payload = readBounded(connection.inputStream, 1_048_576)
            val site = decodeSite(payload)
            prefs.edit().putString(cacheKey(base), payload).apply()
            SiteState.Ready(site, false)
        } catch (e: Exception) { if (old != null) SiteState.Ready(old, true) else SiteState.Error(e.message ?: "Unable to load site", null) }
        finally { connection?.disconnect() }
    }
}
