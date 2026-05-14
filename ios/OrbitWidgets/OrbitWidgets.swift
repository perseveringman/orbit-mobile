import SwiftUI
import WidgetKit

private struct CaptureEntry: TimelineEntry {
  let date: Date
  let items: [WidgetCaptureItem]
}

private struct WidgetSnapshot: Decodable {
  let schema_version: Int
  let updated_at: String
  let items: [WidgetCaptureItem]
}

private struct WidgetCaptureItem: Decodable, Identifiable {
  let id: String
  let kind: String
  let title: String
  let captured_at: String
}

private struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> CaptureEntry {
    CaptureEntry(date: Date(), items: [])
  }

  func getSnapshot(in context: Context, completion: @escaping (CaptureEntry) -> Void) {
    completion(CaptureEntry(date: Date(), items: loadSnapshotItems()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<CaptureEntry>) -> Void) {
    completion(Timeline(
      entries: [CaptureEntry(date: Date(), items: loadSnapshotItems())],
      policy: .after(Date().addingTimeInterval(1800))
    ))
  }

  private func loadSnapshotItems() -> [WidgetCaptureItem] {
    guard let container = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: "group.com.zhouyanbo.orbit.capture"
    ) else {
      return []
    }
    let url = container.appendingPathComponent("widget/recent.json")
    guard let data = try? Data(contentsOf: url),
          let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
          snapshot.schema_version == 1 else {
      return []
    }
    return Array(snapshot.items.prefix(3))
  }
}

private struct OrbitCaptureWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: CaptureEntry

  var body: some View {
    Link(destination: URL(string: "orbit-mobile://")!) {
      switch family {
      case .systemMedium:
        VStack(alignment: .leading, spacing: 8) {
          Text("Orbit Capture").font(.headline)
          if entry.items.isEmpty {
            Text("Tap to capture a thought, voice note, or photo.").font(.caption)
          } else {
            ForEach(entry.items) { item in
              HStack(spacing: 6) {
                Text(icon(for: item.kind)).font(.caption.bold())
                Text(item.title).font(.caption).lineLimit(1)
              }
            }
          }
          Text("记一条").font(.caption.bold())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      case .accessoryCircular:
        Text("O").font(.headline)
      case .accessoryRectangular:
        Text("Orbit · 记一条")
      default:
        VStack(spacing: 8) {
          Text("Orbit").font(.headline)
          Text("记一条").font(.caption.bold())
        }
      }
    }
    .orbitWidgetBackground()
  }

  private func icon(for kind: String) -> String {
    switch kind {
    case "voice": return "●"
    case "photo": return "▧"
    case "share": return "↗"
    case "recording": return "◉"
    case "mixed": return "◎"
    default: return "✎"
    }
  }
}

struct OrbitCaptureWidget: Widget {
  let kind = "OrbitCaptureWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      OrbitCaptureWidgetView(entry: entry)
    }
    .configurationDisplayName("Orbit Capture")
    .description("Open Orbit Mobile directly into capture.")
    .supportedFamilies(supportedFamilies)
  }

  private var supportedFamilies: [WidgetFamily] {
    var families: [WidgetFamily] = [.systemSmall, .systemMedium]
    if #available(iOSApplicationExtension 16.0, *) {
      families.append(contentsOf: [.accessoryCircular, .accessoryRectangular])
    }
    return families
  }
}

private extension View {
  @ViewBuilder
  func orbitWidgetBackground() -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      self.containerBackground(.background, for: .widget)
    } else {
      self.background(Color(.systemBackground))
    }
  }
}

@main
struct OrbitWidgetsBundle: WidgetBundle {
  var body: some Widget {
    OrbitCaptureWidget()
  }
}
