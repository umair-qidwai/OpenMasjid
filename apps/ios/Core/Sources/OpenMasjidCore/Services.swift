import Foundation

public enum SiteLoadState: Equatable { case loading, loaded(Site, stale: Bool), failed(String) }

public struct SiteConfiguration: Equatable {
    public let websiteBase: URL
    public var endpoint: URL { websiteBase.appendingPathComponent("data/v1/site.json") }
    public init(websiteBase: URL) throws {
        guard websiteBase.scheme?.lowercased() == "https", websiteBase.host != nil,
              websiteBase.user == nil, websiteBase.password == nil,
              websiteBase.query == nil, websiteBase.fragment == nil else { throw SiteError.invalid("Website base must be HTTPS") }
        guard var normalized = URLComponents(url: websiteBase, resolvingAgainstBaseURL: false) else { throw SiteError.invalid("Invalid URL") }
        let path = websiteBase.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        normalized.path = path.isEmpty ? "/" : "/" + path + "/"
        guard let base = normalized.url else { throw SiteError.invalid("Invalid URL") }
        self.websiteBase = base
    }
}

@MainActor
public final class SiteStore {
    private let session: URLSession
    private let defaults: UserDefaults
    private var activeTask: Task<Void, Never>?
    private var generation = 0
    public private(set) var state: SiteLoadState = .loading
    private let maxPayloadBytes = 1_048_576

    public init(session: URLSession = .shared, defaults: UserDefaults = .standard) { self.session=session; self.defaults=defaults }
    private func cacheKey(for configuration: SiteConfiguration) -> String { "openmasjid.site.lastGood." + configuration.websiteBase.absoluteString }
    public func cached(for configuration: SiteConfiguration) -> Site? { guard let data=defaults.data(forKey:cacheKey(for: configuration)) else{return nil}; return try? Self.decode(data) }
    public func load(configuration: SiteConfiguration, completion: @escaping (SiteLoadState)->Void) {
        activeTask?.cancel(); generation += 1; let requestGeneration = generation
        state = .loading; completion(.loading)
        activeTask = Task { [weak self] in
            guard let self else { return }
            do {
                var request = URLRequest(url: configuration.endpoint); request.cachePolicy = .reloadIgnoringLocalCacheData
                let (bytes, response) = try await session.bytes(for: request)
                guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw SiteError.invalid("Unable to load site data") }
                if let length = http.value(forHTTPHeaderField: "Content-Length"), let declared = Int(length), declared > maxPayloadBytes { throw SiteError.invalid("Payload too large") }
                var data = Data(); data.reserveCapacity(min(maxPayloadBytes, 64 * 1024))
                for try await byte in bytes { try Task.checkCancellation(); if data.count >= maxPayloadBytes { throw SiteError.invalid("Payload too large") }; data.append(byte) }
                let site = try Self.decode(data)
                guard !Task.isCancelled, requestGeneration == generation else { return }
                defaults.set(data,forKey:cacheKey(for: configuration)); state = .loaded(site,stale:false); completion(state)
            } catch is CancellationError { return }
            catch {
                guard !Task.isCancelled, requestGeneration == generation else { return }
                if let cached = cached(for: configuration) { state = .loaded(cached,stale:true); completion(state) }
                else { state = .failed(error.localizedDescription); completion(state) }
            }
        }
    }
    private static func decode(_ data: Data) throws -> Site { guard data.count <= 1_048_576 else{throw SiteError.invalid("Payload too large")}; return try JSONDecoder().decode(Site.self,from:data) }
}
public final class CampusSelection { private let defaults:UserDefaults; private let key="openmasjid.selectedCampus"; public init(defaults:UserDefaults = .standard){self.defaults=defaults}; public var id:String? { get{defaults.string(forKey:key)} set{defaults.set(newValue,forKey:key)} } }
