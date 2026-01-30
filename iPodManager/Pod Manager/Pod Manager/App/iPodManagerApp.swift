import SwiftUI

@main
struct iPodManagerApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            MainView()
                .frame(minWidth: 900, minHeight: 600)
        }
        .commands {
            CommandGroup(replacing: .newItem) { }

            CommandMenu("Library") {
                Button("Scan Music Library") {
                    NotificationCenter.default.post(name: .scanLibrary, object: nil)
                }
                .keyboardShortcut("R", modifiers: [.command, .shift])

                Button("Scan Podcasts") {
                    NotificationCenter.default.post(name: .scanPodcasts, object: nil)
                }

                Divider()

                Button("Settings...") {
                    NotificationCenter.default.post(name: .showSettings, object: nil)
                }
                .keyboardShortcut(",", modifiers: .command)
            }

            CommandMenu("iPod") {
                Button("Connect") {
                    NotificationCenter.default.post(name: .connectIPod, object: nil)
                }
                .keyboardShortcut("K", modifiers: .command)

                Button("Disconnect") {
                    NotificationCenter.default.post(name: .disconnectIPod, object: nil)
                }
                .keyboardShortcut("K", modifiers: [.command, .shift])

                Divider()

                Button("Sync Now") {
                    NotificationCenter.default.post(name: .syncIPod, object: nil)
                }
                .keyboardShortcut("S", modifiers: [.command, .shift])
            }
        }
    }
}

extension Notification.Name {
    static let scanLibrary = Notification.Name("scanLibrary")
    static let scanPodcasts = Notification.Name("scanPodcasts")
    static let showSettings = Notification.Name("showSettings")
    static let connectIPod = Notification.Name("connectIPod")
    static let disconnectIPod = Notification.Name("disconnectIPod")
    static let syncIPod = Notification.Name("syncIPod")
    static let scanComplete = Notification.Name("scanComplete")
    static let syncComplete = Notification.Name("syncComplete")
}
