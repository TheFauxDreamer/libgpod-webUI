import Foundation

/// Errors that can occur during iPod database operations
enum GPodError: Error, LocalizedError {
    case failedToOpen(String)
    case failedToSave(String)
    case failedToAddTrack(String)
    case notConnected
    case invalidMountpoint

    var errorDescription: String? {
        switch self {
        case .failedToOpen(let msg): return "Failed to open iPod database: \(msg)"
        case .failedToSave(let msg): return "Failed to save iPod database: \(msg)"
        case .failedToAddTrack(let msg): return "Failed to add track: \(msg)"
        case .notConnected: return "No iPod connected"
        case .invalidMountpoint: return "Invalid iPod mountpoint"
        }
    }
}

/// Swift wrapper for libgpod's Itdb_iTunesDB
class GPodDatabase {
    // Note: These will be actual C pointers when libgpod is linked
    // For now, we use placeholder types for development

    private var mountpoint: String
    private var _tracks: [Track] = []
    private var _playlists: [Playlist] = []

    // Placeholder for actual Itdb_iTunesDB* pointer
    // private var itdb: OpaquePointer?

    /// The device name (e.g., "Paul's iPod")
    private(set) var deviceName: String?

    /// All tracks in the database
    var tracks: [Track] { _tracks }

    /// All playlists in the database
    var playlists: [Playlist] { _playlists }

    /// Initialize and open an iPod database at the given mountpoint
    init(mountpoint: String) throws {
        self.mountpoint = mountpoint

        // Verify the mountpoint has an iPod_Control directory
        let ipodControlPath = URL(fileURLWithPath: mountpoint)
            .appendingPathComponent("iPod_Control")

        guard FileManager.default.fileExists(atPath: ipodControlPath.path) else {
            throw GPodError.invalidMountpoint
        }

        // TODO: When libgpod is linked, this becomes:
        // var error: UnsafeMutablePointer<GError>? = nil
        // itdb = itdb_parse(mountpoint, &error)
        // if itdb == nil {
        //     let message = error?.pointee.message.map { String(cString: $0) } ?? "Unknown error"
        //     g_error_free(error)
        //     throw GPodError.failedToOpen(message)
        // }

        // Load device name
        loadDeviceInfo()

        // Load tracks and playlists
        try loadContent()
    }

    deinit {
        // TODO: When libgpod is linked:
        // if let itdb = itdb {
        //     itdb_free(itdb)
        // }
    }

    // MARK: - Loading Content

    private func loadDeviceInfo() {
        // Read device name from SysInfoExtended
        let sysInfoPath = URL(fileURLWithPath: mountpoint)
            .appendingPathComponent("iPod_Control")
            .appendingPathComponent("Device")
            .appendingPathComponent("SysInfoExtended")

        if let data = try? Data(contentsOf: sysInfoPath),
           let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any] {
            deviceName = plist["UserVisibleName"] as? String
        }
    }

    private func loadContent() throws {
        // TODO: When libgpod is linked, iterate through itdb->tracks and itdb->playlists
        // using GListSequence

        // Example of how it will work:
        // let tracksList = GListSequence<GPodTrack>(
        //     list: itdb?.pointee.tracks,
        //     transform: { GPodTrack(pointer: $0.assumingMemoryBound(to: Itdb_Track.self)) }
        // )
        // _tracks = tracksList.compactMap { $0.toTrack() }

        // For now, create empty arrays
        _tracks = []
        _playlists = []
    }

    // MARK: - Playlist Operations

    /// Create a new playlist
    func createPlaylist(name: String) throws -> Playlist {
        // TODO: When libgpod is linked:
        // let playlist = itdb_playlist_new(name, false)
        // itdb_playlist_add(itdb, playlist, -1)

        let newPlaylist = Playlist(
            id: _playlists.count + 1,
            name: name,
            isSmart: false,
            isMaster: false,
            isPodcast: false,
            trackCount: 0
        )
        _playlists.append(newPlaylist)
        return newPlaylist
    }

    /// Delete a playlist by ID
    func deletePlaylist(id: Int) throws {
        // TODO: When libgpod is linked:
        // Find the playlist and call itdb_playlist_remove(playlist)

        _playlists.removeAll { $0.id == id }
    }

    // MARK: - Track Operations

    /// Add a track from a local file to the iPod
    func addTrack(from filePath: String, to playlistId: Int?) throws {
        // TODO: When libgpod is linked:
        // 1. Create new track: itdb_track_new()
        // 2. Set metadata from file
        // 3. Add to database: itdb_track_add(itdb, track, -1)
        // 4. Copy file: itdb_cp_track_to_ipod(track, filePath, &error)
        // 5. Optionally add to playlist

        print("Would add track: \(filePath) to playlist \(playlistId ?? -1)")
    }

    /// Remove a track from the iPod
    func removeTrack(id: Int) throws {
        // TODO: When libgpod is linked:
        // Find track and call itdb_track_remove(track)

        _tracks.removeAll { $0.id == id }
    }

    // MARK: - Sync Operations

    /// Copy all delayed (queued) files to the iPod
    func copyDelayedFiles() throws {
        // TODO: When libgpod is linked:
        // itdb_copy_delayed_files(itdb, &error)

        print("Would copy delayed files")
    }

    /// Save the database to the iPod
    func save() throws {
        // TODO: When libgpod is linked:
        // var error: UnsafeMutablePointer<GError>? = nil
        // let success = itdb_write(itdb, &error)
        // if success == 0 {
        //     let message = error?.pointee.message.map { String(cString: $0) } ?? "Unknown error"
        //     g_error_free(error)
        //     throw GPodError.failedToSave(message)
        // }

        print("Would save database to \(mountpoint)")
    }
}
