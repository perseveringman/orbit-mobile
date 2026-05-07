import Darwin
import ExpoModulesCore
import Foundation

public class OrbitDurableFSModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OrbitDurableFS")

    AsyncFunction("fsync") { (path: String) throws -> Void in
      let url = URL(string: path)?.isFileURL == true
        ? URL(string: path)!
        : URL(fileURLWithPath: path)
      let fd = open(url.path, O_RDONLY)
      if fd == -1 {
        throw FsyncException("open failed for \(url.path)")
      }
      defer {
        close(fd)
      }

      #if os(iOS)
      if fcntl(fd, F_FULLFSYNC) == -1 && Darwin.fsync(fd) == -1 {
        throw FsyncException("fsync failed for \(url.path)")
      }
      #else
      if Darwin.fsync(fd) == -1 {
        throw FsyncException("fsync failed for \(url.path)")
      }
      #endif
    }

    AsyncFunction("appendText") { (path: String, text: String) throws -> Void in
      let url = URL(string: path)?.isFileURL == true
        ? URL(string: path)!
        : URL(fileURLWithPath: path)
      if !FileManager.default.fileExists(atPath: url.path) {
        FileManager.default.createFile(atPath: url.path, contents: nil)
      }
      let handle = try FileHandle(forWritingTo: url)
      defer {
        try? handle.close()
      }
      try handle.seekToEnd()
      guard let data = text.data(using: .utf8) else {
        throw FsyncException("utf8 encoding failed for \(url.path)")
      }
      try handle.write(contentsOf: data)
      try handle.synchronize()
    }
  }
}

private final class FsyncException: Exception {
  private let message: String

  init(_ message: String) {
    self.message = message
    super.init()
  }

  override var reason: String {
    message
  }
}
