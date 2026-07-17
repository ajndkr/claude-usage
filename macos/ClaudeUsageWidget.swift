// ClaudeUsageWidget - a tiny borderless, always-on-top SwiftUI panel that shows
// claude.ai / Claude Code usage. It does NOT re-implement auth or networking:
// it shells out to the existing `claude-usage --json` and renders the result.
//
// __CLAUDE_USAGE_NODE__ and __CLAUDE_USAGE_CLI__ are absolute paths substituted
// by macos/build.sh at build time (a GUI app has a minimal PATH, so we can't
// rely on `node`/`claude-usage` being resolvable by name).
//
// Compiled as main.swift so top-level `app.run()` is allowed.

import SwiftUI
import AppKit

let NODE_PATH = "__CLAUDE_USAGE_NODE__"
let CLI_PATH = "__CLAUDE_USAGE_CLI__"
let REFRESH_SECS: TimeInterval = 60
let ORIGIN_KEY = "widgetOrigin"

// ── data ────────────────────────────────────────────────────────────────────
struct UsageWindow: Identifiable {
    let id = UUID()
    let label: String
    let utilization: Double
    let resetsAt: Date?
}

// Mirrors WINDOW_LABELS in cli.js (order matters).
let WINDOW_LABELS: [(key: String, label: String)] = [
    ("five_hour", "Session 5h"),
    ("seven_day", "Weekly 7d"),
    ("seven_day_opus", "Opus"),
    ("seven_day_sonnet", "Sonnet"),
]

final class UsageModel: ObservableObject {
    @Published var windows: [UsageWindow] = []
    @Published var error: String? = nil
    @Published var updatedAt: Date? = nil
    @Published var loading = false

    func refresh() {
        if loading { return }
        loading = true
        DispatchQueue.global(qos: .userInitiated).async {
            let (data, err) = self.runCLI()
            DispatchQueue.main.async {
                if let data = data {
                    self.parse(data)
                } else {
                    self.error = err ?? "unknown error"
                }
                self.updatedAt = Date()
                self.loading = false
            }
        }
    }

    // Runs `node cli.js --json`. Returns (data, nil) on success or (nil, message).
    private func runCLI() -> (Data?, String?) {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: NODE_PATH)
        p.arguments = [CLI_PATH, "--json"]
        let out = Pipe()
        let err = Pipe()
        p.standardOutput = out
        p.standardError = err
        do {
            try p.run()
        } catch {
            return (nil, "couldn't launch node:\n\(error.localizedDescription)")
        }
        let outData = out.fileHandleForReading.readDataToEndOfFile()
        let errData = err.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        if p.terminationStatus != 0 {
            var msg = String(data: errData, encoding: .utf8) ?? "exit code \(p.terminationStatus)"
            msg = msg.trimmingCharacters(in: .whitespacesAndNewlines)
            if msg.hasPrefix("error: ") { msg = String(msg.dropFirst("error: ".count)) }
            return (nil, msg.isEmpty ? "exit code \(p.terminationStatus)" : msg)
        }
        return (outData, nil)
    }

    private func parse(_ data: Data) {
        guard let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            self.error = "couldn't parse usage response."
            return
        }
        var result: [UsageWindow] = []
        for entry in WINDOW_LABELS {
            guard let w = obj[entry.key] as? [String: Any],
                  let util = w["utilization"] as? Double else { continue }
            let resets = (w["resets_at"] as? String).flatMap(parseISO)
            result.append(UsageWindow(label: entry.label, utilization: util, resetsAt: resets))
        }
        self.windows = result
        self.error = result.isEmpty ? "No usage windows reported." : nil
    }
}

// ── Claude Code color system ──────────────────────────────────────────────
// Warm, Claude-branded palette. `accent` is the signature Claude orange
// (#D97757); the surface/text tones are warm near-blacks and off-whites to
// match Claude Code, and the usage severity ramp stays legible against them.
enum CC {
    static let accent    = Color(red: 0.851, green: 0.467, blue: 0.341) // #D97757
    static let surface   = Color(red: 0.102, green: 0.098, blue: 0.094) // warm near-black
    static let border    = Color(red: 1, green: 1, blue: 1).opacity(0.08)
    static let track     = Color(red: 1, green: 1, blue: 1).opacity(0.10)
    static let text      = Color(red: 0.949, green: 0.937, blue: 0.918) // warm off-white
    static let textDim   = Color(red: 0.612, green: 0.588, blue: 0.549) // warm grey
    static let success   = Color(red: 0.416, green: 0.706, blue: 0.525) // calm green
    static let warning   = Color(red: 0.851, green: 0.467, blue: 0.341) // Claude orange
    static let danger    = Color(red: 0.816, green: 0.373, blue: 0.325) // warm red
}

// The Claude "spark": a radial burst of rounded spokes in Claude orange.
struct ClaudeMark: View {
    var color: Color = CC.accent
    var spokes: Int = 12

    var body: some View {
        Canvas { ctx, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let outer = min(size.width, size.height) * 0.5
            let inner = outer * 0.16
            let thickness = outer * 0.20
            for i in 0..<spokes {
                var spoke = ctx
                spoke.translateBy(x: center.x, y: center.y)
                spoke.rotate(by: .radians(Double(i) / Double(spokes) * 2 * .pi))
                let rect = CGRect(x: inner, y: -thickness / 2,
                                  width: outer - inner, height: thickness)
                spoke.fill(Path(roundedRect: rect, cornerRadius: thickness / 2),
                           with: .color(color))
            }
        }
    }
}

