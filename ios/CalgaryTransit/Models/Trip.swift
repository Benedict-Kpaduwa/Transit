import Foundation
import SwiftUI
import CoreLocation

struct TripPlace: Decodable {
    let name: String?
    let coordinate: CLLocationCoordinate2D?

    enum CodingKeys: String, CodingKey { case name, coordinates }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = c.lossyString(.name)
        coordinate = (try? c.decode([Double].self, forKey: .coordinates)).flatMap(GeoGeometry.coordinate)
    }
}

struct TripSegment: Decodable, Identifiable {
    let id = UUID()
    let type: String
    let instruction: String?
    let vehicleType: String?
    let routeShortName: String?
    let line: String?
    let color: String?
    let headsign: String?
    let from: TripPlace?
    let to: TripPlace?
    let numStops: Int?
    let duration: Double          // seconds
    let distance: Double?         // metres (walk)
    let departureTime: Date?
    let arrivalTime: Date?
    let path: [CLLocationCoordinate2D]

    var isWalk: Bool { type == "walk" }
    var isCTrain: Bool { vehicleType == "CTrain" }

    var tint: Color {
        if isWalk { return .secondary }
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

    var minutes: Int { max(1, Int((duration / 60).rounded())) }

    enum CodingKeys: String, CodingKey {
        case type, instruction, vehicleType, routeShortName, line, color, headsign
        case from, to, numStops, duration, distance, departureTime, arrivalTime, geometry
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        type = (try? c.decode(String.self, forKey: .type)) ?? "transit"
        instruction = c.lossyString(.instruction)
        vehicleType = c.lossyString(.vehicleType)
        routeShortName = c.lossyString(.routeShortName)
        line = c.lossyString(.line)
        color = c.lossyString(.color)
        headsign = c.lossyString(.headsign)
        from = try? c.decode(TripPlace.self, forKey: .from)
        to = try? c.decode(TripPlace.self, forKey: .to)
        numStops = c.lossyDouble(.numStops).map(Int.init)
        duration = c.lossyDouble(.duration) ?? 0
        distance = c.lossyDouble(.distance)
        departureTime = c.lossyDouble(.departureTime).map { Date(timeIntervalSince1970: $0) }
        arrivalTime = c.lossyDouble(.arrivalTime).map { Date(timeIntervalSince1970: $0) }

        var coords = (try? c.decode(GeoGeometry.self, forKey: .geometry))?.lines.first ?? []
        if coords.count < 2, let a = from?.coordinate, let b = to?.coordinate {
            coords = [a, b]   // no usable shape: straight line between the two stops
        }
        path = coords
    }
}

struct TripSummary: Decodable {
    let totalDuration: Double
    let totalWalkingDistanceText: String?
    let transitLine: String?
    let numTransfers: Int?
    let fare: String?
    let departAt: Date?
    let arriveAt: Date?

    enum CodingKeys: String, CodingKey {
        case totalDuration, totalWalkingDistanceText, transitLine, numTransfers, fare, departAt, arriveAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        totalDuration = c.lossyDouble(.totalDuration) ?? 0
        totalWalkingDistanceText = c.lossyString(.totalWalkingDistanceText)
        transitLine = c.lossyString(.transitLine)
        numTransfers = c.lossyDouble(.numTransfers).map(Int.init)
        fare = c.lossyString(.fare)
        departAt = c.lossyDouble(.departAt).map { Date(timeIntervalSince1970: $0) }
        arriveAt = c.lossyDouble(.arriveAt).map { Date(timeIntervalSince1970: $0) }
    }
}

struct TripRoute: Decodable, Identifiable {
    let id = UUID()
    let segments: [TripSegment]
    let summary: TripSummary

    var minutes: Int { max(1, Int((summary.totalDuration / 60).rounded())) }

    var coordinates: [CLLocationCoordinate2D] { segments.flatMap(\.path) }

    enum CodingKeys: String, CodingKey { case segments, summary }
}

struct TripPlanResponse: Decodable {
    let success: Bool
    let error: String?
    let suggestion: String?
    let routes: [TripRoute]

    enum CodingKeys: String, CodingKey { case success, error, suggestion, routes, segments, summary }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        success = (try? c.decode(Bool.self, forKey: .success)) ?? false
        error = try? c.decode(String.self, forKey: .error)
        suggestion = try? c.decode(String.self, forKey: .suggestion)

        if let routes = try? c.decode([TripRoute].self, forKey: .routes), !routes.isEmpty {
            self.routes = routes
        } else if let segments = try? c.decode([TripSegment].self, forKey: .segments),
                  let summary = try? c.decode(TripSummary.self, forKey: .summary) {
            // The GTFS fallback planner returns a single plan at the top level.
            routes = [TripRoute(segments: segments, summary: summary)]
        } else {
            routes = []
        }
    }
}
