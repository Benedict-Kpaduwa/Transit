import SwiftUI
import MapKit

struct PlannerView: View {
    @Environment(AppModel.self) private var model
    @State private var picking: Field?

    enum Field: Identifiable { case from, to; var id: Self { self } }

    var body: some View {
        @Bindable var model = model

        List {
            Section {
                row("From", model.origin?.name ?? "My Location", icon: "location.fill", tint: .blue) { picking = .from }
                row("To", model.destination?.name ?? "Choose destination", icon: "mappin.circle.fill", tint: .red) { picking = .to }
            }

            Section {
                Picker("Mode", selection: $model.mode) {
                    ForEach(TravelMode.allCases) { Label($0.rawValue, systemImage: $0.icon).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }

            results
        }
        .navigationTitle("Directions")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Close") { model.goHome() }
            }
        }
        .onChange(of: model.mode) { _, _ in Task { await model.plan() } }
        .sheet(item: $picking) { field in
            NavigationStack {
                PlacePicker(title: field == .from ? "Start" : "Destination", allowCurrentLocation: field == .from) { place in
                    picking = nil
                    if field == .from { model.origin = place } else { model.destination = place; model.pin = place }
                    Task { await model.plan() }
                }
            }
            .presentationDetents([.large])
        }
    }

    private func row(_ label: String, _ value: String, icon: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon).foregroundStyle(tint).frame(width: 24)
                Text(label).foregroundStyle(.secondary)
                Spacer()
                Text(value).foregroundStyle(.primary).lineLimit(1)
            }
        }
    }

    @ViewBuilder private var results: some View {
        if model.planning {
            Section { ProgressView("Finding routes…").frame(maxWidth: .infinity) }
        } else if let error = model.planError {
            Section { Label(error.isEmpty ? "No route found." : error, systemImage: "exclamationmark.triangle").foregroundStyle(.secondary) }
        } else if let route = model.appleRoute {
            Section {
                HStack {
                    Image(systemName: model.mode.icon)
                    Text(Duration.seconds(route.expectedTravelTime).formatted(.units(allowed: [.hours, .minutes], width: .abbreviated)))
                        .font(.title3.bold())
                    Spacer()
                    Text(Measurement(value: route.distance, unit: UnitLength.meters)
                        .formatted(.measurement(width: .abbreviated, usage: .road)))
                        .foregroundStyle(.secondary)
                }
            }
        } else if !model.tripRoutes.isEmpty {
            Section("Routes") {
                ForEach(Array(model.tripRoutes.enumerated()), id: \.element.id) { index, route in
                    TripRouteCard(route: route, selected: index == model.selectedTripIndex)
                        .contentShape(Rectangle())
                        .onTapGesture { model.select(tripAt: index) }
                }
            }
            if let trip = model.selectedTrip {
                Section("Steps") {
                    ForEach(trip.segments) { SegmentRow(segment: $0) }
                }
            }
        }
    }
}

struct TripRouteCard: View {
    let route: TripRoute
    let selected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(route.minutes) min").font(.title3.bold())
                Spacer()
                if let a = route.summary.departAt, let b = route.summary.arriveAt {
                    Text("\(a.formatted(date: .omitted, time: .shortened)) – \(b.formatted(date: .omitted, time: .shortened))")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 6) {
                ForEach(route.segments) { seg in
                    if seg.isWalk {
                        Image(systemName: "figure.walk").foregroundStyle(.secondary)
                    } else {
                        LineBadge(text: seg.badgeText, color: seg.tint)
                    }
                    if seg.id != route.segments.last?.id {
                        Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary)
                    }
                }
            }
            HStack(spacing: 12) {
                if let walk = route.summary.totalWalkingDistanceText { Label(walk, systemImage: "figure.walk") }
                if let n = route.summary.numTransfers, n > 0 { Text("\(n) transfer\(n == 1 ? "" : "s")") }
                if let fare = route.summary.fare, !fare.isEmpty { Text(fare) }
            }
            .font(.caption).foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(selected ? Color.accentColor : .clear, lineWidth: 2))
    }
}

struct SegmentRow: View {
    let segment: TripSegment

    private var detailText: String {
        var parts = ["\(segment.minutes) min"]
        if segment.isWalk, let d = segment.distance { parts.append("\(Int(d)) m") }
        if !segment.isWalk, let n = segment.numStops { parts.append("\(n) stop\(n == 1 ? "" : "s")") }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if segment.isWalk {
                Image(systemName: "figure.walk").frame(width: 40).padding(.top, 4)
            } else {
                LineBadge(text: segment.badgeText, color: segment.tint)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(segment.instruction ?? (segment.isWalk ? "Walk" : "Ride"))
                Text(detailText).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

/// Apple Maps search used to pick the start or destination.
struct PlacePicker: View {
    @Environment(AppModel.self) private var model
    let title: String
    let allowCurrentLocation: Bool
    let onPick: (PlaceRef?) -> Void

    @State private var search = PlaceSearch()

    var body: some View {
        VStack(spacing: 0) {
            if allowCurrentLocation {
                Button { onPick(nil) } label: {
                    Label("My Location", systemImage: "location.fill").padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Divider()
            }
            SearchResultsList(search: search) { item in onPick(PlaceRef(item)) }
        }
        .searchable(text: $search.query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search Calgary")
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
