import CoreBluetooth
import ExpoModulesCore
import Foundation

private final class PendingCommand {
  let timeout: DispatchWorkItem
  let resolve: ([UInt8]) -> Void
  let reject: (Error) -> Void

  init(timeout: DispatchWorkItem, resolve: @escaping ([UInt8]) -> Void, reject: @escaping (Error) -> Void) {
    self.timeout = timeout
    self.resolve = resolve
    self.reject = reject
  }
}

private final class ActiveImport {
  let requestedName: String
  let expectedSize: Int
  let durationMs: Int
  let outputURL: URL
  let fileHandle: FileHandle
  let continuation: CheckedContinuation<[String: Any], Error>
  let startedAt = Date()
  var firstByteAt: Date?
  var deviceName: String?
  var audioBuffer = Data()
  var bytesReceived = 0
  var chunksReceived = 0
  var flushedBytes = 0
  var maxChunkBytes = 0
  var timeout: DispatchWorkItem?
  var lastTimeoutRefreshAt = Date.distantPast
  var lastProgressSentAt = Date.distantPast
  var lastProgressBytes = 0

  init(
    requestedName: String,
    expectedSize: Int,
    durationMs: Int,
    outputURL: URL,
    fileHandle: FileHandle,
    continuation: CheckedContinuation<[String: Any], Error>
  ) {
    self.requestedName = requestedName
    self.expectedSize = expectedSize
    self.durationMs = durationMs
    self.outputURL = outputURL
    self.fileHandle = fileHandle
    self.continuation = continuation
  }
}

private final class ActiveRealtimeImport {
  let requestedName: String
  let outputURL: URL
  let fileHandle: FileHandle
  let startedAt: Date
  var audioBuffer = Data()
  var bytesReceived = 0
  var chunksReceived = 0
  var flushedBytes = 0
  var maxChunkBytes = 0
  var isStopping = false
  var stopTimeout: DispatchWorkItem?
  var stopContinuation: CheckedContinuation<[String: Any], Error>?
  var lastProgressSentAt = Date.distantPast
  var lastProgressBytes = 0

  init(requestedName: String, outputURL: URL, fileHandle: FileHandle, startedAt: Date) {
    self.requestedName = requestedName
    self.outputURL = outputURL
    self.fileHandle = fileHandle
    self.startedAt = startedAt
  }
}

private final class OrbitRecorderDeviceBluetoothDelegate: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
  weak var owner: OrbitRecorderDeviceModule?

  init(owner: OrbitRecorderDeviceModule) {
    self.owner = owner
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    owner?.centralManagerDidUpdateState(central)
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    owner?.centralManager(central, didDiscover: peripheral, advertisementData: advertisementData, rssi: RSSI)
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    owner?.centralManager(central, didConnect: peripheral)
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    owner?.centralManager(central, didFailToConnect: peripheral, error: error)
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    owner?.centralManager(central, didDisconnectPeripheral: peripheral, error: error)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    owner?.peripheral(peripheral, didDiscoverServices: error)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    owner?.peripheral(peripheral, didDiscoverCharacteristicsFor: service, error: error)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    owner?.peripheral(peripheral, didUpdateNotificationStateFor: characteristic, error: error)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    owner?.peripheral(peripheral, didUpdateValueFor: characteristic, error: error)
  }
}

public class OrbitRecorderDeviceModule: Module {
  private let serviceUUID = CBUUID(string: "0000AE20-0000-1000-8000-00805F9B34FB")
  private let writeUUID = CBUUID(string: "0000AE21-0000-1000-8000-00805F9B34FB")
  private let notifyUUID = CBUUID(string: "0000AE22-0000-1000-8000-00805F9B34FB")

  private lazy var bluetoothDelegate = OrbitRecorderDeviceBluetoothDelegate(owner: self)
  private let bluetoothQueue = DispatchQueue(label: "com.orbit.recorder-device.bluetooth", qos: .userInitiated)
  private let bluetoothQueueKey = DispatchSpecificKey<UInt8>()
  private lazy var configureBluetoothQueue: Void = {
    bluetoothQueue.setSpecific(key: bluetoothQueueKey, value: 1)
  }()
  private lazy var centralManager: CBCentralManager = {
    _ = configureBluetoothQueue
    return CBCentralManager(delegate: bluetoothDelegate, queue: bluetoothQueue)
  }()
  private var discoveredPeripherals: [String: CBPeripheral] = [:]
  private var discoveredPayloads: [String: [String: Any]] = [:]
  private var connectedPeripheral: CBPeripheral?
  private var writeCharacteristic: CBCharacteristic?
  private var notifyCharacteristic: CBCharacteristic?
  private var connectionState = "idle"
  private var receiveBuffer = Data()
  private var sequence: UInt8 = 0
  private var connectContinuation: CheckedContinuation<[String: Any], Error>?
  private var connectTimeout: DispatchWorkItem?
  private var pendingCommands: [String: PendingCommand] = [:]
  private var activeImport: ActiveImport?
  private var activeRealtimeImport: ActiveRealtimeImport?
  private var frameDebugEnabled = false

  private let audioWriteFlushBytes = 64 * 1024
  private let importProgressEventMinInterval: TimeInterval = 1.0
  private let realtimeProgressEventMinInterval: TimeInterval = 0.25
  private let importProgressEventMinBytes = 64 * 1024
  private let realtimeProgressEventMinBytes = 16 * 1024
  private let importTimeoutSeconds: TimeInterval = 20
  private let importTimeoutRefreshMinInterval: TimeInterval = 2

