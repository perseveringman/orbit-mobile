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
