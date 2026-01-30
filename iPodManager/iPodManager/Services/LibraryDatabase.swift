import Foundation
import SQLite3

// SQLITE_TRANSIENT constant for Swift
private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

class LibraryDatabase {
    static let shared = LibraryDatabase()

    private var db: OpaquePointer?
    private let dbPath: String

    private init() {
        // Store database in Application Support
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let appFolder = appSupport.appendingPathComponent("PodManager", isDirectory: true)

        // Create app folder if needed
        try? FileManager.default.createDirectory(at: appFolder, withIntermediateDirectories: true)

        dbPath = appFolder.appendingPathComponent("library.db").path
        print("LibraryDatabase: Opening database at \(dbPath)")
        openDatabase()
        createTables()
    }

    deinit {
        sqlite3_close(db)
    }

    private func openDatabase() {
        if sqlite3_open(dbPath, &db) != SQLITE_OK {
            print("LibraryDatabase: Failed to open database at \(dbPath)")
        } else {
            print("LibraryDatabase: Database opened successfully")
        }
    }

    private func createTables() {
        let schema = """
        CREATE TABLE IF NOT EXISTS library_tracks (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path    TEXT UNIQUE NOT NULL,
            file_mtime   REAL NOT NULL,
            sha1_hash    TEXT,
            title        TEXT,
            artist       TEXT,
            album        TEXT,
            album_artist TEXT,
            genre        TEXT,
            duration_ms  INTEGER,
            track_number INTEGER,
            disc_number  INTEGER,
            year         INTEGER,
            bitrate      INTEGER,
            has_artwork  INTEGER DEFAULT 0,
            artwork_hash TEXT,
            is_podcast   INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_sha1 ON library_tracks(sha1_hash);
        CREATE INDEX IF NOT EXISTS idx_album ON library_tracks(album);
        CREATE INDEX IF NOT EXISTS idx_artist ON library_tracks(artist);
        CREATE INDEX IF NOT EXISTS idx_is_podcast ON library_tracks(is_podcast);
        """

        if sqlite3_exec(db, schema, nil, nil, nil) != SQLITE_OK {
            let error = String(cString: sqlite3_errmsg(db))
            print("LibraryDatabase: Failed to create tables: \(error)")
        }
    }

    // MARK: - Save Tracks