  public func definition() -> ModuleDefinition {
    Name("OrbitRecorderDevice")

    Events(
      "onScanResult",
      "onConnectionState",
      "onFrame",
      "onAudioList",
      "onImportProgress",
      "onImportComplete",
      "onRealtimeProgress",
      "onRealtimeComplete",
      "onDeviceStatus",
      "onError"
    )

    AsyncFunction("getState") { () async throws -> [String: Any] in
      try await self.runOnBluetoothQueue {
        return self.statePayload()
      }
    }

    AsyncFunction("startScan") { () async throws -> Void in
      try await self.runOnBluetoothQueue {
        try self.startScanInternal()
      }
    }

    AsyncFunction("stopScan") { () async throws -> Void in
      try await self.runOnBluetoothQueue {
        self.stopScanInternal()
      }
    }

    AsyncFunction("connect") { (identifier: String) async throws -> [String: Any] in
      try await self.connect(identifier: identifier)
    }

    AsyncFunction("disconnect") { () async throws -> Void in
      try await self.runOnBluetoothQueue {
        self.disconnectInternal()
      }
    }

    AsyncFunction("sendCheckTime") { () async throws -> Void in
      try await self.runOnBluetoothQueue {
        self.sequence = 0
      }
      _ = try await self.requestAckPayload(
        request: self.checkTimePayload(),
        timeout: 4
      )
    }

    AsyncFunction("getBattery") { () async throws -> Int in
      try await self.requestPayload(
        request: [0, 3],
        responseType: 0,
        responseCommand: 4,
        timeout: 4
      ) { payload in
        guard payload.count >= 3 else { throw self.moduleError("x1.malformed_battery_reply") }
        return Int(payload[2])
      }
    }

    AsyncFunction("getDeviceIdentity") { () async throws -> [String: Any] in
      try await self.requestPayload(
        request: [0, 12],
        responseType: 0,
        responseCommand: 13,
        timeout: 4
      ) { payload in
        try self.deviceIdentityPayload(payload)
      }
    }

    AsyncFunction("getVersion") { () async throws -> String in
      try await self.requestPayload(
        request: [0, 10],
        responseType: 0,
        responseCommand: 11,
        timeout: 4
      ) { payload in
        guard payload.count >= 2 else { throw self.moduleError("x1.malformed_version_reply") }
        return self.utf8String(Array(payload.dropFirst(2)))
      }
    }

    AsyncFunction("getStorage") { () async throws -> [String: Any] in
      try await self.requestPayload(
        request: [0, 1],
        responseType: 0,
        responseCommand: 2,
        timeout: 4
      ) { payload in
        guard payload.count >= 10 else { throw self.moduleError("x1.malformed_storage_reply") }
        let usedBytes = Int(self.uint32LE(payload, offset: 2)) * 1024
        let totalBytes = Int(self.uint32LE(payload, offset: 6)) * 1024
        return [
          "usedBytes": usedBytes,
          "totalBytes": totalBytes,
          "freeBytes": max(0, totalBytes - usedBytes)
        ]
      }
    }

    AsyncFunction("getSettings") { () async throws -> [String: Any] in
      try await self.requestSettings()
    }

    AsyncFunction("setSetting") { (position: Int, enabled: Bool) async throws -> [String: Any] in
      let settingPosition = try self.settingPosition(position)
      _ = try await self.requestAckPayload(
        request: [0, settingPosition, enabled ? UInt8(1) : UInt8(0)],
        timeout: 4
      )
      return try await self.requestSettings()
    }

    AsyncFunction("sendBindDevice") { () async throws -> [String: Any] in
      try await self.requestAckPayload(request: [0, 16], timeout: 4)
    }

    AsyncFunction("sendUnbindDevice") { () async throws -> [String: Any] in
      try await self.requestAckPayload(request: [0, 17], timeout: 4)
    }

    AsyncFunction("requestAudioFileTotal") { () async throws -> Int in
      try await self.requestPayload(
        request: [2, 30],
        responseType: 2,
        responseCommand: 31,
        timeout: 6
      ) { payload in
        guard payload.count >= 6 else { throw self.moduleError("x1.malformed_audio_total_reply") }
        return Int(self.uint32LE(payload, offset: 2))
      }
    }

    AsyncFunction("requestAudioList") { (start: Int, count: Int) async throws -> [[String: Any]] in
      let safeStart = max(0, start)
      let safeCount = max(1, min(50, count))
      let request = [UInt8(2), UInt8(32)]
        + self.littleEndian32(safeStart)
        + self.littleEndian32(safeCount)
      return try await self.requestPayload(
        request: request,
        responseType: 2,
        responseCommand: 33,
        timeout: 8
      ) { payload in
        let list = try self.parseAudioListPayload(payload, requestedStart: safeStart)
        self.emitEvent("onAudioList", ["files": list])
        return list
      }
    }

    AsyncFunction("importAudio") { (name: String, expectedSize: Int, durationMs: Int, offset: Int) async throws -> [String: Any] in
      try await self.importAudio(name: name, expectedSize: expectedSize, durationMs: durationMs, offset: offset)
    }

    AsyncFunction("setFrameDebugEnabled") { (enabled: Bool) async throws -> Void in
      try await self.runOnBluetoothQueue {
        self.frameDebugEnabled = enabled
      }
    }

    AsyncFunction("pauseImportTransfer") { (paused: Bool) async throws -> [String: Any] in
      try await self.requestAckPayload(request: [2, 10, paused ? UInt8(1) : UInt8(0)], timeout: 4)
    }

    AsyncFunction("stopImport") { () async throws -> Void in
      try await self.runOnBluetoothQueue {
        try self.ensureConnected()
        try self.writePayload([2, 7, 0])
        self.failActiveImport(self.moduleError("x1.import_stopped_by_user"), deleteFile: true)
      }
    }

    AsyncFunction("deleteAudioFiles") { (names: [String]) async throws -> [String: Any] in
      let safeNames = names
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { $0.isEmpty == false }
      guard safeNames.isEmpty == false else {
        throw self.moduleError("x1.delete_missing_names")
      }
      return try await self.requestPayload(
        request: self.deleteAudioPayload(names: safeNames),
        responseType: 2,
        responseCommand: 34,
        timeout: 10
      ) { payload in
        self.deleteAudioResultPayload(payload: payload, names: safeNames, all: false)
      }
    }

    AsyncFunction("deleteAllAudioFiles") { () async throws -> [String: Any] in
      try await self.requestPayload(
        request: [2, 9],
        responseType: 2,
        responseCommand: 34,
        timeout: 15
      ) { payload in
        self.deleteAudioResultPayload(payload: payload, names: [], all: true)
      }
    }

    AsyncFunction("requestLegacyAudioListRaw") { () async throws -> [String: Any] in
      try await self.requestPayload(
        request: [2, 0],
        responseType: 2,
        responseCommand: 1,
        timeout: 8
      ) { payload in
        [
          "payloadHex": self.hexString(payload),
          "byteSize": payload.count
        ]
      }
    }

    AsyncFunction("startRealtimeImport") { (name: String) async throws -> [String: Any] in
      try await self.startRealtimeImport(name: name)
    }

    AsyncFunction("stopRealtimeImport") { () async throws -> [String: Any] in
      try await self.stopRealtimeImport()
    }

    AsyncFunction("cancelRealtimeImport") { () async throws -> Void in
      try await self.runOnBluetoothQueue {
        if self.activeRealtimeImport != nil {
          _ = try? self.writePayload([1, 2])
        }
        self.failActiveRealtimeImport(self.moduleError("x1.realtime_cancelled_by_user"), deleteFile: true)
      }
    }

    AsyncFunction("startRealtimeRecord") { () async throws -> Void in
      try await self.runOnBluetoothQueue {
        try self.ensureConnected()
        try self.writePayload([1, 0])
      }
    }

    AsyncFunction("stopRealtimeRecord") { () async throws -> Void in
      try await self.runOnBluetoothQueue {
        try self.ensureConnected()
        try self.writePayload([1, 2])
      }
    }

    AsyncFunction("pauseRealtimeRecord") { () async throws -> Void in
      try await self.runOnBluetoothQueue {
        try self.ensureConnected()
        try self.writePayload([1, 3, 1])
      }
    }

    AsyncFunction("continueRealtimeRecord") { () async throws -> Void in
      try await self.runOnBluetoothQueue {
        try self.ensureConnected()
        try self.writePayload([1, 3, 0])
      }
    }

    AsyncFunction("sendRawPayload") { (hex: String) async throws -> Void in
      try await self.runOnBluetoothQueue {
        try self.ensureConnected()
        try self.writePayload(self.parseHexPayload(hex))
      }
    }
  }

