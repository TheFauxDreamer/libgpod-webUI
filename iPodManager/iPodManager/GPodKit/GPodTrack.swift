import Foundation

/// Swift wrapper for libgpod's Itdb_Track structure
/// This class provides safe access to track metadata and operations
class GPodTrack {
    // Placeholder for actual Itdb_Track* pointer
    // private var track: UnsafeMutablePointer<Itdb_Track>?

    // Cached values extracted from the C struct
    private var _id: UInt32 = 0
    private var _title: String?
    private var _artist: String?
    private var _album: String?
    private var _albumArtist: String?
    private var _genre: String?
    private var _comment: String?
    private var _composer: String?
    private var _trackNumber: Int = 0
    private var _trackTotal: Int = 0
    private var _discNumber: Int = 0
    private var _discTotal: Int = 0
    private var _year: Int = 0
    private var _durationMs: Int = 0
    private var _bitrate: Int = 0
    private var _sampleRate: Int = 0
    private var _playcount: Int = 0
    private var _rating: Int = 0
    private var _fileSize: UInt64 = 0
    private var _ipodPath: String?

    // MARK: - Properties

    var id: UInt32 { _id }
    var title: String? { _title }
    var artist: String? { _artist }
    var album: String? { _album }
    var albumArtist: String? { _albumArtist }
    var genre: String? { _genre }
    var comment: String? { _comment }
    var composer: String? { _composer }
    var trackNumber: Int { _trackNumber }
    var trackTotal: Int { _trackTotal }
    var discNumber: Int { _discNumber }
    var discTotal: Int { _discTotal }
    var year: Int { _year }
    var durationMs: Int { _durationMs }
    var bitrate: Int { _bitrate }
    var sampleRate: Int { _sampleRate }
    var playcount: Int { _playcount }
    var rating: Int { _rating }
    var fileSize: UInt64 { _fileSize }
    var ipodPath: String? { _ipodPath }

    // MARK: - Initialization

    /// Initialize from a C Itdb_Track pointer
    /// init(pointer: UnsafeMutablePointer<Itdb_Track>) {
    ///     self.track = pointer
    ///     extractValues()
    /// }

    /// Initialize with values (for development without libgpod)
    init(
        id: UInt32,
        title: String?,
        artist: String?,
        album: String?,
        albumArtist: String? = nil,
        genre: String? = nil,
        trackNumber: Int = 0,
        discNumber: Int = 0,
        year: Int = 0,
        durationMs: Int = 0,
        bitrate: Int = 0,
        playcount: Int = 0,
        rating: Int = 0,
        ipodPath: String? = nil
    ) {
        self._id = id
        self._title = title
        self._artist = artist
        self._album = album
        self._albumArtist = albumArtist
        self._genre = genre
        self._trackNumber = trackNumber
        self._discNumber = discNumber
        self._year = year
        self._durationMs = durationMs
        self._bitrate = bitrate
        self._playcount = playcount
        self._rating = rating
        self._ipodPath = ipodPath
    }

    // MARK: - Value Extraction (for when libgpod is linked)

    /// Extract values from the C struct into Swift properties
    /// This is called once during initialization to cache all values
    private func extractValues() {
        // TODO: When libgpod is linked:
        // guard let track = track else { return }
        //
        // _id = track.pointee.id
        // _title = String(gchar: track.pointee.title)
        // _artist = String(gchar: track.pointee.artist)
        // _album = String(gchar: track.pointee.album)
        // _albumArtist = String(gchar: track.pointee.albumartist)
        // _genre = String(gchar: track.pointee.genre)
        // _comment = String(gchar: track.pointee.comment)
        // _composer = String(gchar: track.pointee.composer)
        // _trackNumber = Int(track.pointee.track_nr)
        // _trackTotal = Int(track.pointee.tracks)
        // _discNumber = Int(track.pointee.cd_nr)
        // _discTotal = Int(track.pointee.cds)
        // _year = Int(track.pointee.year)
        // _durationMs = Int(track.pointee.tracklen)
        // _bitrate = Int(track.pointee.bitrate)
        // _sampleRate = Int(track.pointee.samplerate)
        // _playcount = Int(track.pointee.playcount)
        // _rating = Int(track.pointee.rating) / 20  // Convert 0-100 to 0-5 stars
        // _fileSize = track.pointee.size
        // _ipodPath = String(gchar: track.pointee.ipod_path)
    }

    // MARK: - Conversion

    /// Convert to the app's Track model
    func toTrack() -> Track {
        return Track(
            id: Int(_id),
            filePath: ipodPath ?? "",
            sha1Hash: nil,
            title: title,
            artist: artist,
            album: album,
            albumArtist: albumArtist,
            genre: genre,
            trackNumber: trackNumber > 0 ? trackNumber : nil,
            discNumber: discNumber > 0 ? discNumber : nil,
            year: year > 0 ? year : nil,
            durationMs: durationMs > 0 ? durationMs : nil,
            bitrate: bitrate > 0 ? bitrate : nil,
            hasArtwork: false, // TODO: Check track->artwork
            artworkHash: nil,
            isPodcast: false, // TODO: Check mediatype flag
            playcount: playcount,
            rating: rating
        )
    }

    // MARK: - Setters (for modifying track metadata)

    /// Set the track title
    func setTitle(_ value: String) {
        _title = value
        // TODO: When libgpod is linked:
        // g_free(track?.pointee.title)
        // track?.pointee.title = g_strdup(value)
    }

    /// Set the artist
    func setArtist(_ value: String) {
        _artist = value
        // TODO: g_free + g_strdup
    }

    /// Set the album
    func setAlbum(_ value: String) {
        _album = value
        // TODO: g_free + g_strdup
    }

    /// Mark this track as a podcast
    func setAsPodcast() {
        // TODO: When libgpod is linked:
        // track?.pointee.mediatype = ITDB_MEDIATYPE_PODCAST
        // track?.pointee.flag4 = 1  // Skip when shuffling
        // track?.pointee.remember_playback_position = 1
    }
}
