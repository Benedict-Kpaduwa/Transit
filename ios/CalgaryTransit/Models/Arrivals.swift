import Foundation
import SwiftUI
import CoreLocation

struct Arrival: Decodable, Identifiable, Hashable {
    let tripId: String?
    let routeShortName: String?
    let vehicleType: String?
    let line: String?
    let color: String?
    let headsign: String?
    let stopId: String?
    let stopName: String?
    let delayMinutes: Double
    let minutesAway: Int

    var id: String { "\(tripId ?? UUID().uuidString)|\(stopId ?? "")|\(minutesAway)" }
    var isCTrain: Bool { vehicleType == "CTrain" }

    var badgeColor: Color {
        if isCTrain { return TransitLine(line ?? routeShortName).color }
        return Color(hex: color) ?? .busGrey
    }

    var badgeText: String {
        if isCTrain {
            switch TransitLine(line ?? routeShortName) {
            case .red: return "Red"
            case .blue: return "Blue"
            default: break
            }
        }
        return routeShortName ?? "?"
    }

    var timeText: String { Arrival.format(minutes: minutesAway) }

    static func format(minutes: Int) -> String {
        if minutes <= 0 { return "Now" }
        if minutes < 60 { return "\(minutes) min" }
        let h = minutes / 60, m = minutes % 60
        return m == 0 ? "\(h) hr" : "\(h) hr \(m) min"
    }

    enum CodingKeys: String, CodingKey {
        case tripId, routeShortName, vehicleType, line, color, headsign
        case stopId, stopName, delayMinutes, minutesAway
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        tripId = c.lossyString(.tripId)
        routeShortName = c.lossyString(.routeShortName)
        vehicleType = c.lossyString(.vehicleType)
        line = c.lossyString(.line)
        color = c.lossyString(.color)
        headsign = c.lossyString(.headsign)
        stopId = c.lossyString(.stopId)
        stopName = c.lossyString(.stopName)
        delayMinutes = c.lossyDouble(.delayMinutes) ?? 0
        minutesAway = Int(c.lossyDouble(.minutesAway) ?? 0)
    }
}

struct RouteBadge: Decodable, Identifiable, Hashable {
    let routeShortName: String?
    let vehicleType: String?
    let color: String?

    var id: String { "\(routeShortName ?? "")|\(vehicleType ?? "")" }
    var tint: Color {
        vehicleType == "CTrain" ? TransitLine(routeShortName).color : (Color(hex: color) ?? .busGrey)
    }

    enum CodingKeys: String, CodingKey { case routeShortName, vehicleType, color }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        routeShortName = c.lossyString(.routeShortName)
        vehicleType = c.lossyString(.vehicleType)
        color = c.lossyString(.color)
    }
}

struct StopInfo: Decodable, Hashable {
    let stopId: String
    let stopCode: String?
    let stopName: String
    let coordinates: Coordinates?
    let distanceMeters: Double?

    enum CodingKeys: String, CodingKey { case stopId, stopCode, stopName, coordinates, distanceMeters }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        stopId = c.lossyString(.stopId) ?? ""
        stopCode = c.lossyString(.stopCode)
        stopName = c.lossyString(.stopName) ?? "Stop"
        coordinates = try? c.decode(Coordinates.self, forKey: .coordinates)
        distanceMeters = c.lossyDouble(.distanceMeters)
    }
}

struct NearbyStop: Decodable, Identifiable {
    let stop: StopInfo
    let routes: [RouteBadge]
    let arrivals: [Arrival]

    var id: String { stop.stopId }
}

struct NearbyResponse: Decodable {
    let stops: [NearbyStop]
}

struct StopArrivalsResponse: Decodable {
    let stop: StopInfo
    let arrivals: [Arrival]
}

struct StationArrivalsResponse: Decodable {
    struct Station: Decodable { let name: String }
    let station: Station
    let arrivals: [Arrival]
}

/// What the sheet navigates to when a stop or station is chosen.
struct StopRef: Hashable, Identifiable {
    enum Kind: Hashable {
        case stop(id: String)
        case station(name: String, line: String?)
    }

    let kind: Kind
    let title: String
    let latitude: Double
    let longitude: Double

    var id: String {
        switch kind {
        case .stop(let id): "stop-\(id)"
        case .station(let name, let line): "station-\(name)-\(line ?? "")"
        }
    }

    var coordinate: CLLocationCoordinate2D { .init(latitude: latitude, longitude: longitude) }
}

// MARK: - Vehicles

struct Vehicle: Decodable, Identifiable {
    struct Position: Decodable {
        let latitude: Double
        let longitude: Double
        let bearing: Double?

        enum CodingKeys: String, CodingKey { case latitude, longitude, bearing }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            guard let lat = c.lossyDouble(.latitude), let lon = c.lossyDouble(.longitude) else {
                throw DecodingError.dataCorruptedError(forKey: .latitude, in: c, debugDescription: "Missing position")
            }
            latitude = lat
            longitude = lon
            bearing = c.lossyDouble(.bearing)
        }
    }

    let vehicleId: String
    let routeId: String?
    let routeShortName: String?
    let line: String?
    let color: String?
    let headsign: String?
    let position: Position

    var id: String { vehicleId }
    var coordinate: CLLocationCoordinate2D { .init(latitude: position.latitude, longitude: position.longitude) }

    enum CodingKeys: String, CodingKey {
        case vehicleId, routeId, routeShortName, line, color, headsign, position
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard let id = c.lossyString(.vehicleId) else {
            throw DecodingError.dataCorruptedError(forKey: .vehicleId, in: c, debugDescription: "No vehicle id")
        }
        vehicleId = id
        routeId = c.lossyString(.routeId)
        routeShortName = c.lossyString(.routeShortName)
        line = c.lossyString(.line)
        color = c.lossyString(.color)
        headsign = c.lossyString(.headsign)
        position = try c.decode(Position.self, forKey: .position)
    }
}

struct VehiclesResponse: Decodable {
    /// Elements that fail to decode (a bus with no position, say) are dropped, not fatal.
    let vehicles: [Vehicle]

    enum CodingKeys: String, CodingKey { case vehicles }

    private struct Lossy<T: Decodable>: Decodable {
        let value: T?
        init(from decoder: Decoder) throws { value = try? T(from: decoder) }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let raw = try c.decode([Lossy<Vehicle>].self, forKey: .vehicles)
        vehicles = raw.compactMap(\.value)
    }
}
