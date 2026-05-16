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

  private static let actions = [
    WidgetAction(
      id: "note",
      title: "笔记",
      subtitle: "写一条",
      systemImage: "note.text",
      tint: .blue,
      url: URL(string: "orbit-mobile://")!
    ),
    WidgetAction(
      id: "iphone-recording",
      title: "iPhone 录音",
      subtitle: "手机麦克风",
      systemImage: "mic.fill",
      tint: .red,
      url: URL(string: "orbit-mobile://recording/new")!
    ),
    WidgetAction(
      id: "x1-recording",
      title: "X1 录音",
      subtitle: "录音笔",
      systemImage: "antenna.radiowaves.left.and.right",
      tint: .green,
      url: URL(string: "orbit-mobile://recording/x1-session")!
    )
  ]

  var body: some View {
    Group {
      switch family {
      case .systemMedium:
        mediumBody
      case .accessoryCircular:
        accessoryCircularBody
      case .accessoryRectangular:
        accessoryRectangularBody
      default:
        smallBody
      }
    }
    .orbitWidgetBackground()
  }

  private var mediumBody: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text("Orbit Capture")
          .font(.headline)
          .fontWeight(.bold)
        Spacer(minLength: 8)
        Text("快速入口")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }

      HStack(spacing: 8) {
        ForEach(Self.actions) { action in
          WidgetActionButton(action: action, layout: .medium)
        }
      }
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }

  private var smallBody: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Orbit")
        .font(.headline)
        .fontWeight(.bold)

      VStack(spacing: 6) {
        ForEach(Self.actions) { action in
          WidgetActionButton(action: action, layout: .small)
        }
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  private var accessoryCircularBody: some View {
    Link(destination: Self.actions[0].url) {
      Image(systemName: Self.actions[0].systemImage)
        .font(.headline)
    }
    .accessibilityLabel(Self.actions[0].title)
  }

  private var accessoryRectangularBody: some View {
    HStack(spacing: 6) {
      ForEach(Self.actions) { action in
        Link(destination: action.url) {
          Image(systemName: action.systemImage)
        }
        .accessibilityLabel(action.title)
      }
    }
  }
}

private struct WidgetAction: Identifiable {
  let id: String
  let title: String
  let subtitle: String
  let systemImage: String
  let tint: Color
  let url: URL
}

private enum WidgetActionLayout {
  case medium
  case small
}

private struct WidgetActionButton: View {
  let action: WidgetAction
  let layout: WidgetActionLayout

  var body: some View {
    Link(destination: action.url) {
      switch layout {
      case .medium:
        VStack(alignment: .leading, spacing: 6) {
          icon
          VStack(alignment: .leading, spacing: 2) {
            Text(action.title)
              .font(.caption)
              .fontWeight(.bold)
              .lineLimit(1)
            Text(action.subtitle)
              .font(.caption2)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
        }
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 84, alignment: .leading)
        .background(action.tint.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
      case .small:
        HStack(spacing: 7) {
          icon
          Text(action.title)
            .font(.caption2)
            .fontWeight(.bold)
            .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, minHeight: 28, alignment: .leading)
        .background(action.tint.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(action.title)
  }

  private var icon: some View {
    Image(systemName: action.systemImage)
      .font(.system(size: 13, weight: .bold))
      .foregroundStyle(action.tint)
      .frame(width: 18, height: 18)
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
