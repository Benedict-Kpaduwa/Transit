import Foundation
import CoreLocation
import SwiftUI

/// The backend is loose about types (ids arrive as strings or ints, coordinates as
/// strings or numbers), so models read fields through these tolerant helpers.
extension KeyedDecodingContainer {
    func lossyString(_ key: Key) -> String? {
        if let s = try? decode(String.self, forKey: key) { return s }
        if let i = try? decode(Int.self, forKey: key) { return String(i) }
        if let d = try? decode(Double.self, forKey: key) { return String(d) }
        return nil
    }

    func lossyDouble(_ key: Key) -> Double? {
        if let d = try? decode(Double.self, forKey: key) { return d }
        if let s = try? decode(String.self, forKey: key) { return Double(s) }
        return nil
    }
}

extension JSONDecoder {
    static let api: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()
}

struct Coordinates: Decodable, Hashable {
    let latitude: Double
    let longitude: Double

    var clCoordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    enum CodingKeys: String, CodingKey { case latitude, longitude }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard let lat = c.lossyDouble(.latitude), let lon = c.lossyDouble(.longitude) else {
            throw DecodingError.dataCorruptedError(forKey: .latitude, in: c, debugDescription: "Missing coordinates")
        }
        latitude = lat
        longitude = lon
    }
}

// MARK: - Colours

extension Color {
    /// Accepts "DA291C" or "#DA291C".
    init?(hex: String?) {
        guard var s = hex?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return nil }
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self.init(
            red: Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue: Double(v & 0xFF) / 255
        )
    }

    static let ctrainRed = Color(hex: "DA291C")!
    static let ctrainBlue = Color(hex: "0072CE")!
    static let busGrey = Color(hex: "5B6770")!
}

enum TransitLine {
    case red, blue, shared, other

    init(_ raw: String?) {
        let s = (raw ?? "").uppercased()
        let hasRed = s.contains("RED") || s == "201"
        let hasBlue = s.contains("BLUE") || s == "202"
        switch (hasRed, hasBlue) {
        case (true, true): self = .shared
        case (true, false): self = .red
        case (false, true): self = .blue
        default: self = .other
        }
    }

    var color: Color {
        switch self {
        case .red: .ctrainRed
        case .blue: .ctrainBlue
        case .shared: .purple
        case .other: .busGrey
        }
    }
}