  private func runOnBluetoothQueue<T>(_ body: @escaping () throws -> T) async throws -> T {
    _ = configureBluetoothQueue
    if DispatchQueue.getSpecific(key: bluetoothQueueKey) != nil {
      return try body()
    }

    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<T, Error>) in
      bluetoothQueue.async {
        do {
          continuation.resume(returning: try body())
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }

  private func beginOnBluetoothQueue<T>(_ body: @escaping (CheckedContinuation<T, Error>) -> Void) async throws -> T {
    _ = configureBluetoothQueue
    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<T, Error>) in
      let execute = {
        body(continuation)
      }
      if DispatchQueue.getSpecific(key: bluetoothQueueKey) != nil {
        execute()
      } else {
        bluetoothQueue.async {
          execute()
        }
      }
    }
  }

  private func connect(identifier: String) async throws -> [String: Any] {
    try await beginOnBluetoothQueue { continuation in
      do {
        try self.ensureBluetoothPoweredOn()
        guard self.connectContinuation == nil else {
          throw self.moduleError("x1.connect_busy")
        }

        let peripheral = try self.resolvePeripheral(identifier)
        if peripheral.state == .connected,
           self.connectedPeripheral?.identifier == peripheral.identifier,
           self.writeCharacteristic != nil,
           self.notifyCharacteristic?.isNotifying == true {
          continuation.resume(returning: self.devicePayload(peripheral: peripheral))
          return
        }

        self.stopScanInternal()
        self.connectionState = "connecting"
        self.connectedPeripheral = peripheral
        self.connectContinuation = continuation
        self.connectTimeout?.cancel()
        self.connectTimeout = self.scheduleTimeout(after: 15) { [weak self] in
          guard let self else { return }
          self.failConnect(self.moduleError("x1.connect_timeout"))
        }
        self.emitConnectionState()
        self.centralManager.connect(peripheral, options: nil)
      } catch {
        continuation.resume(throwing: error)
      }
    }
  }

  private func requestPayload<T>(
    request: [UInt8],
    responseType: UInt8,
    responseCommand: UInt8,
    timeout: TimeInterval,
    parse: @escaping ([UInt8]) throws -> T
  ) async throws -> T {
    try await beginOnBluetoothQueue { continuation in
      var pendingKey: String?
      do {
        try self.ensureConnected()
        let key = self.pendingKey(type: responseType, command: responseCommand)
        guard self.pendingCommands[key] == nil else {
          throw self.moduleError("x1.command_busy:\(key)")
        }
        pendingKey = key
        let timeoutWork = self.scheduleTimeout(after: timeout) { [weak self] in
          guard let self, let pending = self.pendingCommands.removeValue(forKey: key) else { return }
          pending.reject(self.moduleError("x1.command_timeout:\(key)"))
        }
        self.pendingCommands[key] = PendingCommand(
          timeout: timeoutWork,
          resolve: { payload in
            do {
              continuation.resume(returning: try parse(payload))
            } catch {
              continuation.resume(throwing: error)
            }
          },
          reject: { error in
            continuation.resume(throwing: error)
          }
        )
        try self.writePayload(request)
      } catch {
        if let pendingKey, let pending = self.pendingCommands.removeValue(forKey: pendingKey) {
          pending.timeout.cancel()
        }
        continuation.resume(throwing: error)
      }
    }
  }

  private func requestAckPayload(request: [UInt8], timeout: TimeInterval) async throws -> [String: Any] {
    try await beginOnBluetoothQueue { continuation in
      var pendingKey: String?
      do {
        try self.ensureConnected()
        let ackSequence = self.sequence
        let key = self.pendingKey(type: 3, command: ackSequence)
        guard self.pendingCommands[key] == nil else {
          throw self.moduleError("x1.command_busy:\(key)")
        }
        pendingKey = key
        let timeoutWork = self.scheduleTimeout(after: timeout) { [weak self] in
          guard let self, let pending = self.pendingCommands.removeValue(forKey: key) else { return }
          pending.reject(self.moduleError("x1.command_timeout:\(key)"))
        }
        self.pendingCommands[key] = PendingCommand(
          timeout: timeoutWork,
          resolve: { payload in
            continuation.resume(returning: [
              "sequence": Int(ackSequence),
              "payloadHex": self.hexString(payload)
            ])
          },
          reject: { error in
            continuation.resume(throwing: error)
          }
        )
        try self.writePayload(request)
      } catch {
        if let pendingKey, let pending = self.pendingCommands.removeValue(forKey: pendingKey) {
          pending.timeout.cancel()
        }
        continuation.resume(throwing: error)
      }
    }
  }

  private func requestSettings() async throws -> [String: Any] {
    try await requestPayload(
      request: [0, 5],
      responseType: 0,
      responseCommand: 6,
      timeout: 4
    ) { payload in
      try self.settingsPayload(payload)
    }
  }

  private func importAudio(name: String, expectedSize: Int, durationMs: Int, offset: Int) async throws -> [String: Any] {
    try await beginOnBluetoothQueue { continuation in
      do {
        try self.ensureConnected()
        guard self.activeImport == nil else {
          throw self.moduleError("x1.import_busy")
        }
        let safeName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard safeName.isEmpty == false else {
          throw self.moduleError("x1.import_missing_name")
        }

        let ext = self.audioExtension(for: safeName)
        let outputURL = URL(fileURLWithPath: NSTemporaryDirectory())
          .appendingPathComponent("orbit-x1-\(UUID().uuidString).\(ext)")
        try? FileManager.default.removeItem(at: outputURL)
        FileManager.default.createFile(atPath: outputURL.path, contents: nil)
        let handle = try FileHandle(forWritingTo: outputURL)

        let state = ActiveImport(
          requestedName: safeName,
          expectedSize: max(0, expectedSize),
          durationMs: max(0, durationMs),
          outputURL: outputURL,
          fileHandle: handle,
          continuation: continuation
        )
        state.audioBuffer.reserveCapacity(self.audioWriteFlushBytes)
        self.activeImport = state
        self.refreshImportTimeout(force: true)
        try self.writePayload(self.startImportPayload(name: safeName, offset: max(0, offset)))
      } catch {
        continuation.resume(throwing: error)
      }
    }
  }

  private func startRealtimeImport(name: String) async throws -> [String: Any] {
    try await runOnBluetoothQueue {
      try self.ensureConnected()
      guard self.activeRealtimeImport == nil else {
        throw self.moduleError("x1.realtime_busy")
      }
      guard self.activeImport == nil else {
        throw self.moduleError("x1.import_busy")
      }

      let safeName = self.realtimeFilename(name)
      let outputURL = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent("orbit-x1-realtime-\(UUID().uuidString).mp3")
      try? FileManager.default.removeItem(at: outputURL)
      FileManager.default.createFile(atPath: outputURL.path, contents: nil)
      let handle = try FileHandle(forWritingTo: outputURL)
      let state = ActiveRealtimeImport(
        requestedName: safeName,
        outputURL: outputURL,
        fileHandle: handle,
        startedAt: Date()
      )
      state.audioBuffer.reserveCapacity(self.audioWriteFlushBytes)
      self.activeRealtimeImport = state
      try self.writePayload([1, 0])
      self.emitEvent("onRealtimeProgress", self.realtimeProgressPayload(phase: "started", state: state))
      return self.realtimeStartPayload(state: state)
    }
  }

  private func stopRealtimeImport() async throws -> [String: Any] {
    try await beginOnBluetoothQueue { continuation in
      do {
        try self.ensureConnected()
        guard let state = self.activeRealtimeImport else {
          throw self.moduleError("x1.realtime_not_active")
        }
        guard state.stopContinuation == nil else {
          throw self.moduleError("x1.realtime_stop_busy")
        }

        state.isStopping = true
        state.stopContinuation = continuation
        state.stopTimeout?.cancel()
        state.stopTimeout = self.scheduleTimeout(after: 1.5) { [weak self] in
          guard let self else { return }
          self.completeRealtimeImport(status: 0)
        }
        try self.writePayload([1, 2])
        self.emitEvent("onRealtimeProgress", self.realtimeProgressPayload(phase: "stopping", state: state))
      } catch {
        continuation.resume(throwing: error)
      }
    }
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    if central.state != .poweredOn {
      stopScanInternal()
      failConnect(moduleError("x1.bluetooth_not_powered_on:\(bluetoothStateString(central.state))"))
      failAllPending(moduleError("x1.bluetooth_not_powered_on:\(bluetoothStateString(central.state))"))
      failActiveImport(moduleError("x1.bluetooth_not_powered_on:\(bluetoothStateString(central.state))"), deleteFile: false)
      failActiveRealtimeImport(moduleError("x1.bluetooth_not_powered_on:\(bluetoothStateString(central.state))"), deleteFile: false)
    }
    emitConnectionState()
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    let identifier = peripheral.identifier.uuidString
    let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
    let name = peripheral.name ?? localName ?? ""
    let services = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? [])
      .map { $0.uuidString.lowercased() }
    discoveredPeripherals[identifier] = peripheral
    let payload: [String: Any] = [
      "id": identifier,
      "name": name,
      "rssi": RSSI.intValue,
      "advertisedServices": services,
      "isLikelyX1": isLikelyX1(name: name, advertisedServices: services)
    ]
    discoveredPayloads[identifier] = payload
    emitEvent("onScanResult", payload)
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    connectedPeripheral = peripheral
    writeCharacteristic = nil
    notifyCharacteristic = nil
    receiveBuffer.removeAll()
    connectionState = "discovering"
    peripheral.delegate = bluetoothDelegate
    peripheral.discoverServices([serviceUUID])
    emitConnectionState()
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    failConnect(error ?? moduleError("x1.connect_failed"))
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    if connectedPeripheral?.identifier == peripheral.identifier {
      clearConnection()
      failConnect(error ?? moduleError("x1.disconnected"))
      failAllPending(error ?? moduleError("x1.disconnected"))
      failActiveImport(error ?? moduleError("x1.disconnected"), deleteFile: false)
      failActiveRealtimeImport(error ?? moduleError("x1.disconnected"), deleteFile: false)
      connectionState = "idle"
      emitConnectionState()
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if let error {
      failConnect(error)
      centralManager.cancelPeripheralConnection(peripheral)
      return
    }
    guard let service = peripheral.services?.first(where: { $0.uuid == serviceUUID }) else {
      failConnect(moduleError("x1.service_not_found:ae20"))
      centralManager.cancelPeripheralConnection(peripheral)
      return
    }
    peripheral.discoverCharacteristics([writeUUID, notifyUUID], for: service)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    if let error {
      failConnect(error)
      centralManager.cancelPeripheralConnection(peripheral)
      return
    }

    for characteristic in service.characteristics ?? [] {
      if characteristic.uuid == writeUUID {
        writeCharacteristic = characteristic
      }
      if characteristic.uuid == notifyUUID {
        notifyCharacteristic = characteristic
      }
    }

    guard writeCharacteristic != nil else {
      failConnect(moduleError("x1.write_characteristic_not_found:ae21"))
      centralManager.cancelPeripheralConnection(peripheral)
      return
    }
    guard let notifyCharacteristic else {
      failConnect(moduleError("x1.notify_characteristic_not_found:ae22"))
      centralManager.cancelPeripheralConnection(peripheral)
      return
    }

    if notifyCharacteristic.isNotifying {
      finishConnectIfReady()
    } else {
      peripheral.setNotifyValue(true, for: notifyCharacteristic)
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    if characteristic.uuid != notifyUUID {
      return
    }
    if let error {
      failConnect(error)
      centralManager.cancelPeripheralConnection(peripheral)
      return
    }
    finishConnectIfReady()
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    if let error {
      emitError(error)
      return
    }
    guard characteristic.uuid == notifyUUID, let data = characteristic.value else {
      return
    }
    receiveBuffer.append(data)
    parseReceivedFrames()
  }

  private func startScanInternal() throws {
    try ensureBluetoothPoweredOn()
    discoveredPeripherals.removeAll()
    discoveredPayloads.removeAll()
    connectionState = connectedPeripheral?.state == .connected ? "connected" : "scanning"
    centralManager.scanForPeripherals(withServices: nil, options: [
      CBCentralManagerScanOptionAllowDuplicatesKey: false
    ])
    emitConnectionState()
  }

  private func stopScanInternal() {
    if centralManager.isScanning {
      centralManager.stopScan()
    }
    if connectionState == "scanning" {
      connectionState = connectedPeripheral?.state == .connected ? "connected" : "idle"
      emitConnectionState()
    }
  }

  private func disconnectInternal() {
    stopScanInternal()
    if let peripheral = connectedPeripheral {
      connectionState = "disconnecting"
      emitConnectionState()
      centralManager.cancelPeripheralConnection(peripheral)
    } else {
      clearConnection()
      connectionState = "idle"
      emitConnectionState()
    }
  }

  private func resolvePeripheral(_ identifier: String) throws -> CBPeripheral {
    if let peripheral = discoveredPeripherals[identifier] {
      return peripheral
    }
    if let uuid = UUID(uuidString: identifier) {
      let retrieved = centralManager.retrievePeripherals(withIdentifiers: [uuid])
      if let peripheral = retrieved.first {
        discoveredPeripherals[identifier] = peripheral
        return peripheral
      }
    }
    throw moduleError("x1.device_not_found_scan_first")
  }

  private func finishConnectIfReady() {
    guard let peripheral = connectedPeripheral,
          writeCharacteristic != nil,
          notifyCharacteristic?.isNotifying == true,
          let continuation = connectContinuation else {
      return
    }

    connectTimeout?.cancel()
    connectTimeout = nil
    connectContinuation = nil
    connectionState = "connected"
    emitConnectionState()
    continuation.resume(returning: devicePayload(peripheral: peripheral))
  }

  private func failConnect(_ error: Error) {
    connectTimeout?.cancel()
    connectTimeout = nil
    if let continuation = connectContinuation {
      connectContinuation = nil
      continuation.resume(throwing: error)
    }
    emitError(error)
  }

  private func clearConnection() {
    connectedPeripheral?.delegate = nil
    connectedPeripheral = nil
    writeCharacteristic = nil
    notifyCharacteristic = nil
    receiveBuffer.removeAll()
  }

  private func ensureBluetoothPoweredOn() throws {
    _ = centralManager
    guard centralManager.state == .poweredOn else {
      throw moduleError("x1.bluetooth_not_powered_on:\(bluetoothStateString(centralManager.state))")
    }
  }

  private func ensureConnected() throws {
    try ensureBluetoothPoweredOn()
    guard connectedPeripheral?.state == .connected, writeCharacteristic != nil else {
      throw moduleError("x1.not_connected")
    }
  }

  @discardableResult
  private func writePayload(_ payload: [UInt8]) throws -> UInt8 {
    guard let peripheral = connectedPeripheral,
          let characteristic = writeCharacteristic else {
      throw moduleError("x1.not_connected")
    }
    let frame = makeFrame(payload)
    let usedSequence = frame[1]
    let writeType: CBCharacteristicWriteType = characteristic.properties.contains(.write) ? .withResponse : .withoutResponse
    peripheral.writeValue(frame, for: characteristic, type: writeType)
    emitFrameEvent(direction: "tx", frame: Array(frame), payload: payload, crcValid: nil)
    return usedSequence
  }

  private func makeFrame(_ payload: [UInt8]) -> Data {
    let length = UInt16(payload.count)
    let lengthLow = UInt8(length & 0x00ff)
    let lengthHigh = UInt8((length >> 8) & 0x00ff)
    let crc = crc16Xmodem(lengthLow: lengthLow, lengthHigh: lengthHigh, payload: payload)
    let frameBytes: [UInt8] = [
      0x5A,
      sequence,
      UInt8(crc & 0x00ff),
      UInt8((crc >> 8) & 0x00ff),
      lengthLow,
      lengthHigh
    ] + payload
    sequence = sequence &+ 1
    return Data(frameBytes)
  }

  private func parseReceivedFrames() {
    while receiveBuffer.count >= 6 {
      if receiveBuffer[0] != 0x5A {
        if let marker = receiveBuffer.firstIndex(of: 0x5A) {
          receiveBuffer.removeSubrange(0..<marker)
        } else {
          receiveBuffer.removeAll()
          return
        }
      }
      guard receiveBuffer.count >= 6 else { return }
      let payloadLength = Int(receiveBuffer[4]) | (Int(receiveBuffer[5]) << 8)
      let frameLength = payloadLength + 6
      if payloadLength < 0 || frameLength > 70_000 {
        receiveBuffer.removeFirst()
        emitError(moduleError("x1.invalid_frame_length:\(payloadLength)"))
        continue
      }
      guard receiveBuffer.count >= frameLength else { return }

      let actualCrc = UInt16(receiveBuffer[2]) | (UInt16(receiveBuffer[3]) << 8)
      let payload = receiveBuffer.subdata(in: 6..<frameLength)
      let expectedCrc = crc16Xmodem(lengthLow: receiveBuffer[4], lengthHigh: receiveBuffer[5], payload: payload)
      guard actualCrc == expectedCrc else {
        emitError(moduleError("x1.crc_mismatch"))
        if frameDebugEnabled {
          emitFrameEvent(direction: "rx", frame: Array(receiveBuffer.prefix(frameLength)), payload: Array(payload), crcValid: false)
        }
        receiveBuffer.removeSubrange(0..<frameLength)
        continue
      }

      if frameDebugEnabled {
        emitFrameEvent(direction: "rx", frame: Array(receiveBuffer.prefix(frameLength)), payload: Array(payload), crcValid: true)
      }
      receiveBuffer.removeSubrange(0..<frameLength)
      handlePayload(payload)
    }
  }

  private func handlePayload(_ payload: Data) {
    guard payload.count >= 2 else { return }
    let type = payload[0]
    let command = payload[1]
    let key = pendingKey(type: type, command: command)
    if let pending = pendingCommands.removeValue(forKey: key) {
      pending.timeout.cancel()
      pending.resolve(Array(payload))
    }

    if type == 0 {
      handleControlPayload(Array(payload))
    } else if type == 1 {
      handleRealtimePayload(payload)
    } else if type == 2 {
      handleImportPayload(payload)
    } else if type == 3 {
      emitEvent("onDeviceStatus", [
        "kind": "ack",
        "sequence": Int(command)
      ])
    }
  }

  private func handleRealtimePayload(_ payload: Data) {
    guard payload.count >= 2 else { return }
    let command = payload[1]
    if command == 1 {
      writeRealtimeAudioChunk(payload)
      return
    }
    if command == 4, activeRealtimeImport?.isStopping == true {
      let status = payload.count >= 3 ? Int(payload[2]) : 0
      completeRealtimeImport(status: status)
    }
  }

  private func writeRealtimeAudioChunk(_ payload: Data) {
    guard let state = activeRealtimeImport, payload.count > 2 else { return }
    do {
      let chunkByteCount = payload.count - 2
      state.audioBuffer.append(contentsOf: payload.dropFirst(2))
      state.bytesReceived += chunkByteCount
      state.chunksReceived += 1
      state.maxChunkBytes = max(state.maxChunkBytes, chunkByteCount)
      if state.audioBuffer.count >= audioWriteFlushBytes {
        try flushRealtimeAudioBuffer(state)
      }
      if shouldEmitRealtimeProgress(state) {
        emitEvent("onRealtimeProgress", realtimeProgressPayload(phase: "receiving", state: state))
      }
    } catch {
      failActiveRealtimeImport(error, deleteFile: false)
    }
  }

  private func handleControlPayload(_ payload: [UInt8]) {
    guard payload.count >= 2 else { return }
    let command = payload[1]
    if command == 4, payload.count >= 3 {
      emitEvent("onDeviceStatus", [
        "kind": "battery",
        "battery": Int(payload[2])
      ])
    } else if command == 11 {
      emitEvent("onDeviceStatus", [
        "kind": "version",
        "version": utf8String(Array(payload.dropFirst(2)))
      ])
    } else if command == 2, payload.count >= 10 {
      let usedBytes = Int(uint32LE(payload, offset: 2)) * 1024
      let totalBytes = Int(uint32LE(payload, offset: 6)) * 1024
      emitEvent("onDeviceStatus", [
        "kind": "storage",
        "usedBytes": usedBytes,
        "totalBytes": totalBytes,
        "freeBytes": max(0, totalBytes - usedBytes)
      ])
    } else if command == 6, let settings = try? settingsPayload(payload) {
      emitEvent("onDeviceStatus", settings)
    } else if command == 13, let identity = try? deviceIdentityPayload(payload) {
      emitEvent("onDeviceStatus", identity)
    } else if command == 14, payload.count >= 3 {
      emitEvent("onDeviceStatus", deviceFlagsPayload(flags: payload[2]))
    } else if command == 15 {
      emitEvent("onDeviceStatus", [
        "kind": "unbound"
      ])
    }
  }

  private func handleImportPayload(_ payload: Data) {
    guard payload.count >= 2 else { return }
    let command = payload[1]

    if command == 3 {
      let name = utf8String(Array(payload.dropFirst(2)))
      activeImport?.deviceName = name.isEmpty ? nil : name
      emitEvent("onImportProgress", importProgressPayload(phase: "started"))
      refreshImportTimeout(force: true)
      return
    }

    if command == 4 {
      guard let state = activeImport else { return }
      do {
        let chunkByteCount = payload.count - 2
        if state.firstByteAt == nil {
          state.firstByteAt = Date()
        }
        state.audioBuffer.append(contentsOf: payload.dropFirst(2))
        state.bytesReceived += chunkByteCount
        state.chunksReceived += 1
        state.maxChunkBytes = max(state.maxChunkBytes, chunkByteCount)
        if state.audioBuffer.count >= audioWriteFlushBytes {
          try flushImportAudioBuffer(state)
        }
        if shouldEmitImportProgress(state) {
          emitEvent("onImportProgress", importProgressPayload(phase: "receiving"))
        }
        refreshImportTimeout()
      } catch {
        failActiveImport(error, deleteFile: false)
      }
      return
    }

    if command == 5 {
      guard let state = activeImport else { return }
      let status = payload.count >= 3 ? Int(payload[2]) : -1
      completeImport(status: status, state: state)
      return
    }

    if command == 34 {
      emitEvent("onDeviceStatus", [
        "kind": "deleteAudio",
        "status": payload.count >= 3 ? Int(payload[2]) : 0,
        "payloadHex": hexString(Array(payload))
      ])
      return
    }

    if command == 11 {
      failActiveImport(moduleError("x1.import_stopped_by_device"), deleteFile: false)
      return
    }
  }

  private func completeImport(status: Int, state: ActiveImport) {
    activeImport = nil
    state.timeout?.cancel()
    var closeError: Error?
    do {
      try flushImportAudioBuffer(state)
      try state.fileHandle.close()
    } catch {
      closeError = error
      emitError(error)
    }

    let resolvedName = state.deviceName ?? state.requestedName
    let result: [String: Any] = [
      "uri": state.outputURL.absoluteString,
      "name": resolvedName,
      "byteSize": state.bytesReceived,
      "expectedSize": state.expectedSize,
      "durationMs": state.durationMs,
      "mime": mimeType(for: resolvedName),
      "status": status,
      "success": status == 0,
      "chunksReceived": state.chunksReceived,
      "maxChunkBytes": state.maxChunkBytes,
      "nativeStartedAt": isoString(state.startedAt),
      "firstByteAt": state.firstByteAt.map { isoString($0) } ?? NSNull(),
      "nativeEndedAt": isoString(Date())
    ]
    emitEvent("onImportComplete", result)
    if let closeError {
      try? FileManager.default.removeItem(at: state.outputURL)
      state.continuation.resume(throwing: closeError)
    } else if status == 0 {
      state.continuation.resume(returning: result)
    } else {
      try? FileManager.default.removeItem(at: state.outputURL)
      state.continuation.resume(throwing: moduleError("x1.import_failed_status:\(status)"))
    }
  }

  private func failActiveImport(_ error: Error, deleteFile: Bool) {
    guard let state = activeImport else { return }
    activeImport = nil
    state.timeout?.cancel()
    do {
      try? flushImportAudioBuffer(state)
      try state.fileHandle.close()
    } catch {
      emitError(error)
    }
    if deleteFile {
      try? FileManager.default.removeItem(at: state.outputURL)
    }
    state.continuation.resume(throwing: error)
    emitError(error)
  }

  private func completeRealtimeImport(status: Int) {
    guard let state = activeRealtimeImport else { return }
    activeRealtimeImport = nil
    state.stopTimeout?.cancel()
    state.stopTimeout = nil
    var closeError: Error?
    do {
      try flushRealtimeAudioBuffer(state)
      state.fileHandle.synchronizeFile()
      try state.fileHandle.close()
    } catch {
      closeError = error
      emitError(error)
    }

    let success = realtimeStopSucceeded(status: status, state: state)
    let result = realtimeCompletePayload(status: status, success: success, state: state)
    emitEvent("onRealtimeComplete", result)
    if let closeError {
      try? FileManager.default.removeItem(at: state.outputURL)
      state.stopContinuation?.resume(throwing: closeError)
    } else if success {
      state.stopContinuation?.resume(returning: result)
    } else {
      try? FileManager.default.removeItem(at: state.outputURL)
      state.stopContinuation?.resume(throwing: moduleError("x1.realtime_failed_status:\(status)"))
    }
  }

  private func failActiveRealtimeImport(_ error: Error, deleteFile: Bool) {
    guard let state = activeRealtimeImport else { return }
    activeRealtimeImport = nil
    state.stopTimeout?.cancel()
    state.stopTimeout = nil
    do {
      try? flushRealtimeAudioBuffer(state)
      try state.fileHandle.close()
    } catch {
      emitError(error)
    }
    if deleteFile {
      try? FileManager.default.removeItem(at: state.outputURL)
    }
    state.stopContinuation?.resume(throwing: error)
    emitError(error)
  }

  private func flushImportAudioBuffer(_ state: ActiveImport) throws {
    guard state.audioBuffer.isEmpty == false else { return }
    try state.fileHandle.write(contentsOf: state.audioBuffer)
    state.flushedBytes += state.audioBuffer.count
    state.audioBuffer.removeAll(keepingCapacity: true)
  }

  private func flushRealtimeAudioBuffer(_ state: ActiveRealtimeImport) throws {
    guard state.audioBuffer.isEmpty == false else { return }
    try state.fileHandle.write(contentsOf: state.audioBuffer)
    state.flushedBytes += state.audioBuffer.count
    state.audioBuffer.removeAll(keepingCapacity: true)
  }

  private func refreshImportTimeout(force: Bool = false) {
    guard let state = activeImport else { return }
    let now = Date()
    if !force && now.timeIntervalSince(state.lastTimeoutRefreshAt) < importTimeoutRefreshMinInterval {
      return
    }
    state.timeout?.cancel()
    state.lastTimeoutRefreshAt = now
    state.timeout = scheduleTimeout(after: importTimeoutSeconds) { [weak self] in
      guard let self else { return }
      self.failActiveImport(self.moduleError("x1.import_idle_timeout"), deleteFile: false)
    }
  }

  private func shouldEmitImportProgress(_ state: ActiveImport) -> Bool {
    let now = Date()
    let byteDelta = state.bytesReceived - state.lastProgressBytes
    let elapsed = now.timeIntervalSince(state.lastProgressSentAt)
    let complete = state.expectedSize > 0 && state.bytesReceived >= state.expectedSize
    guard complete || byteDelta >= importProgressEventMinBytes || elapsed >= importProgressEventMinInterval else {
      return false
    }
    state.lastProgressSentAt = now
    state.lastProgressBytes = state.bytesReceived
    return true
  }

  private func shouldEmitRealtimeProgress(_ state: ActiveRealtimeImport) -> Bool {
    let now = Date()
    let byteDelta = state.bytesReceived - state.lastProgressBytes
    let elapsed = now.timeIntervalSince(state.lastProgressSentAt)
    guard byteDelta >= realtimeProgressEventMinBytes || elapsed >= realtimeProgressEventMinInterval else {
      return false
    }
    state.lastProgressSentAt = now
    state.lastProgressBytes = state.bytesReceived
    return true
  }

  private func importProgressPayload(phase: String) -> [String: Any] {
    guard let state = activeImport else {
      return ["phase": phase]
    }
    return [
      "phase": phase,
      "name": state.deviceName ?? state.requestedName,
      "bytesReceived": state.bytesReceived,
      "expectedSize": state.expectedSize,
      "durationMs": state.durationMs
    ]
  }

  private func emitFrameEvent(direction: String, frame: [UInt8], payload: [UInt8], crcValid: Bool?) {
    guard frameDebugEnabled else { return }
    var event: [String: Any] = [
      "direction": direction,
      "frameHex": hexString(frame),
      "payloadHex": hexString(payload),
      "type": Int(payload.first ?? 0),
      "command": payload.count > 1 ? Int(payload[1]) : NSNull()
    ]
    if let crcValid {
      event["crcValid"] = crcValid
    }
    emitEvent("onFrame", event)
  }

  private func realtimeStartPayload(state: ActiveRealtimeImport) -> [String: Any] {
    [
      "uri": state.outputURL.absoluteString,
      "name": state.requestedName,
      "byteSize": state.bytesReceived,
      "durationMs": 0,
      "mime": "audio/mpeg",
      "status": 0,
      "success": true,
      "startedAt": isoString(state.startedAt),
      "endedAt": NSNull(),
      "chunksReceived": state.chunksReceived,
      "maxChunkBytes": state.maxChunkBytes
    ]
  }

  private func realtimeProgressPayload(phase: String, state: ActiveRealtimeImport) -> [String: Any] {
    [
      "phase": phase,
      "name": state.requestedName,
      "bytesReceived": state.bytesReceived,
      "durationMs": max(0, Int(Date().timeIntervalSince(state.startedAt) * 1000)),
      "chunksReceived": state.chunksReceived
    ]
  }

  private func realtimeCompletePayload(status: Int, success: Bool, state: ActiveRealtimeImport) -> [String: Any] {
    let endedAt = Date()
    return [
      "uri": state.outputURL.absoluteString,
      "name": state.requestedName,
      "byteSize": state.bytesReceived,
      "expectedSize": state.bytesReceived,
      "durationMs": max(0, Int(endedAt.timeIntervalSince(state.startedAt) * 1000)),
      "mime": "audio/mpeg",
      "status": status,
      "success": success,
      "startedAt": isoString(state.startedAt),
      "endedAt": isoString(endedAt),
      "chunksReceived": state.chunksReceived,
      "maxChunkBytes": state.maxChunkBytes
    ]
  }

  private func realtimeStopSucceeded(status: Int, state: ActiveRealtimeImport) -> Bool {
    if status == 0 {
      return true
    }

    // X1 reports `1,4,2` after a normal realtime stop on device firmware 1.0.7.
    // Treat it as a stopped state once we have already received MP3 data.
    if status == 2 && state.bytesReceived > 0 {
      return true
    }

    return false
  }

  private func failAllPending(_ error: Error) {
    let pending = pendingCommands
    pendingCommands.removeAll()
    for command in pending.values {
      command.timeout.cancel()
      command.reject(error)
    }
  }

  private func parseAudioListPayload(_ payload: [UInt8], requestedStart: Int) throws -> [[String: Any]] {
    guard payload.count >= 6 else {
      throw moduleError("x1.malformed_audio_list_reply")
    }
    let total = Int(uint32LE(payload, offset: 2))
    var files: [[String: Any]] = []
    var offset = 6
    var index = requestedStart
    while offset + 28 <= payload.count {
      let durationMs = Int(uint32LE(payload, offset: offset)) * 1000
      let byteSize = Int(uint32LE(payload, offset: offset + 4))
      let nameBytes = Array(payload[(offset + 8)..<(offset + 28)])
      let name = cleanedFilename(from: nameBytes)
      if name.isEmpty == false {
        files.append([
          "index": index,
          "name": name,
          "durationMs": durationMs,
          "byteSize": byteSize,
          "totalCount": total
        ])
      }
      offset += 28
      index += 1
    }
    return files
  }

  private func checkTimePayload() -> [UInt8] {
    let calendar = Calendar.current
    let now = Date()
    let year = calendar.component(.year, from: now)
    return [
      0,
      0,
      UInt8(year & 0x00ff),
      UInt8((year >> 8) & 0x00ff),
      UInt8(calendar.component(.month, from: now)),
      UInt8(calendar.component(.day, from: now)),
      UInt8(calendar.component(.hour, from: now)),
      UInt8(calendar.component(.minute, from: now)),
      UInt8(calendar.component(.second, from: now))
    ]
  }

  private func startImportPayload(name: String, offset: Int) -> [UInt8] {
    return [2, 2] + littleEndian32(offset) + fixedFilenameBytes(name)
  }

  private func deleteAudioPayload(names: [String]) -> [UInt8] {
    var payload = [UInt8(2), UInt8(8)] + littleEndian32(names.count)
    for name in names {
      payload += fixedFilenameBytes(name)
    }
    return payload
  }

  private func fixedFilenameBytes(_ name: String) -> [UInt8] {
    var nameBytes = Array((name.data(using: .utf8) ?? Data()).prefix(20))
    while nameBytes.count < 20 {
      nameBytes.append(0)
    }
    return nameBytes
  }

  private func settingsPayload(_ payload: [UInt8]) throws -> [String: Any] {
    guard payload.count >= 5 else { throw moduleError("x1.malformed_settings_reply") }
    return [
      "kind": "settings",
      "clearRecord": payload[2] == 1,
      "hideRecord": payload[3] == 1,
      "privacy": payload[4] == 1,
      "raw": [Int(payload[2]), Int(payload[3]), Int(payload[4])]
    ]
  }

  private func deviceIdentityPayload(_ payload: [UInt8]) throws -> [String: Any] {
    guard payload.count >= 8 else { throw moduleError("x1.malformed_identity_reply") }
    let macBytes = Array(payload[2..<8])
    let appKeyBytes = payload.count > 8 ? Array(payload.dropFirst(8)) : []
    let mac = macBytes.map { String(format: "%02X", $0) }.joined(separator: ":")
    return [
      "kind": "deviceIdentity",
      "mac": mac,
      "macHex": hexString(macBytes),
      "appKey": utf8String(appKeyBytes),
      "appKeyHex": hexString(appKeyBytes)
    ]
  }

  private func deleteAudioResultPayload(payload: [UInt8], names: [String], all: Bool) -> [String: Any] {
    let status = payload.count >= 3 ? Int(payload[2]) : 0
    return [
      "kind": "deleteAudio",
      "deletedCount": all ? NSNull() : names.count,
      "names": names,
      "all": all,
      "status": status,
      "success": status == 0,
      "payloadHex": hexString(payload)
    ]
  }

  private func deviceFlagsPayload(flags: UInt8) -> [String: Any] {
    [
      "kind": "deviceFlags",
      "flags": Int(flags),
      "isPlaying": flag(flags, bit: 0),
      "isRecording": flag(flags, bit: 1),
      "isUsbMode": flag(flags, bit: 2),
      "isRealtimeTranscribing": flag(flags, bit: 3),
      "isImporting": flag(flags, bit: 4),
      "isPlaybackPaused": flag(flags, bit: 5),
      "isScanningBusy": flag(flags, bit: 6)
    ]
  }

  private func flag(_ value: UInt8, bit: UInt8) -> Bool {
    (value & (1 << bit)) != 0
  }

  private func settingPosition(_ position: Int) throws -> UInt8 {
    guard position == 7 || position == 8 || position == 9 else {
      throw moduleError("x1.invalid_setting_position:\(position)")
    }
    return UInt8(position)
  }

  private func parseHexPayload(_ raw: String) throws -> [UInt8] {
    let cleaned = raw
      .replacingOccurrences(of: "0x", with: "")
      .replacingOccurrences(of: ",", with: " ")
      .replacingOccurrences(of: "\n", with: " ")
      .split(separator: " ")
      .joined()
    guard cleaned.count > 0, cleaned.count % 2 == 0 else {
      throw moduleError("x1.invalid_hex_payload")
    }
    var bytes: [UInt8] = []
    var index = cleaned.startIndex
    while index < cleaned.endIndex {
      let next = cleaned.index(index, offsetBy: 2)
      let pair = String(cleaned[index..<next])
      guard let value = UInt8(pair, radix: 16) else {
        throw moduleError("x1.invalid_hex_payload")
      }
      bytes.append(value)
      index = next
    }
    return bytes
  }

  private func littleEndian32(_ value: Int) -> [UInt8] {
    let safe = UInt32(max(0, value))
    return [
      UInt8(safe & 0x000000ff),
      UInt8((safe >> 8) & 0x000000ff),
      UInt8((safe >> 16) & 0x000000ff),
      UInt8((safe >> 24) & 0x000000ff)
    ]
  }

  private func uint32LE(_ payload: [UInt8], offset: Int) -> UInt32 {
    guard offset + 3 < payload.count else { return 0 }
    return UInt32(payload[offset])
      | (UInt32(payload[offset + 1]) << 8)
      | (UInt32(payload[offset + 2]) << 16)
      | (UInt32(payload[offset + 3]) << 24)
  }

  private func crc16Xmodem<S: Sequence>(lengthLow: UInt8, lengthHigh: UInt8, payload: S) -> UInt16 where S.Element == UInt8 {
    var crc: UInt16 = 0
    crc = crc16XmodemUpdate(crc, byte: lengthLow)
    crc = crc16XmodemUpdate(crc, byte: lengthHigh)
    for byte in payload {
      crc = crc16XmodemUpdate(crc, byte: byte)
    }
    return crc
  }

  private func crc16XmodemUpdate(_ current: UInt16, byte: UInt8) -> UInt16 {
    var crc = current ^ (UInt16(byte) << 8)
    for _ in 0..<8 {
      if (crc & 0x8000) != 0 {
        crc = (crc &<< 1) ^ 0x1021
      } else {
        crc = crc &<< 1
      }
    }
    return crc
  }

  private func cleanedFilename(from bytes: [UInt8]) -> String {
    var data = Data(bytes)
    if let nullIndex = data.firstIndex(of: 0) {
      data = Data(data.prefix(upTo: nullIndex))
    }
    var name = String(data: data, encoding: .utf8) ?? ""
    name = name.trimmingCharacters(in: .whitespacesAndNewlines)
    if let range = name.range(of: ".mp3", options: [.caseInsensitive, .backwards]) {
      name = String(name[..<range.upperBound])
    }
    return name
  }

  private func utf8String(_ bytes: [UInt8]) -> String {
    var data = Data(bytes)
    if let nullIndex = data.firstIndex(of: 0) {
      data = Data(data.prefix(upTo: nullIndex))
    }
    return (String(data: data, encoding: .utf8) ?? "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func audioExtension(for name: String) -> String {
    let ext = (name as NSString).pathExtension.lowercased()
    if ext.isEmpty {
      return "mp3"
    }
    return ext
  }

  private func mimeType(for name: String) -> String {
    switch audioExtension(for: name) {
    case "m4a":
      return "audio/m4a"
    case "wav":
      return "audio/wav"
    case "aac":
      return "audio/aac"
    default:
      return "audio/mpeg"
    }
  }

  private func realtimeFilename(_ requestedName: String) -> String {
    let trimmed = requestedName.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty == false {
      return trimmed.lowercased().hasSuffix(".mp3") ? trimmed : "\(trimmed).mp3"
    }
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyyMMddHHmmss"
    return "\(formatter.string(from: Date())).mp3"
  }

  private func isoString(_ date: Date) -> String {
    ISO8601DateFormatter().string(from: date)
  }

  private func isLikelyX1(name: String, advertisedServices: [String]) -> Bool {
    if advertisedServices.contains(serviceUUID.uuidString.lowercased()) {
      return true
    }
    let normalized = name.lowercased()
    return normalized.contains("x1")
      || normalized.contains("newman")
      || normalized.contains("niuman")
      || normalized.contains("recorder")
      || name.contains("纽曼")
      || name.contains("录音")
  }

  private func statePayload() -> [String: Any] {
    var payload: [String: Any] = [
      "bluetoothState": bluetoothStateString(centralManager.state),
      "connectionState": connectionState,
      "isScanning": centralManager.isScanning
    ]
    if let connectedPeripheral {
      payload["device"] = devicePayload(peripheral: connectedPeripheral)
    }
    return payload
  }

  private func devicePayload(peripheral: CBPeripheral) -> [String: Any] {
    let identifier = peripheral.identifier.uuidString
    var payload = discoveredPayloads[identifier] ?? [
      "id": identifier,
      "name": peripheral.name ?? "",
      "advertisedServices": [] as [String],
      "isLikelyX1": isLikelyX1(name: peripheral.name ?? "", advertisedServices: [])
    ]
    payload["id"] = identifier
    payload["name"] = peripheral.name ?? (payload["name"] as? String ?? "")
    return payload
  }

  private func bluetoothStateString(_ state: CBManagerState) -> String {
    switch state {
    case .unknown:
      return "unknown"
    case .resetting:
      return "resetting"
    case .unsupported:
      return "unsupported"
    case .unauthorized:
      return "unauthorized"
    case .poweredOff:
      return "poweredOff"
    case .poweredOn:
      return "poweredOn"
    @unknown default:
      return "unknown"
    }
  }

  private func emitConnectionState() {
    emitEvent("onConnectionState", statePayload())
  }

  private func emitError(_ error: Error) {
    emitEvent("onError", ["message": error.localizedDescription])
  }

  private func emitEvent(_ name: String, _ payload: [String: Any]) {
    DispatchQueue.main.async { [weak self] in
      self?.sendEvent(name, payload)
    }
  }

  private func pendingKey(type: UInt8, command: UInt8) -> String {
    "\(type)-\(command)"
  }

  private func scheduleTimeout(after seconds: TimeInterval, _ block: @escaping () -> Void) -> DispatchWorkItem {
    let item = DispatchWorkItem(block: block)
    bluetoothQueue.asyncAfter(deadline: .now() + seconds, execute: item)
    return item
  }

  private func moduleError(_ message: String) -> NSError {
    NSError(
      domain: "OrbitRecorderDevice",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: message]
    )
  }

  private func hexString(_ bytes: [UInt8]) -> String {
    bytes.map { String(format: "%02x", $0) }.joined(separator: " ")
  }
}
