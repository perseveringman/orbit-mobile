import MobileCoreServices
import LinkPresentation
import UniformTypeIdentifiers
import UIKit

final class ShareViewController: UIViewController {
  private let textView = UITextView()
  private let statusLabel = UILabel()
  private let itemLock = NSLock()
  private var sharedText = ""
  private var sharedURL: String?
  private var sharedTitle: String?
  private var imageTempURLs: [URL] = []
  private var metadataProvider: LPMetadataProvider?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    configureUI()
    loadSharedItems()
  }

  private func configureUI() {
    let title = UILabel()
    title.text = "Save to Orbit"
    title.font = .preferredFont(forTextStyle: .headline)

    textView.font = .preferredFont(forTextStyle: .body)
    textView.layer.borderColor = UIColor.separator.cgColor
    textView.layer.borderWidth = 1
    textView.layer.cornerRadius = 12

    statusLabel.textColor = .secondaryLabel
    statusLabel.font = .preferredFont(forTextStyle: .footnote)

    let saveButton = UIButton(type: .system)
    saveButton.setTitle("Save", for: .normal)
    saveButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
    saveButton.addTarget(self, action: #selector(save), for: .touchUpInside)

    let cancelButton = UIButton(type: .system)
    cancelButton.setTitle("Cancel", for: .normal)
    cancelButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)

    let buttons = UIStackView(arrangedSubviews: [cancelButton, saveButton])
    buttons.axis = .horizontal
    buttons.distribution = .equalSpacing

    let stack = UIStackView(arrangedSubviews: [title, textView, statusLabel, buttons])
    stack.axis = .vertical
    stack.spacing = 12
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)

    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
      stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
      stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
      textView.heightAnchor.constraint(equalToConstant: 180)
    ])
  }

  private func loadSharedItems() {
    guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return }
    let group = DispatchGroup()

    for item in items {
      for provider in item.attachments ?? [] {
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
          group.enter()
          provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] item, _ in
            defer { group.leave() }
            guard let self, let url = item as? URL else { return }
            self.itemLock.lock()
            self.sharedURL = url.absoluteString
            self.itemLock.unlock()
            let provider = LPMetadataProvider()
            self.metadataProvider = provider
            group.enter()
            provider.startFetchingMetadata(for: url) { [weak self] metadata, _ in
              defer { group.leave() }
              guard let self else { return }
              self.itemLock.lock()
              self.sharedTitle = metadata?.title
              self.itemLock.unlock()
            }
          }
        } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
          group.enter()
          provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] item, _ in
            defer { group.leave() }
            guard let self, let text = item as? String else { return }
            self.itemLock.lock()
            self.sharedText = text
            self.itemLock.unlock()
          }
        } else if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
          group.enter()
          provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { [weak self] url, _ in
            defer { group.leave() }
            guard let url else { return }
            let target = FileManager.default.temporaryDirectory
              .appendingPathComponent(UUID().uuidString)
              .appendingPathExtension(url.pathExtension.isEmpty ? "jpg" : url.pathExtension)
            try? FileManager.default.copyItem(at: url, to: target)
            self?.itemLock.lock()
            self?.imageTempURLs.append(target)
            self?.itemLock.unlock()
          }
        }
      }
    }

    group.notify(queue: .main) { [weak self] in
      guard let self else { return }
      self.textView.text = self.sharedText.isEmpty ? (self.sharedTitle ?? "") : self.sharedText
      self.statusLabel.text = self.imageTempURLs.isEmpty ? "Ready" : "\(self.imageTempURLs.count) image(s) attached"
    }
  }

  @objc private func save() {
    do {
      try writeSharePayload()
      extensionContext?.completeRequest(returningItems: nil)
    } catch {
      statusLabel.text = error.localizedDescription
    }
  }

  @objc private func cancel() {
    extensionContext?.cancelRequest(withError: NSError(domain: "OrbitShareExtension", code: 1))
  }

  private func writeSharePayload() throws {
    guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.zhouyanbo.orbit.capture") else {
      throw NSError(domain: "OrbitShareExtension", code: 2, userInfo: [NSLocalizedDescriptionKey: "App Group container unavailable"])
    }

    let id = "mob_cap_\(UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: ""))"
    let shareDir = container.appendingPathComponent("share-inbox", isDirectory: true)
      .appendingPathComponent(id, isDirectory: true)
    let attachmentsDir = shareDir.appendingPathComponent("attachments", isDirectory: true)
    try FileManager.default.createDirectory(at: attachmentsDir, withIntermediateDirectories: true)

    var attachments: [[String: String]] = []
    for (index, source) in imageTempURLs.enumerated() {
      let ext = source.pathExtension.isEmpty ? "jpg" : source.pathExtension
      let filename = "photo-\(index + 1).\(ext)"
      try FileManager.default.copyItem(at: source, to: attachmentsDir.appendingPathComponent(filename))
      attachments.append(["type": "image", "filename": filename, "mime": ext == "png" ? "image/png" : "image/jpeg"])
    }

    let payload: [String: Any] = [
      "schema_version": 1,
      "id": id,
      "content": textView.text ?? "",
      "url": sharedURL ?? NSNull(),
      "attachments": attachments
    ]
    let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
    try data.write(to: shareDir.appendingPathComponent("payload.json"), options: .atomic)
    try Data().write(to: shareDir.appendingPathComponent(".complete"), options: .atomic)
  }
}
