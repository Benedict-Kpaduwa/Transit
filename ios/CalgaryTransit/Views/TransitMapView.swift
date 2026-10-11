import SwiftUI
import MapKit

struct TransitMapView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model

        Map(position: $model.camera) {
            UserAnnotation()

            // LRT track geometry
            ForEach(model.tracks) { track in
                MapPolyline(coordinates: track.coordinates)
                    .stroke(track.line.color.opacity(model.hasRouteOnMap ? 0.35 : 0.9), lineWidth: 4)
            }

            ForEach(model.stations) { station in
                Annotation(station.name, coordinate: station.coordinate, anchor: .center) {
                    StationMarker(station: station)
                        .onTapGesture {
                            model.open(StopRef(
                                kind: .station(name: station.name, line: station.arrivalsLineFilter),
                                title: station.name,
                                latitude: station.latitude,
                                longitude: station.longitude
                            ))
                        }
                }
                .annotationTitles(model.mapIsZoomedIn ? .visible : .hidden)
            }

            ForEach(model.ctrains) { train in
                Annotation(train.headsign ?? "", coordinate: train.coordinate, anchor: .center) {
                    TrainMarker(color: TransitLine(train.line ?? train.routeShortName ?? train.routeId).color)
                }
                .annotationTitles(.hidden)
            }

            if model.showBuses && model.mapIsZoomedIn {
                ForEach(model.buses) { bus in
                    Annotation(bus.routeShortName ?? "", coordinate: bus.coordinate, anchor: .center) {
                        BusMarker(route: bus.routeShortName, color: Color(hex: bus.color) ?? .busGrey)
                    }
                    .annotationTitles(.hidden)
                }
            }

            // Planned trip
            if let trip = model.selectedTrip {
                ForEach(trip.segments) { segment in
                    if segment.path.count > 1 {
                        MapPolyline(coordinates: segment.path)
                            .stroke(
                                segment.isWalk ? Color.blue : segment.tint,
                                style: StrokeStyle(
                                    lineWidth: segment.isWalk ? 5 : 7,
                                    lineCap: .round,
                                    lineJoin: .round,
                                    dash: segment.isWalk ? [1, 9] : []
                                )
                            )
                    }
                }
            }

            if let route = model.appleRoute {
                MapPolyline(route.polyline)
                    .stroke(.blue, style: StrokeStyle(lineWidth: 6, lineCap: .round, lineJoin: .round,
                                                      dash: model.mode == .walk ? [1, 9] : []))
            }

            if let pin = model.pin {
                Marker(pin.name, coordinate: pin.coordinate)
                    .tint(.red)
            }
        }
        .mapStyle(model.satellite
            ? .hybrid(elevation: .realistic)
            : .standard(elevation: .realistic, pointsOfInterest: .including([.publicTransport, .park, .airport, .university, .hospital])))
        .mapControls {
            MapCompass()
            MapScaleView()
        }
        .onMapCameraChange(frequency: .onEnd) { context in
            model.mapIsZoomedIn = context.region.span.latitudeDelta < 0.06
            model.currentCamera = context.camera
            model.is3D = context.camera.pitch > 5
        }
        .onChange(of: model.location.location) { _, _ in model.locationUpdated() }
    }
}

// MARK: - Markers

struct StationMarker: View {
    let station: Station

    var body: some View {
        Circle()
            .fill(.white)
            .frame(width: 14, height: 14)
            .overlay(Circle().stroke(station.line.color, lineWidth: 3.5))
            .shadow(color: .black.opacity(0.25), radius: 1.5, y: 1)
            .contentShape(Circle().inset(by: -10))
    }
}

struct TrainMarker: View {
    let color: Color

    var body: some View {
        Image(systemName: "tram.fill")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: 26, height: 26)
            .background(color, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(.white, lineWidth: 2))
            .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
    }
}

struct BusMarker: View {
    let route: String?
    let color: Color

    var body: some View {
        Text(route ?? "")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 4)
            .frame(minWidth: 20, minHeight: 16)
            .background(color, in: Capsule())
            .overlay(Capsule().stroke(.white, lineWidth: 1.5))
    }
}

/// Floating map buttons: locate me, 2D/3D, map type.
struct MapButtons: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 0) {
            button(model.location.isAuthorized ? "location.fill" : "location.slash") { model.centerOnUser() }
            Divider().frame(width: 36)
            button(nil, label: model.is3D ? "2D" : "3D") { model.toggle3D() }
            Divider().frame(width: 36)
            button(model.satellite ? "map" : "globe.americas.fill") { model.satellite.toggle() }
        }
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.15), radius: 4, y: 1)
        .padding(.trailing, 12)
        .padding(.top, 8)
    }

    private func button(_ symbol: String?, label: String? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Group {
                if let label { Text(label).font(.system(size: 15, weight: .bold)) }
                else if let symbol { Image(systemName: symbol).font(.system(size: 17)) }
            }
            .frame(width: 44, height: 44)
        }
    }
}