// ── helpers ───────────────────────────────────────────────────────────────
func parseISO(_ s: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: s) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: s)
}

func resetString(_ date: Date) -> String {
    let secs = date.timeIntervalSinceNow
    if secs <= 0 { return "resetting…" }
    let mins = Int((secs / 60).rounded())
    let h = mins / 60, m = mins % 60
    if h >= 24 { return "resets in \(h / 24)d \(h % 24)h" }
    if h > 0 { return "resets in \(h)h \(m)m" }
    return "resets in \(m)m"
}

func timeString(_ date: Date) -> String {
    let f = DateFormatter()
    f.dateFormat = "HH:mm:ss"
    return f.string(from: date)
}

func barColor(_ pct: Double) -> Color {
    pct >= 90 ? CC.danger : (pct >= 70 ? CC.warning : CC.success)
}

// ── views ─────────────────────────────────────────────────────────────────
struct Bar: View {
    let pct: Double
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 3).fill(CC.track)
                RoundedRectangle(cornerRadius: 3)
                    .fill(barColor(pct))
                    .frame(width: g.size.width * min(max(pct, 0), 100) / 100)
            }
        }
        .frame(height: 6)
    }
}

struct WindowRow: View {
    let w: UsageWindow
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(w.label).font(.system(size: 11)).foregroundColor(CC.text)
                Spacer()
                Text("\(Int(w.utilization.rounded()))%")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(barColor(w.utilization))
            }
            Bar(pct: w.utilization)
            if let r = w.resetsAt {
                Text(resetString(r)).font(.system(size: 9)).foregroundColor(CC.textDim)
            }
        }
    }
}

struct ContentView: View {
    @ObservedObject var model: UsageModel
    var onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 7) {
                ClaudeMark(color: CC.accent).frame(width: 16, height: 16)
                Text("Claude Usage")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(CC.accent)
                Spacer()
                if model.loading {
                    ProgressView().controlSize(.small).scaleEffect(0.7).frame(width: 14, height: 14)
                } else {
                    Button(action: { model.refresh() }) {
                        Image(systemName: "arrow.clockwise").font(.system(size: 11))
                    }
                    .buttonStyle(.plain).foregroundColor(CC.textDim)
                }
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 11))
                }
                .buttonStyle(.plain).foregroundColor(CC.textDim)
            }

            if let err = model.error, model.windows.isEmpty {
                Text(err)
                    .font(.system(size: 11))
                    .foregroundColor(CC.textDim)
                    .fixedSize(horizontal: false, vertical: true)
                if err.lowercased().contains("login") || err.lowercased().contains("logged in") {
                    Text("Run `claude-usage login` in a terminal.")
                        .font(.system(size: 10)).foregroundColor(CC.textDim.opacity(0.8))
                }
            } else {
                ForEach(model.windows) { w in WindowRow(w: w) }
            }

            if let u = model.updatedAt {
                Text("updated \(timeString(u))").font(.system(size: 9)).foregroundColor(CC.textDim)
            }
        }
        .padding(14)
        .frame(width: 250, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14).fill(CC.surface.opacity(0.94)))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(CC.border, lineWidth: 1))
    }
}

// ── window ────────────────────────────────────────────────────────────────
final class WidgetPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    let model = UsageModel()
    var panel: WidgetPanel!
    var timer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        let hc = NSHostingController(rootView: ContentView(model: model) { NSApp.terminate(nil) })
        panel = WidgetPanel(
            contentRect: NSRect(x: 0, y: 0, width: 250, height: 200),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered, defer: false
        )
        panel.contentViewController = hc
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.isMovableByWindowBackground = true
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]

        positionPanel()
        panel.orderFrontRegardless()

        model.refresh()
        let t = Timer.scheduledTimer(withTimeInterval: REFRESH_SECS, repeats: true) { [weak self] _ in
            self?.model.refresh()
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t

        NotificationCenter.default.addObserver(
            self, selector: #selector(saveOrigin),
            name: NSWindow.didMoveNotification, object: panel
        )
    }

    private func positionPanel() {
        let size = panel.frame.size
        if let saved = UserDefaults.standard.string(forKey: ORIGIN_KEY) {
            let parts = saved.split(separator: ",").compactMap { Double($0) }
            if parts.count == 2 {
                let origin = NSPoint(x: parts[0], y: parts[1])
                if NSScreen.screens.contains(where: { $0.frame.contains(origin) }) {
                    panel.setFrameOrigin(origin)
                    return
                }
            }
        }
        if let screen = NSScreen.main {
            let vf = screen.visibleFrame
            let margin: CGFloat = 20
            panel.setFrameOrigin(NSPoint(x: vf.maxX - size.width - margin,
                                         y: vf.maxY - size.height - margin))
        }
    }

    @objc private func saveOrigin() {
        let o = panel.frame.origin
        UserDefaults.standard.set("\(o.x),\(o.y)", forKey: ORIGIN_KEY)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
