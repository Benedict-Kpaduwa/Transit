import SwiftUI
import MapKit

struct StopDetailView: View {
    @Environment(AppModel.self) private var model
    let ref: StopRef

    @State private var arrivals: [Arrival] = []
    @State private var loading = true
    @State private var failed = false

    var body: some View {
        List {
            Section {
                Button {
                    let coordinate = ref.coordinate
                    model.startDirections(to: PlaceRef(name: ref.title, subtitle: "Transit stop", coordinate: coordinate))
                } label: {
                    Label("Directions to here", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                }
            }

            Section("Departures") {
                if loading {
                    ProgressView().frame(maxWidth: .infinity)
                } else if failed {
                    Label("Couldn't load departures.", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.secondary)
                } else if arrivals.isEmpty {
                    Text("No upcoming departures.").foregroundStyle(.secondary)
                }
                ForEach(arrivals) { ArrivalRow(arrival: $0) }
            }
        }
        .navigationTitle(ref.title)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: ref.id) {
            while !Task.isCancelled {
                do {
                    arrivals = try await model.api.arrivals(for: ref)
                    failed = false
                } catch {
                    failed = arrivals.isEmpty
                }
                loading = false
                try? await Task.sleep(for: .seconds(20))
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Close") { model.goHome() }
            }
        }
    }
}
