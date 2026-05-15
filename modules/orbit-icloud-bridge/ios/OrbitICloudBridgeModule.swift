import ExpoModulesCore
import Foundation

public class OrbitICloudBridgeModule: Module {
  private let baseDirectory = "Documents"

  public func definition() -> ModuleDefinition {
    Name("OrbitICloudBridge")

    AsyncFunction("getContainerStatus") { () throws -> [String: Any] in
      guard let root = self.containerRoot() else {
        return ["available": false, "reason": "not_signed_in"]
      }
      try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
      return ["available": true, "rootPath": root.path]
    }

    AsyncFunction("copyToICloud") { (localPath: String, remotePath: String) throws -> [String: Any] in
      guard let root = self.containerRoot() else {
        throw ICloudBridgeException("icloud.container_unavailable:not_signed_in")
      }
      let source = self.fileURL(localPath)
      let finalDestination = self.destinationURL(root: root, remotePath: remotePath)
      let parent = finalDestination.deletingLastPathComponent()
      try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)

      let tempDestination = parent.appendingPathComponent(".uploading-\(UUID().uuidString)")
      if FileManager.default.fileExists(atPath: tempDestination.path) {
        try FileManager.default.removeItem(at: tempDestination)
      }
      try FileManager.default.copyItem(at: source, to: tempDestination)
      if FileManager.default.fileExists(atPath: finalDestination.path) {
        try FileManager.default.removeItem(at: finalDestination)
      }
      try FileManager.default.moveItem(at: tempDestination, to: finalDestination)
      return try self.uploadStatus(url: finalDestination, remotePath: remotePath)
    }

    AsyncFunction("getUploadStatus") { (remotePath: String) throws -> [String: Any] in
      guard let root = self.containerRoot() else {
        return ["exists": false, "uploaded": false, "uploading": false, "reason": "not_signed_in"]
      }
      return try self.uploadStatus(url: self.destinationURL(root: root, remotePath: remotePath), remotePath: remotePath)
    }

    AsyncFunction("fileExists") { (remotePath: String) throws -> Bool in
      guard let root = self.containerRoot() else {
        return false
      }
      return FileManager.default.fileExists(atPath: self.destinationURL(root: root, remotePath: remotePath).path)
    }

    AsyncFunction("readTextFile") { (remotePath: String) throws -> String? in
      guard let root = self.containerRoot() else {
        return nil
      }
      let url = self.destinationURL(root: root, remotePath: remotePath)
      guard FileManager.default.fileExists(atPath: url.path) else {
        return nil
      }
      return try String(contentsOf: url, encoding: .utf8)
    }

    AsyncFunction("deleteRemotePath") { (remotePath: String) throws -> Void in
      guard let root = self.containerRoot() else {
        return
      }
      let url = self.destinationURL(root: root, remotePath: remotePath)
      if FileManager.default.fileExists(atPath: url.path) {
        try FileManager.default.removeItem(at: url)
      }
    }
  }

  private func containerRoot() -> URL? {
    FileManager.default.url(forUbiquityContainerIdentifier: nil)?.appendingPathComponent(baseDirectory, isDirectory: true)
  }

  private func fileURL(_ path: String) -> URL {
    if let url = URL(string: path), url.isFileURL {
      return url
    }
    return URL(fileURLWithPath: path)
  }

  private func destinationURL(root: URL, remotePath: String) -> URL {
    let normalized = remotePath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    return root.appendingPathComponent(normalized)
  }

  private func uploadStatus(url: URL, remotePath: String) throws -> [String: Any] {
    let exists = FileManager.default.fileExists(atPath: url.path)
    guard exists else {
      return ["exists": false, "uploaded": false, "uploading": false, "remotePath": remotePath]
    }
    let values = try url.resourceValues(forKeys: [
      .ubiquitousItemIsUploadedKey,
      .ubiquitousItemIsUploadingKey,
      .ubiquitousItemUploadingErrorKey
    ])
    var result: [String: Any] = [
      "exists": true,
      "uploaded": values.ubiquitousItemIsUploaded ?? true,
      "uploading": values.ubiquitousItemIsUploading ?? false,
      "remotePath": remotePath,
      "localPath": url.path
    ]
    if let error = values.ubiquitousItemUploadingError {
      result["error"] = error.localizedDescription
    }
    return result
  }
}

private final class ICloudBridgeException: Exception {
  private let message: String

  init(_ message: String) {
    self.message = message
    super.init()
  }

  override var reason: String {
    message
  }
}
