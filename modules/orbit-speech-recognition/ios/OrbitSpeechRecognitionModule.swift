import AVFoundation
import ExpoModulesCore
import Speech

public class OrbitSpeechRecognitionModule: Module {
  private var audioEngine: AVAudioEngine?
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var speechRecognizer: SFSpeechRecognizer?

  public func definition() -> ModuleDefinition {
    Name("OrbitSpeechRecognition")
    Events("onTranscription", "onTranscriptionError")

    AsyncFunction("getAvailability") { (locale: String?) throws -> [String: Any] in
      let recognizer = self.makeRecognizer(locale)
      let status = SFSpeechRecognizer.authorizationStatus()
      return [
        "available": recognizer?.isAvailable == true && status != .denied && status != .restricted,
        "reason": self.reason(status: status, recognizer: recognizer) as Any
      ]
    }

    AsyncFunction("start") { (locale: String?) throws -> [String: Any] in
      let status = self.requestAuthorization()
      guard status == .authorized else {
        return ["available": false, "reason": self.reason(status: status, recognizer: nil) ?? "not_authorized"]
      }

      guard let recognizer = self.makeRecognizer(locale), recognizer.isAvailable else {
        return ["available": false, "reason": "recognizer_unavailable"]
      }

      try self.stopRecognition(cancelTask: true)
      let audioEngine = AVAudioEngine()
      let request = SFSpeechAudioBufferRecognitionRequest()
      request.shouldReportPartialResults = true

      let inputNode = audioEngine.inputNode
      let recordingFormat = inputNode.outputFormat(forBus: 0)
      inputNode.removeTap(onBus: 0)
      inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
        request.append(buffer)
      }

      try AVAudioSession.sharedInstance().setCategory(
        .playAndRecord,
        mode: .measurement,
        options: [.duckOthers, .defaultToSpeaker]
      )
      try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)

      self.audioEngine = audioEngine
      self.recognitionRequest = request
      self.speechRecognizer = recognizer
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
      return ["available": true, "reason": NSNull()]
    }

    AsyncFunction("stop") { () throws -> Void in
      try self.stopRecognition(cancelTask: false)
    }
  }

  private func makeRecognizer(_ locale: String?) -> SFSpeechRecognizer? {
    let identifier = locale ?? Locale.preferredLanguages.first ?? Locale.current.identifier
    return SFSpeechRecognizer(locale: Locale(identifier: identifier))
  }

  private func requestAuthorization() -> SFSpeechRecognizerAuthorizationStatus {
    let current = SFSpeechRecognizer.authorizationStatus()
    if current != .notDetermined {
      return current
    }

    let semaphore = DispatchSemaphore(value: 0)
    var nextStatus = current
    SFSpeechRecognizer.requestAuthorization { status in
      nextStatus = status
      semaphore.signal()
    }
    semaphore.wait()
    return nextStatus
  }

  private func stopRecognition(cancelTask: Bool) throws {
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
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
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
