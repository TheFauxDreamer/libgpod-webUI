import SwiftUI
import Combine

@MainActor
class LibraryViewModel: ObservableObject {
    @Published var albums: [Album] = []
    @Published var tracks: [Track] = []
    @Published var podcastSeries: [PodcastSeries] = []
    @Published var selectedTrackIds: Set<Int> = []
    @Published var isLoading = false
    @Published var sortOrder: SortOrder = .artist
    @Published var filterAlbum: String? = nil

    private var cancellables = Set<AnyCancellable>()

    enum SortOrder: String, CaseIterable {
        case artist = "Artist"
        case album = "Album"
        case title = "Title"
        case year = "Year"
    }

    init() {
        // Listen for library updates
        NotificationCenter.default.publisher(for: .libraryDidUpdate)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                Task {
                    await self?.refresh()
                }
            }
            .store(in: &cancellables)

        // Load initial data
        Task {
            await refresh()
        }
    }

    func refresh() async {
        await loadAlbums()
        await loadTracks()
        await loadPodcasts()
    }

    func loadAlbums() async {
        isLoading = true
        defer { isLoading = false }

        albums = LibraryDatabase.shared.loadAlbums()
        print("LibraryViewModel: Loaded \(albums.count) albums")
    }

    func loadTracks(album: String? = nil) async {
        isLoading = true
        defer { isLoading = false }

        filterAlbum = album

        var allTracks = LibraryDatabase.shared.loadTracks(isPodcast: false)

        if let album = album {
            allTracks = allTracks.filter { $0.album == album }
        }

        tracks = sortTracks(allTracks)
    }

    func loadPodcasts() async {
        isLoading = true
        defer { isLoading = false }

        podcastSeries = LibraryDatabase.shared.loadPodcastSeries()
    }

    func loadPodcastEpisodes(series: String) async -> [Track] {
        let allPodcasts = LibraryDatabase.shared.loadTracks(isPodcast: true)
        return allPodcasts.filter { $0.album == series }
    }

    private func sortTracks(_ tracks: [Track]) -> [Track] {
        switch sortOrder {
        case .artist:
            return tracks.sorted { ($0.artist ?? "") < ($1.artist ?? "") }
        case .album:
            return tracks.sorted {
                let album0 = $0.album ?? ""
                let album1 = $1.album ?? ""
                if album0 == album1 {
                    let disc0 = $0.discNumber ?? 0
                    let disc1 = $1.discNumber ?? 0
                    if disc0 == disc1 {
                        return ($0.trackNumber ?? 0) < ($1.trackNumber ?? 0)
                    }
                    return disc0 < disc1
                }
                return album0 < album1
            }
        case .title:
            return tracks.sorted { ($0.title ?? "") < ($1.title ?? "") }
        case .year:
            return tracks.sorted { ($0.year ?? 0) > ($1.year ?? 0) }
        }
    }

    func setSortOrder(_ order: SortOrder) async {
        sortOrder = order
        tracks = sortTracks(tracks)
    }

    // MARK: - Selection

    func selectTrack(_ trackId: Int) {
        if selectedTrackIds.contains(trackId) {
            selectedTrackIds.remove(trackId)
        } else {
            selectedTrackIds.insert(trackId)
        }
    }

    func selectAllTracks() {
        selectedTrackIds = Set(tracks.map { $0.id })
    }

    func clearSelection() {
        selectedTrackIds.removeAll()
    }

    var selectedTracks: [Track] {
        tracks.filter { selectedTrackIds.contains($0.id) }
    }

    // MARK: - iPod Integration

    func addTracksToIPod(_ trackIds: [Int], playlistId: Int? = nil) async {
        print("Adding \(trackIds.count) tracks to iPod")
    }

    func addSelectedTracksToIPod(playlistId: Int? = nil) async {
        await addTracksToIPod(Array(selectedTrackIds), playlistId: playlistId)
    }
}
