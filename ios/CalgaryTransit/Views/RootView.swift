import SwiftUI

/// Full-screen Apple Maps with a persistent bottom sheet, like the Maps app itself.
struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var sheetShown = true

    var body: some View {
        ZStack(alignment: .topTrailing) {
            TransitMapView().ignoresSafeArea()
            MapButtons()
        }
            .task { await model.start() }
            .task { await model.pollVehicles() }
            .sheet(isPresented: $sheetShown) {
                SheetContainer()
                    .presentationDetents([.height(150), .medium, .large], selection: Bindable(model).sheetDetent)
                    .presentationBackgroundInteraction(.enabled(upThrough: .medium))
                    .presentationCornerRadius(24)
                    .interactiveDismissDisabled()
            }
    }
}
