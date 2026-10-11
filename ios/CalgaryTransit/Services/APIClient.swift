import Foundation
import CoreLocation

enum APIError: LocalizedError {
    case badURL
    case http(Int)

    var errorDescription: String? {
        switch self {
        case .badURL: "Invalid request."
        case .http(let code): "The transit service returned an error (\(code))."
        }
    }
}

/// Thin client for the FastAPI backend in /backend.
struct APIClient {
    static let shared = APIClient()

    /// Set per build configuration in project.yml (API_BASE_URL) and read from Info.plist.
    let baseURL: String = {
        let raw = (Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String) ?? "http://localhost:8000"
        return raw.hasSuffix("/") ? String(raw.dropLast()) : raw
    }()

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        guard var comps = URLComponents(string: baseURL + path) else { throw APIError.badURL }
        if !query.isEmpty { comps.queryItems = query }
        guard let url = comps.url else { throw APIError.badURL }

        let (data, response) = try await URLSession.shared.data(from: url)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw APIError.http(http.statusCode)
        }
        return try JSONDecoder.api.decode(T.self, from: data)
    }

    private func item(_ name: String, _ value: some CustomStringConvertible) -> URLQueryItem {
        URLQueryItem(name: name, value: value.description)
    }

    // MARK: Static map data

    func lrtStations() async throws -> [Station] {
        let fc: GeoFeatureCollection = try await get("/lrt/stations")
        return fc.stations
    }

    func lrtTracks() async throws -> [TrackLine] {
        let fc: GeoFeatureCollection = try await get("/lrt/tracks")
        return fc.tracks
    }

    // MARK: Live data

    func ctrains() async throws -> [Vehicle] {
        let r: VehiclesResponse = try await get("/vehicles/ctrains")
        return r.vehicles
    }

    func buses() async throws -> [Vehicle] {
        let r: VehiclesResponse = try await get("/vehicles/buses")
        return r.vehicles
    }

    func nearby(_ c: CLLocationCoordinate2D, radius: Int = 800) async throws -> [NearbyStop] {
        let r: NearbyResponse = try await get("/arrivals/nearby", query: [
            item("lat", c.latitude), item("lng", c.longitude), item("radius", radius),
            item("limit_stops", 8), item("limit_arrivals", 4),
        ])
        return r.stops
    }

    func arrivals(for ref: StopRef) async throws -> [Arrival] {
        switch ref.kind {
        case .stop(let id):
            let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
            let r: StopArrivalsResponse = try await get("/arrivals/\(encoded)", query: [item("limit", 12)])
            return r.arrivals
        case .station(let name, let line):
            let encoded = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
            var q = [item("limit", 12)]
            if let line { q.append(item("line", line)) }
            let r: StationArrivalsResponse = try await get("/arrivals/station/\(encoded)", query: q)
            return r.arrivals
        }
    }

    // MARK: Trip planning

    func planTrip(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) async throws -> TripPlanResponse {
        try await get("/trip/plan", query: [
            item("origin_lng", from.longitude), item("origin_lat", from.latitude),
            item("dest_lng", to.longitude), item("dest_lat", to.latitude),
        ])
    }
}