    func saveTracks(_ tracks: [Track], isPodcast: Bool = false) {
        print("LibraryDatabase: Saving \(tracks.count) tracks (isPodcast: \(isPodcast))")

        guard !tracks.isEmpty else {
            print("LibraryDatabase: No tracks to save")
            return
        }

        let insertSQL = """
        INSERT OR REPLACE INTO library_tracks
        (file_path, file_mtime, sha1_hash, title, artist, album, album_artist, genre,
         duration_ms, track_number, disc_number, year, bitrate, has_artwork, artwork_hash, is_podcast)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """

        var statement: OpaquePointer?

        guard sqlite3_prepare_v2(db, insertSQL, -1, &statement, nil) == SQLITE_OK else {
            let error = String(cString: sqlite3_errmsg(db))
            print("LibraryDatabase: Failed to prepare insert statement: \(error)")
            return
        }

        defer { sqlite3_finalize(statement) }

        // Use transaction for better performance
        sqlite3_exec(db, "BEGIN TRANSACTION", nil, nil, nil)

        var savedCount = 0
        for track in tracks {
            sqlite3_reset(statement)
            sqlite3_clear_bindings(statement)

            // Get file modification time
            let mtime = (try? FileManager.default.attributesOfItem(atPath: track.filePath)[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0

            // Bind all values
            sqlite3_bind_text(statement, 1, (track.filePath as NSString).utf8String, -1, SQLITE_TRANSIENT)
            sqlite3_bind_double(statement, 2, mtime)
            bindText(statement, 3, track.sha1Hash)
            bindText(statement, 4, track.title)
            bindText(statement, 5, track.artist)
            bindText(statement, 6, track.album)
            bindText(statement, 7, track.albumArtist)
            bindText(statement, 8, track.genre)
            bindInt(statement, 9, track.durationMs)
            bindInt(statement, 10, track.trackNumber)
            bindInt(statement, 11, track.discNumber)
            bindInt(statement, 12, track.year)
            bindInt(statement, 13, track.bitrate)
            sqlite3_bind_int(statement, 14, track.hasArtwork ? 1 : 0)
            bindText(statement, 15, track.artworkHash)
            sqlite3_bind_int(statement, 16, isPodcast ? 1 : 0)

            if sqlite3_step(statement) == SQLITE_DONE {
                savedCount += 1
            } else {
                let error = String(cString: sqlite3_errmsg(db))
                print("LibraryDatabase: Failed to insert track '\(track.title ?? track.filePath)': \(error)")
            }
        }

        sqlite3_exec(db, "COMMIT", nil, nil, nil)
        print("LibraryDatabase: Saved \(savedCount) of \(tracks.count) tracks")
    }

    private func bindText(_ statement: OpaquePointer?, _ index: Int32, _ value: String?) {
        if let value = value {
            sqlite3_bind_text(statement, index, (value as NSString).utf8String, -1, SQLITE_TRANSIENT)
        } else {
            sqlite3_bind_null(statement, index)
        }
    }

    private func bindInt(_ statement: OpaquePointer?, _ index: Int32, _ value: Int?) {
        if let value = value {
            sqlite3_bind_int(statement, index, Int32(value))
        } else {
            sqlite3_bind_null(statement, index)
        }
    }

    // MARK: - Load Tracks

    func loadTracks(isPodcast: Bool = false) -> [Track] {
        let query = "SELECT * FROM library_tracks WHERE is_podcast = ? ORDER BY album, disc_number, track_number, title"
        var statement: OpaquePointer?

        guard sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK else {
            let error = String(cString: sqlite3_errmsg(db))
            print("LibraryDatabase: Failed to prepare load query: \(error)")
            return []
        }

        defer { sqlite3_finalize(statement) }

        sqlite3_bind_int(statement, 1, isPodcast ? 1 : 0)

        var tracks: [Track] = []

        while sqlite3_step(statement) == SQLITE_ROW {
            let track = Track(
                id: Int(sqlite3_column_int(statement, 0)),
                filePath: String(cString: sqlite3_column_text(statement, 1)),
                sha1Hash: columnText(statement, 3),
                title: columnText(statement, 4),
                artist: columnText(statement, 5),
                album: columnText(statement, 6),
                albumArtist: columnText(statement, 7),
                genre: columnText(statement, 8),
                trackNumber: columnInt(statement, 10),
                discNumber: columnInt(statement, 11),
                year: columnInt(statement, 12),
                durationMs: columnInt(statement, 9),
                bitrate: columnInt(statement, 13),
                hasArtwork: sqlite3_column_int(statement, 14) == 1,
                artworkHash: columnText(statement, 15),
                isPodcast: sqlite3_column_int(statement, 16) == 1
            )
            tracks.append(track)
        }

        print("LibraryDatabase: Loaded \(tracks.count) tracks (isPodcast: \(isPodcast))")
        return tracks
    }

    private func columnText(_ statement: OpaquePointer?, _ index: Int32) -> String? {
        guard let cString = sqlite3_column_text(statement, index) else { return nil }
        return String(cString: cString)
    }

    private func columnInt(_ statement: OpaquePointer?, _ index: Int32) -> Int? {
        if sqlite3_column_type(statement, index) == SQLITE_NULL {
            return nil
        }
        return Int(sqlite3_column_int(statement, index))
    }

    // MARK: - Load Albums

    func loadAlbums() -> [Album] {
        let query = """
        SELECT album, artist, album_artist, artwork_hash, COUNT(*) as track_count, MAX(year) as year
        FROM library_tracks
        WHERE is_podcast = 0 AND album IS NOT NULL AND album != ''
        GROUP BY COALESCE(album_artist, artist), album
        ORDER BY COALESCE(album_artist, artist), album
        """

        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK else {
            let error = String(cString: sqlite3_errmsg(db))
            print("LibraryDatabase: Failed to prepare albums query: \(error)")
            return []
        }

        defer { sqlite3_finalize(statement) }

        var albums: [Album] = []

        while sqlite3_step(statement) == SQLITE_ROW {
            let album = Album(
                album: columnText(statement, 0) ?? "Unknown Album",
                artist: columnText(statement, 1),
                albumArtist: columnText(statement, 2),
                artworkHash: columnText(statement, 3),
                trackCount: Int(sqlite3_column_int(statement, 4)),
                year: columnInt(statement, 5)
            )
            albums.append(album)
        }

        print("LibraryDatabase: Loaded \(albums.count) albums")
        return albums
    }

    // MARK: - Load Podcast Series

    func loadPodcastSeries() -> [PodcastSeries] {
        let query = """
        SELECT album, artwork_hash, COUNT(*) as episode_count
        FROM library_tracks
        WHERE is_podcast = 1
        GROUP BY album
        ORDER BY album
        """

        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK else {
            return []
        }

        defer { sqlite3_finalize(statement) }

        var series: [PodcastSeries] = []

        while sqlite3_step(statement) == SQLITE_ROW {
            let podcast = PodcastSeries(
                seriesName: columnText(statement, 0) ?? "Unknown Series",
                artworkHash: columnText(statement, 1),
                episodeCount: Int(sqlite3_column_int(statement, 2))
            )
            series.append(podcast)
        }

        print("LibraryDatabase: Loaded \(series.count) podcast series")
        return series
    }

    // MARK: - Utility

    func clearLibrary(isPodcast: Bool = false) {
        let sql = "DELETE FROM library_tracks WHERE is_podcast = ?"
        var statement: OpaquePointer?

        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            sqlite3_bind_int(statement, 1, isPodcast ? 1 : 0)
            sqlite3_step(statement)
            sqlite3_finalize(statement)
        }
    }

    func trackCount(isPodcast: Bool = false) -> Int {
        let sql = "SELECT COUNT(*) FROM library_tracks WHERE is_podcast = ?"
        var statement: OpaquePointer?

        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else {
            return 0
        }

        defer { sqlite3_finalize(statement) }

        sqlite3_bind_int(statement, 1, isPodcast ? 1 : 0)

        if sqlite3_step(statement) == SQLITE_ROW {
            return Int(sqlite3_column_int(statement, 0))
        }

        return 0
    }
}
