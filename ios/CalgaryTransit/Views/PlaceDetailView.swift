import SwiftUI

struct PlaceDetailView: View {
    @Environment(AppModel.self) private var model
    let place: PlaceRef

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(place.name).font(.title2.bold())
                if !place.subtitle.isEmpty {
                    Text(place.subtitle).foregroundStyle(.secondary)
                }
            }

            Button {
                model.startDirections(to: place)
            } label: {
                Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)

            Spacer()
        }
        .padding()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Close") { model.goHome() }
            }
        }
    }
}
