import SwiftUI
import MapKit
import Observation

struct PlaceRef: Hashable {
    let name: String
    let subtitle: String
    let latitude: Double
    let longitude: Double

    var coordinate: CLLocationCoordinate2D { .init(latitude: latitude, longitude: longitude) }

    init(name: String, subtitle: String, coordinate: CLLocationCoordinate2D) {
        self.name = name
        self.subtitle = subtitle
        latitude = coordinate.latitude
        longitude = coordinate.longitude
    }

    init(_ item: MKMapItem) {
        let p = item.placemark
        self.init(
            name: item.name ?? p.name ?? "Dropped pin",
            subtitle: [p.subThoroughfare, p.thoroughfare, p.locality].compactMap { $0 }.joined(separator: " "),
            coordinate: p.coordinate
        )
    }
}

enum SheetRoute: Hashable {
    case stop(StopRef)
    case place(PlaceRef)
    case planner
}

enum TravelMode: String, CaseIterable, Identifiable {
    case transit = "Transit", walk = "Walk", drive = "Drive"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .transit: "tram.fill"
        case .walk: "figure.walk"
        case .drive: "car.fill"
        }
    }
}

@MainActor
@Observable
final class AppModel {
    static let calgaryCenter = CLLocationCoordinate2D(latitude: 51.0447, longitude: -114.0708)

    let api = APIClient.shared
    let location = LocationManager()

    // Map data
    var stations: [Station] = []
    var tracks: [TrackLine] = []
    var ctrains: [Vehicle] = []
    var buses: [Vehicle] = []
    var showBuses = false
    var mapIsZoomedIn = false
    var camera: MapCameraPosition = .region(MKCoordinateRegion(
        center: AppModel.calgaryCenter,
        span: MKCoordinateSpan(latitudeDelta: 0.22, longitudeDelta: 0.22)
    ))

    var currentCamera: MapCamera?
    var is3D = false
    var satellite = false
    private var centeredOnUser = false

    // Sheet
    var path: [SheetRoute] = []
    var sheetDetent: PresentationDetent = .height(150)

    // Nearby departures
    var nearby: [NearbyStop] = []
    var nearbyLoading = false
    var nearbyError: String?

    // Pin + planned trip drawn on the map
    var pin: PlaceRef?
    var mode: TravelMode = .transit
    var origin: PlaceRef?              // nil means "my location"
    var destination: PlaceRef?
    var tripRoutes: [TripRoute] = []
    var selectedTripIndex = 0
    var appleRoute: MKRoute?           // walk / drive result
    var planning = false
    var planError: String?

    private var lastNearbyFetch: CLLocationCoordinate2D?

    var selectedTrip: TripRoute? {
        tripRoutes.indices.contains(selectedTripIndex) ? tripRoutes[selectedTripIndex] : nil
    }

    var hasRouteOnMap: Bool { selectedTrip != nil || appleRoute != nil }

    // MARK: Loading

    func start() async {
        location.start()
        async let s: Void = loadStatic()
        async let n: Void = refreshNearby(force: true)
        _ = await (s, n)
    }

    private func loadStatic() async {
        // The backend loads GTFS in the background after boot, so retry a few times.
        for attempt in 0..<4 {
            if let stations = try? await api.lrtStations(), !stations.isEmpty {
                self.stations = stations
                self.tracks = (try? await api.lrtTracks()) ?? []
                return
            }
            try? await Task.sleep(for: .seconds(Double(attempt + 1) * 2))
        }
    }

    /// Polls vehicle positions while the map is on screen.
    func pollVehicles() async {
        while !Task.isCancelled {
            if let t = try? await api.ctrains() { ctrains = t }
            if showBuses, let b = try? await api.buses() { buses = b }
            try? await Task.sleep(for: .seconds(15))
        }
    }

    func refreshNearby(force: Bool = false) async {
        let center = location.location?.coordinate ?? Self.calgaryCenter
        if !force, let last = lastNearbyFetch,
           CLLocation(latitude: last.latitude, longitude: last.longitude)
            .distance(from: CLLocation(latitude: center.latitude, longitude: center.longitude)) < 150 {
            return
        }
        nearbyLoading = nearby.isEmpty
        defer { nearbyLoading = false }
        do {
            nearby = try await api.nearby(center)
            nearbyError = nil
            lastNearbyFetch = center
        } catch {
            nearbyError = error.localizedDescription
        }
    }

