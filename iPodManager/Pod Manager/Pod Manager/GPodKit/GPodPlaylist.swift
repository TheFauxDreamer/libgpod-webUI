import Foundation

/// Swift wrapper for libgpod's Itdb_Playlist structure
class GPodPlaylist {
    // Placeholder for actual Itdb_Playlist* pointer
    // private var playlist: UnsafeMutablePointer<Itdb_Playlist>?

    private var _id: UInt64 = 0
    private var _name: String = ""
    private var _isSmart: Bool = false
    private var _isMaster: Bool = false
    private var _isPodcast: Bool = false
    private var _trackIds: [UInt32] = []

    // MARK: - Properties

    var id: UInt64 { _id }
    var name: String { _name }
    var isSmart: Bool { _isSmart }
    var isMaster: Bool { _isMaster }
    var isPodcast: Bool { _isPodcast }
    var trackCount: Int { _trackIds.count }
    var trackIds: [UInt32] { _trackIds }

    // MARK: - Initialization

    /// Initialize from a C Itdb_Playlist pointer
    /// init(pointer: UnsafeMutablePointer<Itdb_Playlist>) {
    ///     self.playlist = pointer
    ///     extractValues()
    /// }

    /// Initialize with values (for development without libgpod)
    init(
        id: UInt64,
        name: String,
        isSmart: Bool = false,
        isMaster: Bool = false,
        isPodcast: Bool = false,
        trackIds: [UInt32] = []
    ) {
        self._id = id
        self._name = name
        self._isSmart = isSmart
        self._isMaster = isMaster
        self._isPodcast = isPodcast
        self._trackIds = trackIds
    }

    // MARK: - Value Extraction

    private func extractValues() {
        // TODO: When libgpod is linked:
        // guard let playlist = playlist else { return }
        //
        // _id = playlist.pointee.id
        // _name = String(gchar: playlist.pointee.name) ?? ""
        // _isSmart = playlist.pointee.is_spl != 0
        // _isMaster = itdb_playlist_is_mpl(playlist) != 0
        // _isPodcast = itdb_playlist_is_podcasts(playlist) != 0
        //
        // // Extract track IDs from the playlist's tracks GList
        // let tracksList = GListSequence<UInt32>(
        //     list: playlist.pointee.members,
        //     transform: { ptr in
        //         let track = ptr.assumingMemoryBound(to: Itdb_Track.self)
        //         return track.pointee.id
        //     }
        // )
        // _trackIds = Array(tracksList)
    }

    // MARK: - Conversion

    /// Convert to the app's Playlist model
    func toPlaylist() -> Playlist {
        return Playlist(
            id: Int(_id),
            name: _name,
            isSmart: _isSmart,
            isMaster: _isMaster,
            isPodcast: _isPodcast,
            trackCount: _trackIds.count
        )
    }

    // MARK: - Track Management

    /// Add a track to this playlist
    func addTrack(_ trackId: UInt32) {
        _trackIds.append(trackId)
        // TODO: When libgpod is linked:
        // Find the track by ID and call itdb_playlist_add_track(playlist, track, -1)
    }

    /// Remove a track from this playlist
    func removeTrack(_ trackId: UInt32) {
        _trackIds.removeAll { $0 == trackId }
        // TODO: When libgpod is linked:
        // Find the track and call itdb_playlist_remove_track(playlist, track)
    }

    /// Check if this playlist contains a track
    func containsTrack(_ trackId: UInt32) -> Bool {
        return _trackIds.contains(trackId)
    }

    // MARK: - Modification

    /// Rename this playlist
    func rename(to newName: String) {
        _name = newName
        // TODO: When libgpod is linked:
        // g_free(playlist?.pointee.name)
        // playlist?.pointee.name = g_strdup(newName)
    }
}
