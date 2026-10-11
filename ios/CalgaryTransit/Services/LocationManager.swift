import CoreLocation
import Observation

@Observable
final class LocationManager: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()

    var location: CLLocation?
    var status: CLAuthorizationStatus

    var isAuthorized: Bool { status == .authorizedWhenInUse || status == .authorizedAlways }

    override init() {
        status = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 10
    }

    func start() {
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways: manager.startUpdatingLocation()
        default: break
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        status = manager.authorizationStatus
        if isAuthorized { manager.startUpdatingLocation() }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // Drop invalid, stale (cached) or very coarse fixes so we never centre on a wrong spot.
        guard let fix = locations.last(where: {
            $0.horizontalAccuracy > 0 && $0.horizontalAccuracy <= 200 && abs($0.timestamp.timeIntervalSinceNow) < 15
        }) else { return }
        location = fix
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}
