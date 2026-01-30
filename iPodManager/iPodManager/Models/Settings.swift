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

    // Security-scoped bookmarks for persistent folder access
    private var musicLibraryBookmark: Data? {
        didSet { UserDefaults.standard.set(musicLibraryBookmark, forKey: "musicLibraryBookmark") }
    }

    private var podcastLibraryBookmark: Data? {
        didSet { UserDefaults.standard.set(podcastLibraryBookmark, forKey: "podcastLibraryBookmark") }
    }

    private init() {
        self.musicLibraryPath = UserDefaults.standard.string(forKey: "musicLibraryPath")
        self.podcastLibraryPath = UserDefaults.standard.string(forKey: "podcastLibraryPath")
        self.lastIPodMountpoint = UserDefaults.standard.string(forKey: "lastIPodMountpoint")
        self.musicLibraryBookmark = UserDefaults.standard.data(forKey: "musicLibraryBookmark")
        self.podcastLibraryBookmark = UserDefaults.standard.data(forKey: "podcastLibraryBookmark")
    }

    // MARK: - Music Library Bookmark

    func saveMusicLibraryBookmark(from url: URL) {
        do {
            let bookmark = try url.bookmarkData(
                options: .withSecurityScope,
                includingResourceValuesForKeys: nil,
                relativeTo: nil
            )
            musicLibraryBookmark = bookmark
            musicLibraryPath = url.path
        } catch {
            print("Failed to create music library bookmark: \(error)")
            musicLibraryPath = url.path
        }
    }

    func resolveMusicLibraryURL() -> URL? {
        // First try to resolve from bookmark
        if let bookmark = musicLibraryBookmark {
            var isStale = false
            do {
                let url = try URL(
                    resolvingBookmarkData: bookmark,
                    options: .withSecurityScope,
                    relativeTo: nil,
                    bookmarkDataIsStale: &isStale
                )
                if isStale {
                    // Refresh the bookmark
                    saveMusicLibraryBookmark(from: url)
                }
                return url
            } catch {
                print("Failed to resolve music library bookmark: \(error)")
            }
        }

        // Fallback to path (may not have access)
        if let path = musicLibraryPath {
            return URL(fileURLWithPath: path)
        }

        return nil
    }

    // MARK: - Podcast Library Bookmark

    func savePodcastLibraryBookmark(from url: URL) {
        do {
            let bookmark = try url.bookmarkData(
                options: .withSecurityScope,
                includingResourceValuesForKeys: nil,
                relativeTo: nil
            )
            podcastLibraryBookmark = bookmark
            podcastLibraryPath = url.path
        } catch {
            print("Failed to create podcast library bookmark: \(error)")
            podcastLibraryPath = url.path
        }
    }

    func resolvePodcastLibraryURL() -> URL? {
        if let bookmark = podcastLibraryBookmark {
            var isStale = false
            do {
                let url = try URL(
                    resolvingBookmarkData: bookmark,
                    options: .withSecurityScope,
                    relativeTo: nil,
                    bookmarkDataIsStale: &isStale
                )
                if isStale {
                    savePodcastLibraryBookmark(from: url)
                }
                return url
            } catch {
                print("Failed to resolve podcast library bookmark: \(error)")
            }
        }

        if let path = podcastLibraryPath {
            return URL(fileURLWithPath: path)
        }

        return nil
    }
}