    // MARK: Map controls

    /// Centre on the user the first time a GPS fix arrives, unless they've already opened something.
    func locationUpdated() {
        guard !centeredOnUser, path.isEmpty, location.location != nil else { return }  // only fixes LocationManager accepted as accurate/fresh
        centeredOnUser = true
        centerOnUser()
    }

    func centerOnUser() {
        guard let loc = location.location else {
            location.start()
            return
        }
        withAnimation {
            camera = .camera(MapCamera(
                centerCoordinate: loc.coordinate,
                distance: 2500,
                heading: 0,
                pitch: is3D ? 60 : 0
            ))
        }
    }

    func toggle3D() {
        is3D.toggle()
        let cam = currentCamera ?? MapCamera(centerCoordinate: Self.calgaryCenter, distance: 8000)
        withAnimation {
            camera = .camera(MapCamera(
                centerCoordinate: cam.centerCoordinate,
                distance: is3D ? min(cam.distance, 3000) : cam.distance,
                heading: cam.heading,
                pitch: is3D ? 60 : 0
            ))
        }
    }

    // MARK: Navigation

    func open(_ ref: StopRef) {
        path = [.stop(ref)]
        sheetDetent = .medium
        camera = .camera(MapCamera(centerCoordinate: ref.coordinate, distance: 1800))
    }

    func show(place: PlaceRef) {
        pin = place
        path = [.place(place)]
        sheetDetent = .medium
        camera = .camera(MapCamera(centerCoordinate: place.coordinate, distance: 2500))
    }

    func startDirections(to place: PlaceRef) {
        destination = place
        pin = place
        origin = nil
        clearRoute()
        if path.last != .planner { path.append(.planner) }
        sheetDetent = .medium
        Task { await plan() }
    }

    func goHome() {
        path = []
        pin = nil
        destination = nil
        origin = nil
        clearRoute()
        sheetDetent = .height(150)
    }

    func clearRoute() {
        tripRoutes = []
        selectedTripIndex = 0
        appleRoute = nil
        planError = nil
    }

    // MARK: Trip planning

    private var originCoordinate: CLLocationCoordinate2D {
        origin?.coordinate ?? location.location?.coordinate ?? Self.calgaryCenter
    }

    func plan() async {
        guard let destination else { return }
        planning = true
        planError = nil
        clearRouteKeepingError()
        defer { planning = false }

        let from = originCoordinate
        let to = destination.coordinate

        switch mode {
        case .transit:
            do {
                let response = try await api.planTrip(from: from, to: to)
                guard !Task.isCancelled else { return }
                if response.success, !response.routes.isEmpty {
                    tripRoutes = response.routes
                    selectedTripIndex = 0
                    fit(response.routes[0].coordinates)
                } else {
                    planError = [response.error, response.suggestion].compactMap { $0 }.joined(separator: ". ")
                }
            } catch {
                planError = error.localizedDescription
            }
        case .walk, .drive:
            let request = MKDirections.Request()
            request.source = MKMapItem(placemark: MKPlacemark(coordinate: from))
            request.destination = MKMapItem(placemark: MKPlacemark(coordinate: to))
            request.transportType = mode == .walk ? .walking : .automobile
            do {
                let response = try await MKDirections(request: request).calculate()
                appleRoute = response.routes.first
                if let route = appleRoute {
                    camera = .rect(route.polyline.boundingMapRect.insetBy(dx: -1500, dy: -1500))
                }
            } catch {
                planError = "No \(mode == .walk ? "walking" : "driving") route found."
            }
        }
    }

    private func clearRouteKeepingError() {
        tripRoutes = []
        selectedTripIndex = 0
        appleRoute = nil
    }

    func select(tripAt index: Int) {
        selectedTripIndex = index
        if let trip = selectedTrip { fit(trip.coordinates) }
    }

    private func fit(_ coords: [CLLocationCoordinate2D]) {
        guard !coords.isEmpty else { return }
        var rect = MKMapRect.null
        for c in coords {
            let p = MKMapPoint(c)
            rect = rect.union(MKMapRect(x: p.x, y: p.y, width: 0, height: 0))
        }
        camera = .rect(rect.insetBy(dx: -rect.width * 0.2 - 800, dy: -rect.height * 0.35 - 800))
    }
}
