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
      "title": sharedTitle ?? NSNull(),
      "share_context": buildShareContext(text: textView.text ?? ""),
      "attachments": attachments
    ]
    let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
    try data.write(to: shareDir.appendingPathComponent("payload.json"), options: .atomic)
    try Data().write(to: shareDir.appendingPathComponent(".complete"), options: .atomic)
  }

  private func buildShareContext(text: String) -> [String: Any] {
    let platform = detectSharePlatform(urlString: sharedURL, text: text)
    return [
      "capture_method": "share_extension",
      "source_platform": platform,
      "parser_hint": parserHint(for: platform),
      "source_url": sharedURL ?? NSNull(),
      "canonical_url": canonicalShareURL(urlString: sharedURL, platform: platform) ?? NSNull(),
      "raw_share_text": text.isEmpty ? NSNull() : text,
      "source_title": sharedTitle ?? NSNull(),
      "origin_app": NSNull(),
      "enrichment_state": "pending"
    ]
  }

  private func detectSharePlatform(urlString: String?, text: String) -> String {
    let candidate = urlString ?? firstURL(in: text)
    guard
      let candidate,
      let components = URLComponents(string: candidate),
      let host = components.host?.lowercased()
    else {
      return "unknown"
    }
    if host == "mp.weixin.qq.com" {
      return "wechat_article"
    }
    if host.hasSuffix("xiaohongshu.com") || host == "xhslink.com" {
      return "xiaohongshu"
    }
    if host == "x.com" || host.hasSuffix(".x.com") || host == "twitter.com" || host.hasSuffix(".twitter.com") {
      return "x"
    }
    return "web"
  }

  private func parserHint(for platform: String) -> String {
    switch platform {
    case "wechat_article":
      return "wechat_article"
    case "xiaohongshu":
      return "xiaohongshu_note"
    case "x":
      return "x_post"
    default:
      return "generic_url"
    }
  }

  private func canonicalShareURL(urlString: String?, platform: String) -> String? {
    guard let urlString, var components = URLComponents(string: urlString) else {
      return urlString
    }
    components.fragment = nil
    if platform == "x" {
      let parts = components.path.split(separator: "/").map(String.init)
      if parts.count >= 3, parts[1].lowercased().hasPrefix("status") {
        components.scheme = "https"
        components.host = "x.com"
        components.path = "/\(parts[0])/status/\(parts[2])"
        components.query = nil
      } else if components.host?.contains("twitter.com") == true {
        components.host = "x.com"
      }
    }
    return components.string
  }

  private func firstURL(in text: String) -> String? {
    guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
      return nil
    }
    let range = NSRange(text.startIndex..<text.endIndex, in: text)
    return detector.firstMatch(in: text, options: [], range: range)?.url?.absoluteString
  }
}
