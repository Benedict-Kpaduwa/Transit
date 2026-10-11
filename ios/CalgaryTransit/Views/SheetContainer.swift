import SwiftUI

struct SheetContainer: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model

        NavigationStack(path: $model.path) {
            HomeSheet()
                .navigationDestination(for: SheetRoute.self) { route in
                    switch route {
                    case .stop(let ref): StopDetailView(ref: ref)
                    case .place(let place): PlaceDetailView(place: place)
                    case .planner: PlannerView()
                    }
                }
        }
        .onChange(of: model.path.isEmpty) { _, isEmpty in
            if isEmpty { model.pin = nil; model.clearRoute() }
        }
    }
}
