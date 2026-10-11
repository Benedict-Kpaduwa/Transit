import SwiftUI

/// Rounded route label, e.g. "Red" or "72".
struct LineBadge: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.subheadline.weight(.bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 9)
            .frame(minWidth: 40, minHeight: 28)
            .background(color, in: RoundedRectangle(cornerRadius: 8))
    }
}

struct ArrivalRow: View {
    let arrival: Arrival

    var body: some View {
        HStack(spacing: 12) {
            LineBadge(text: arrival.badgeText, color: arrival.badgeColor)
            VStack(alignment: .leading, spacing: 2) {
                Text(arrival.headsign ?? "—")
                    .font(.body)
                    .lineLimit(1)
                if arrival.delayMinutes >= 1 {
                    Text("Delayed \(Int(arrival.delayMinutes.rounded())) min")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
            Spacer()
            Text(arrival.timeText)
                .font(.body.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(arrival.minutesAway <= 2 ? Color.green : .primary)
        }
    }
}
