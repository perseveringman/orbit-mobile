import ExpoModulesCore
import UIKit

public class OrbitImageToolsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OrbitImageTools")

    AsyncFunction("compressImage") { (uri: String, options: [String: Any]) throws -> [String: Any] in
      let sourceURL = self.fileURL(uri)
      let maxLongEdge = max(320, min(4096, (options["maxLongEdge"] as? Int) ?? 2048))
      let quality = max(0.2, min(1.0, (options["quality"] as? Double) ?? 0.82))
      let filename = self.safeFilename((options["filename"] as? String) ?? "photo.jpg")

      let data = try Data(contentsOf: sourceURL)
      guard let image = UIImage(data: data) else {
        throw ImageToolsException("image.decode_failed")
      }
      guard let cgImage = image.cgImage else {
        throw ImageToolsException("image.cgimage_unavailable")
      }

      let originalWidth = cgImage.width
      let originalHeight = cgImage.height
      let longEdge = max(originalWidth, originalHeight)
      let scale = longEdge > maxLongEdge ? Double(maxLongEdge) / Double(longEdge) : 1.0
      let targetWidth = max(1, Int((Double(originalWidth) * scale).rounded()))
      let targetHeight = max(1, Int((Double(originalHeight) * scale).rounded()))

      let rendererFormat = UIGraphicsImageRendererFormat()
      rendererFormat.scale = 1
      rendererFormat.opaque = true
      let renderer = UIGraphicsImageRenderer(
        size: CGSize(width: targetWidth, height: targetHeight),
        format: rendererFormat
      )
      let rendered = renderer.image { _ in
        UIColor.white.setFill()
        UIBezierPath(rect: CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight)).fill()
        image.draw(in: CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight))
      }

      guard let output = rendered.jpegData(compressionQuality: quality) else {
        throw ImageToolsException("image.encode_failed")
      }

      let outputURL = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent("orbit-image-\(UUID().uuidString)-\(filename)")
      try output.write(to: outputURL, options: .atomic)

      return [
        "uri": outputURL.absoluteString,
        "width": targetWidth,
        "height": targetHeight,
        "mime": "image/jpeg",
        "byteSize": output.count
      ]
    }
  }

  private func fileURL(_ value: String) -> URL {
    if let url = URL(string: value), url.isFileURL {
      return url
    }
    return URL(fileURLWithPath: value)
  }

  private func safeFilename(_ value: String) -> String {
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")
    let filename = String(value.unicodeScalars.map { allowed.contains($0) ? Character($0) : Character("-") })
      .trimmingCharacters(in: CharacterSet(charactersIn: ".-"))
    if filename.isEmpty {
      return "photo.jpg"
    }
    if filename.lowercased().hasSuffix(".jpg") || filename.lowercased().hasSuffix(".jpeg") {
      return filename
    }
    return "\(filename).jpg"
  }
}

private final class ImageToolsException: Exception {
  private let message: String

  init(_ message: String) {
    self.message = message
    super.init()
  }

  override var reason: String {
    message
  }
}
