import SwiftUI
import Combine

@MainActor
class IPodViewModel: ObservableObject {
    @Published var isConnected = false
    @Published var mountpoint: String? = nil
    @Published var deviceName: String? = nil
    @Published var detectedDevices: [IPodDevice] = []
    @Published var playlists: [Playlist] = []
    @Published var tracks: [Track] = []
    @Published var selectedPlaylistId: Int? = nil
    @Published var isSyncing = false
    @Published var syncProgress: SyncProgress? = nil

    private var database: GPodDatabase? = nil

    struct SyncProgress {
        let copied: Int
        let total: Int
        let currentTrack: String
    }

    func detectDevices() async {
        // Scan /Volumes for iPod_Control directories
        detectedDevices = IPodDetector.detect()
    }

    func connect(to mountpoint: String) async throws {
        self.mountpoint = mountpoint

        // Open the iPod database using GPodKit
        database = try GPodDatabase(mountpoint: mountpoint)

        // Load tracks and playlists
        if let db = database {
            tracks = db.tracks
            playlists = db.playlists
            deviceName = db.deviceName
        }

        isConnected = true
    }

    func disconnect() async {
        // Save and close the database
        try? database?.save()
        database = nil

        isConnected = false
        mountpoint = nil
        deviceName = nil
        tracks = []
        playlists = []
        selectedPlaylistId = nil
    }

    func createPlaylist(name: String) async throws {
        guard let db = database else { return }
        let playlist = try db.createPlaylist(name: name)
        playlists.append(playlist)
    }

    func deletePlaylist(id: Int) async throws {
        guard let db = database else { return }
        try db.deletePlaylist(id: id)
        playlists.removeAll { $0.id == id }
    }

    func addTracks(_ trackPaths: [String], to playlistId: Int?) async throws {
        guard let db = database else { return }

        isSyncing = true
        defer { isSyncing = false }

        for (index, path) in trackPaths.enumerated() {
            syncProgress = SyncProgress(
                copied: index,
                total: trackPaths.count,
                currentTrack: URL(fileURLWithPath: path).lastPathComponent
            )

            try db.addTrack(from: path, to: playlistId)
        }

        syncProgress = nil
    }

    func sync() async throws {
        guard let db = database else { return }

        isSyncing = true
        defer { isSyncing = false }

        try db.copyDelayedFiles()
        try db.save()

        // Reload tracks
        tracks = db.tracks
    }
}
