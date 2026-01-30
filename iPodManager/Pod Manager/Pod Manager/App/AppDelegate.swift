import Cocoa

class AppDelegate: NSObject, NSApplicationDelegate {

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Initialize any services here
        print("iPod Manager launched")
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Clean up resources
        print("iPod Manager terminating")
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}
