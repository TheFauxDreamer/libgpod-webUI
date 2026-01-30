import Foundation
import Combine

class AppSettings: ObservableObject {
    static let shared = AppSettings()

    @Published var musicLibraryPath: String? {
        didSet { UserDefaults.standard.set(musicLibraryPath, forKey: "musicLibraryPath") }
    }

    @Published var podcastLibraryPath: String? {
        didSet { UserDefaults.standard.set(podcastLibraryPath, forKey: "podcastLibraryPath") }
    }

    @Published var lastIPodMountpoint: String? {
        didSet { UserDefaults.standard.set(lastIPodMountpoint, forKey: "lastIPodMountpoint") }
    }

    private init() {
        self.musicLibraryPath = UserDefaults.standard.string(forKey: "musicLibraryPath")
        self.podcastLibraryPath = UserDefaults.standard.string(forKey: "podcastLibraryPath")
        self.lastIPodMountpoint = UserDefaults.standard.string(forKey: "lastIPodMountpoint")
    }
}
