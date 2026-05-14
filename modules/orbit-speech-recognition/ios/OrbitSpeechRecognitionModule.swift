import AVFoundation
import ExpoModulesCore
import Speech

public class OrbitSpeechRecognitionModule: Module {
  private let captureFileGain: Float = 3.0
  private let audioLevelInterval: TimeInterval = 0.08
  private var audioEngine: AVAudioEngine?
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var speechRecognizer: SFSpeechRecognizer?
  private var audioFile: AVAudioFile?
  private var captureCAFURL: URL?
  private var captureM4AURL: URL?
  private var captureStartedAt: Date?
  private var captureSegmentStartedAt: Date?
  private var captureAccumulatedMs: Double = 0
  private var lastAudioLevelSentAt: Date?
  private var isCapturePaused = false

  public func definition() -> ModuleDefinition {
    Name("OrbitSpeechRecognition")
    Events("onTranscription", "onTranscriptionError", "onAudioLevel")

    AsyncFunction("getAvailability") { (locale: String?) throws -> [String: Any] in
      let recognizer = self.makeRecognizer(locale)
      let status = SFSpeechRecognizer.authorizationStatus()
      return [
        "available": recognizer?.isAvailable == true && status == .authorized,
        "reason": self.reason(status: status, recognizer: recognizer) as Any
      ]
    }

    AsyncFunction("start") { (locale: String?) async throws -> [String: Any] in
      let status = await self.requestAuthorization()
      guard status == .authorized else {
        return ["available": false, "reason": self.reason(status: status, recognizer: nil) ?? "not_authorized"]
      }

      guard let recognizer = self.makeRecognizer(locale), recognizer.isAvailable else {
        return ["available": false, "reason": "recognizer_unavailable"]
      }

      try self.startRecognition(recognizer: recognizer, captureURL: nil)
      return ["available": true, "reason": NSNull()]
    }

    AsyncFunction("stop") { () throws -> Void in
      try self.stopRecognition(cancelTask: false)
    }

    AsyncFunction("startCapture") { (locale: String?) async throws -> [String: Any] in
      guard await self.requestRecordPermission() else {
        return ["available": false, "reason": "microphone_permission_denied"]
      }

      let status = await self.requestAuthorization()
      guard status == .authorized else {
        return ["available": false, "reason": self.reason(status: status, recognizer: nil) ?? "not_authorized"]
      }

      guard let recognizer = self.makeRecognizer(locale), recognizer.isAvailable else {
        return ["available": false, "reason": "recognizer_unavailable"]
      }

      let baseName = "orbit-recording-\(UUID().uuidString)"
      let cafURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("\(baseName).caf")
      let m4aURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("\(baseName).m4a")
      try? FileManager.default.removeItem(at: cafURL)
      try? FileManager.default.removeItem(at: m4aURL)

      try self.startRecognition(recognizer: recognizer, captureURL: cafURL)
      self.captureCAFURL = cafURL
      self.captureM4AURL = m4aURL
      self.captureStartedAt = Date()
      self.captureSegmentStartedAt = Date()
      self.captureAccumulatedMs = 0
      self.isCapturePaused = false
      return ["available": true, "reason": NSNull()]
    }

    AsyncFunction("pauseCapture") { () throws -> Void in
      self.pauseCaptureClock()
      self.isCapturePaused = true
    }

    AsyncFunction("resumeCapture") { () throws -> Void in
      guard self.audioEngine != nil else {
        throw NSError(domain: "OrbitSpeechRecognition", code: 2, userInfo: [NSLocalizedDescriptionKey: "capture_not_active"])
      }
      if self.isCapturePaused {
        self.captureSegmentStartedAt = Date()
      }
      self.isCapturePaused = false
    }

    AsyncFunction("stopCapture") { () async throws -> [String: Any] in
      self.pauseCaptureClock()
      let durationMs = max(0, Int(self.captureAccumulatedMs.rounded()))
      guard let cafURL = self.captureCAFURL, let m4aURL = self.captureM4AURL else {
        throw NSError(domain: "OrbitSpeechRecognition", code: 1, userInfo: [NSLocalizedDescriptionKey: "capture_not_active"])
      }

      try self.stopRecognition(cancelTask: false, deactivateSession: false)
      try await self.exportM4A(from: cafURL, to: m4aURL)
      try? FileManager.default.removeItem(at: cafURL)
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      self.clearCaptureState()

      return [
        "uri": m4aURL.absoluteString,
        "durationMs": durationMs
      ]
    }
  }

