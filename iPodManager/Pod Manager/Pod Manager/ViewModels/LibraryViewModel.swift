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

    enum SortOrder: String, CaseIterable {
        case artist = "Artist"
        case album = "Album"
        case title = "Title"
        case year = "Year"
    }

    func loadAlbums() async {
        isLoading = true
        defer { isLoading = false }

        // TODO: Load from LibraryScanner service
        // For now, use placeholder data
        albums = []
    }

    func loadTracks(album: String? = nil) async {
        isLoading = true
        defer { isLoading = false }

        filterAlbum = album
        // TODO: Load from LibraryScanner service
        tracks = []
    }

    func loadPodcasts() async {
        isLoading = true
        defer { isLoading = false }

        // TODO: Load from LibraryScanner service
        podcastSeries = []
    }

    func scanLibrary(path: String) async {
        isLoading = true
        defer { isLoading = false }

        // TODO: Implement library scanning with AVFoundation
    }

    func addTracksToIPod(_ trackIds: [Int], playlistId: Int? = nil) async {
        // TODO: Implement via GPodKit
    }
}
