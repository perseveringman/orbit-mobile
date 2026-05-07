import SwiftUI
import WidgetKit

private struct CaptureEntry: TimelineEntry {
  let date: Date
}

private struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> CaptureEntry {
    CaptureEntry(date: Date())
  }

  func getSnapshot(in context: Context, completion: @escaping (CaptureEntry) -> Void) {
    completion(CaptureEntry(date: Date()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<CaptureEntry>) -> Void) {
    completion(Timeline(entries: [CaptureEntry(date: Date())], policy: .after(Date().addingTimeInterval(3600))))
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
          Text("Tap to capture a thought, voice note, or photo.").font(.caption)
          Text("记一条").font(.title3.bold())
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
