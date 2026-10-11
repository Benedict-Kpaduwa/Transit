import Foundation
import CoreLocation

struct GeoFeatureCollection: Decodable {
    let features: [GeoFeature]
}

struct GeoFeature: Decodable {
    let geometry: GeoGeometry?
    let properties: GeoProperties?
}

struct GeoProperties: Decodable {
    let name: String?
    let line: String?
    let route: String?
    let direction: String?

    enum CodingKeys: String, CodingKey { case name, stationnam, line, route, direction }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = c.lossyString(.name) ?? c.lossyString(.stationnam)
        line = c.lossyString(.line)
        route = c.lossyString(.route)
        direction = c.lossyString(.direction)
    }
}

struct GeoGeometry: Decodable {
    enum Shape {
        case point([Double])
        case line([[Double]])
        case multiLine([[[Double]]])
    }

    let shape: Shape?

    enum CodingKeys: String, CodingKey { case type, coordinates }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let type = (try? c.decode(String.self, forKey: .type)) ?? ""
        switch type {
        case "Point":
            shape = (try? c.decode([Double].self, forKey: .coordinates)).map(Shape.point)
        case "LineString":
            shape = (try? c.decode([[Double]].self, forKey: .coordinates)).map(Shape.line)
        case "MultiLineString":
            shape = (try? c.decode([[[Double]]].self, forKey: .coordinates)).map(Shape.multiLine)
        default:
            shape = nil
        }
    }

    /// Every line this geometry draws, as map coordinates (GeoJSON is [lng, lat]).
    var lines: [[CLLocationCoordinate2D]] {
        switch shape {
        case .line(let pts): [pts.compactMap(GeoGeometry.coordinate)]
        case .multiLine(let lines): lines.map { $0.compactMap(GeoGeometry.coordinate) }
        default: []
        }
    }

    var point: CLLocationCoordinate2D? {
        if case .point(let p) = shape { return GeoGeometry.coordinate(p) }
        return nil
    }

    static func coordinate(_ pair: [Double]) -> CLLocationCoordinate2D? {
        guard pair.count >= 2 else { return nil }
        return CLLocationCoordinate2D(latitude: pair[1], longitude: pair[0])
    }
}

// MARK: - Map-ready models

struct Station: Identifiable, Hashable {
    let name: String
    let line: TransitLine
    let lineLabel: String
    let latitude: Double
    let longitude: Double

    var id: String { "\(name)|\(lineLabel)" }
    var coordinate: CLLocationCoordinate2D { .init(latitude: latitude, longitude: longitude) }

    static func hash(into hasher: inout Hasher, _ s: Station) { hasher.combine(s.id) }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (a: Station, b: Station) -> Bool { a.id == b.id }

    /// The `line` query value the arrivals endpoint understands.
    var arrivalsLineFilter: String? {
        switch line {
        case .red: "Red"
        case .blue: "Blue"
        default: nil
        }
    }
}

struct TrackLine: Identifiable {
    let id = UUID()
    let line: TransitLine
    let coordinates: [CLLocationCoordinate2D]
}

extension GeoFeatureCollection {
    var stations: [Station] {
        var seen = Set<String>()
        return features.compactMap { f -> Station? in
            guard let p = f.geometry?.point, let name = f.properties?.name, !name.isEmpty else { return nil }
            let label = f.properties?.line ?? ""
            let key = "\(name)|\(label)"
            guard seen.insert(key).inserted else { return nil }
            return Station(
                name: name,
                line: TransitLine(label),
                lineLabel: label,
                latitude: p.latitude,
                longitude: p.longitude
            )
        }
    }

    var tracks: [TrackLine] {
        features.flatMap { f -> [TrackLine] in
            let line = TransitLine(f.properties?.line ?? f.properties?.route)
            return (f.geometry?.lines ?? [])
                .filter { $0.count > 1 }
                .map { TrackLine(line: line, coordinates: $0) }
        }
    }
}