  private func makeRecognizer(_ locale: String?) -> SFSpeechRecognizer? {
    let identifier = locale ?? Locale.preferredLanguages.first ?? Locale.current.identifier
    return SFSpeechRecognizer(locale: Locale(identifier: identifier))
  }

  private func requestAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
    let current = SFSpeechRecognizer.authorizationStatus()
    if current != .notDetermined {
      return current
    }

    return await withCheckedContinuation { continuation in
      SFSpeechRecognizer.requestAuthorization { status in
        continuation.resume(returning: status)
      }
    }
  }

  private func requestRecordPermission() async -> Bool {
    return await withCheckedContinuation { continuation in
      AVAudioSession.sharedInstance().requestRecordPermission { granted in
        continuation.resume(returning: granted)
      }
    }
  }

  private func startRecognition(recognizer: SFSpeechRecognizer, captureURL: URL?) throws {
    try self.stopRecognition(cancelTask: true)
    let audioEngine = AVAudioEngine()
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true

    try AVAudioSession.sharedInstance().setCategory(
      .playAndRecord,
      mode: .default,
      options: [.duckOthers, .defaultToSpeaker]
    )
    try? AVAudioSession.sharedInstance().setPreferredSampleRate(44_100)
    try? AVAudioSession.sharedInstance().setPreferredIOBufferDuration(0.02)
    try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)

    let inputNode = audioEngine.inputNode
    let recordingFormat = inputNode.outputFormat(forBus: 0)
    guard recordingFormat.sampleRate > 0, recordingFormat.channelCount > 0 else {
      throw NSError(
        domain: "OrbitSpeechRecognition",
        code: 6,
        userInfo: [NSLocalizedDescriptionKey: "invalid_input_audio_format"]
      )
    }
    let file: AVAudioFile?
    if let captureURL {
      file = try AVAudioFile(forWriting: captureURL, settings: recordingFormat.settings)
    } else {
      file = nil
    }

    inputNode.removeTap(onBus: 0)
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
      guard let self else { return }
      if self.isCapturePaused { return }
      request.append(buffer)
      self.sendAudioLevelIfNeeded(buffer)
      if let audioFile = self.audioFile {
        do {
          try audioFile.write(from: self.boostedBufferForFile(buffer) ?? buffer)
        } catch {
          self.sendEvent("onTranscriptionError", ["message": error.localizedDescription])
        }
      }
    }

    self.audioEngine = audioEngine
    self.recognitionRequest = request
    self.speechRecognizer = recognizer
    self.audioFile = file
    self.recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
      if let result {
        self?.sendEvent("onTranscription", [
          "transcript": result.bestTranscription.formattedString,
          "isFinal": result.isFinal,
          "source": "ios-speech"
        ])
      }
      if let error {
        self?.sendEvent("onTranscriptionError", ["message": error.localizedDescription])
      }
    }

    audioEngine.prepare()
    try audioEngine.start()
  }

  private func stopRecognition(cancelTask: Bool, deactivateSession: Bool = true) throws {
    if let inputNode = audioEngine?.inputNode {
      inputNode.removeTap(onBus: 0)
    }
    recognitionRequest?.endAudio()
    audioEngine?.stop()
    if cancelTask {
      recognitionTask?.cancel()
    }
    audioEngine = nil
    recognitionRequest = nil
    recognitionTask = nil
    speechRecognizer = nil
    audioFile = nil
    if deactivateSession {
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      clearCaptureState()
    }
  }

  private func pauseCaptureClock() {
    guard let segmentStart = captureSegmentStartedAt, !isCapturePaused else { return }
    captureAccumulatedMs += Date().timeIntervalSince(segmentStart) * 1000
    captureSegmentStartedAt = nil
  }

  private func clearCaptureState() {
    captureCAFURL = nil
    captureM4AURL = nil
    captureStartedAt = nil
    captureSegmentStartedAt = nil
    captureAccumulatedMs = 0
    lastAudioLevelSentAt = nil
    isCapturePaused = false
  }

  private func exportM4A(from sourceURL: URL, to outputURL: URL) async throws {
    try? FileManager.default.removeItem(at: outputURL)
    let asset = AVURLAsset(url: sourceURL)
    guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
      throw NSError(domain: "OrbitSpeechRecognition", code: 3, userInfo: [NSLocalizedDescriptionKey: "m4a_export_unavailable"])
    }
    session.outputURL = outputURL
    session.outputFileType = .m4a

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      session.exportAsynchronously {
        switch session.status {
        case .completed:
          continuation.resume(returning: ())
        case .failed, .cancelled:
          continuation.resume(throwing: session.error ?? NSError(
            domain: "OrbitSpeechRecognition",
            code: 4,
            userInfo: [NSLocalizedDescriptionKey: "m4a_export_failed"]
          ))
        default:
          continuation.resume(throwing: NSError(
            domain: "OrbitSpeechRecognition",
            code: 5,
            userInfo: [NSLocalizedDescriptionKey: "m4a_export_incomplete"]
          ))
        }
      }
    }
  }

  private func boostedBufferForFile(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    guard captureFileGain > 1 else { return buffer }
    guard let sourceChannels = buffer.floatChannelData else { return nil }
    guard let boosted = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: buffer.frameCapacity) else {
      return nil
    }

    boosted.frameLength = buffer.frameLength
    guard let targetChannels = boosted.floatChannelData else { return nil }
    let channelCount = Int(buffer.format.channelCount)
    let frameCount = Int(buffer.frameLength)
    for channel in 0..<channelCount {
      let source = sourceChannels[channel]
      let target = targetChannels[channel]
      for frame in 0..<frameCount {
        target[frame] = max(-1, min(1, source[frame] * captureFileGain))
      }
    }
    return boosted
  }

  private func sendAudioLevelIfNeeded(_ buffer: AVAudioPCMBuffer) {
    let now = Date()
    if let last = lastAudioLevelSentAt, now.timeIntervalSince(last) < audioLevelInterval {
      return
    }
    lastAudioLevelSentAt = now

    guard let level = audioLevel(buffer) else { return }
    let elapsedMs: Int
    if let start = captureStartedAt {
      elapsedMs = max(0, Int(now.timeIntervalSince(start) * 1000))
    } else {
      elapsedMs = 0
    }
    DispatchQueue.main.async { [weak self] in
      self?.sendEvent("onAudioLevel", [
        "elapsedMs": elapsedMs,
        "rms": level.rms,
        "peak": level.peak
      ])
    }
  }

  private func audioLevel(_ buffer: AVAudioPCMBuffer) -> (rms: Double, peak: Double)? {
    guard let channels = buffer.floatChannelData else { return nil }
    let channelCount = Int(buffer.format.channelCount)
    let frameCount = Int(buffer.frameLength)
    guard channelCount > 0, frameCount > 0 else { return nil }

    var sumSquares: Double = 0
    var peak: Float = 0
    let sampleCount = channelCount * frameCount
    for channel in 0..<channelCount {
      let data = channels[channel]
      for frame in 0..<frameCount {
        let boosted = max(-1, min(1, data[frame] * captureFileGain))
        let magnitude = abs(boosted)
        peak = max(peak, magnitude)
        sumSquares += Double(boosted * boosted)
      }
    }

    return (
      rms: min(1, sqrt(sumSquares / Double(sampleCount))),
      peak: min(1, Double(peak))
    )
  }

  private func reason(status: SFSpeechRecognizerAuthorizationStatus, recognizer: SFSpeechRecognizer?) -> String? {
    switch status {
    case .authorized:
      return recognizer?.isAvailable == false ? "recognizer_unavailable" : nil
    case .denied:
      return "permission_denied"
    case .restricted:
      return "restricted"
    case .notDetermined:
      return "not_determined"
    @unknown default:
      return "unknown"
    }
  }
}
