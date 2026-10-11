import SwiftUI
import MapKit

struct HomeSheet: View {
    @Environment(AppModel.self) private var model
    @State private var search = PlaceSearch()
    @FocusState private var searchFocused: Bool

    var body: some View {
        @Bindable var model = model

        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Where to?", text: $search.query)
                    .focused($searchFocused)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                if !search.query.isEmpty {
                    Button { search.query = "" } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    }
                }
            }
            .padding(10)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal)
            .padding(.top, 16)
            .padding(.bottom, 8)

            if search.query.isEmpty {
                NearbyList()
            } else {
                SearchResultsList(search: search) { item in
                    search.query = ""
                    searchFocused = false
                    model.show(place: PlaceRef(item))
                }
            }
        }
        .onChange(of: searchFocused) { _, focused in
            if focused { model.sheetDetent = .large }
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}

struct SearchResultsList: View {
    let search: PlaceSearch
    let onPick: (MKMapItem) -> Void

    var body: some View {
        List(search.results, id: \.self) { completion in
            Button {
                Task {
                    if let item = await search.resolve(completion) { onPick(item) }
                }
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.red)
                    VStack(alignment: .leading) {
                        Text(completion.title).foregroundStyle(.primary)
                        if !completion.subtitle.isEmpty {
                            Text(completion.subtitle).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
    }
}

struct NearbyList: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model

        List {
            Section {
                Toggle(isOn: $model.showBuses) {
                    Label("Show buses on map", systemImage: "bus.fill")
                }
                .onChange(of: model.showBuses) { _, on in
                    if on { Task { if let b = try? await model.api.buses() { model.buses = b } } }
                }
            } footer: {
                if model.showBuses { Text("\(model.buses.count) buses live across the city.") }
            }

            Section("Nearby departures") {
                if model.nearbyLoading {
                    ProgressView().frame(maxWidth: .infinity)
                } else if let error = model.nearbyError, model.nearby.isEmpty {
                    Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(.secondary)
                } else if model.nearby.isEmpty {
                    Text("No stops found nearby.").foregroundStyle(.secondary)
                }

                ForEach(model.nearby) { entry in
                    Button {
                        model.open(StopRef(
                            kind: .stop(id: entry.stop.stopId),
                            title: entry.stop.stopName,
                            latitude: entry.stop.coordinates?.latitude ?? AppModel.calgaryCenter.latitude,
                            longitude: entry.stop.coordinates?.longitude ?? AppModel.calgaryCenter.longitude
                        ))
                    } label: {
                        NearbyStopCard(entry: entry)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await model.refreshNearby(force: true) }
        .task(id: model.location.location?.coordinate.latitude) {
            await model.refreshNearby()
        }
        .task {
            // Keep the countdowns fresh while the list is visible.
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                await model.refreshNearby(force: true)
            }
        }
    }
}

struct NearbyStopCard: View {
    let entry: NearbyStop

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(entry.stop.stopName).font(.headline).lineLimit(1)
                Spacer()
                if let d = entry.stop.distanceMeters {
                    Text("\(Int(d)) m").font(.caption).foregroundStyle(.secondary)
                }
            }
            if entry.arrivals.isEmpty {
                Text("No upcoming departures").font(.subheadline).foregroundStyle(.secondary)
            } else {
                ForEach(entry.arrivals.prefix(3)) { ArrivalRow(arrival: $0) }
            }
        }
        .padding(.vertical, 4)
    }
}
