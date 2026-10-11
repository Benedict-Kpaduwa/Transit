import MapKit
import Observation

/// Apple Maps place search. Replaces the Mapbox Search Box / geocoding calls the web app makes.
@Observable
final class PlaceSearch: NSObject, MKLocalSearchCompleterDelegate {
    static let calgaryRegion = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 51.0447, longitude: -114.0708),
        span: MKCoordinateSpan(latitudeDelta: 0.45, longitudeDelta: 0.5)
    )

    var query = "" {
        didSet { completer.queryFragment = query }
    }
    private(set) var results: [MKLocalSearchCompletion] = []

    private let completer = MKLocalSearchCompleter()

    override init() {
        super.init()
        completer.delegate = self
        completer.region = Self.calgaryRegion
        completer.resultTypes = [.address, .pointOfInterest, .query]
    }

    func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
        results = completer.results
    }

    func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {}

    /// Resolve a completion into a concrete map item with coordinates.
    func resolve(_ completion: MKLocalSearchCompletion) async -> MKMapItem? {
        let request = MKLocalSearch.Request(completion: completion)
        request.region = Self.calgaryRegion
        return try? await MKLocalSearch(request: request).start().mapItems.first
    }
}
