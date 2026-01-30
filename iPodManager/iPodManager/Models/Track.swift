import Foundation

struct Track: Identifiable, Hashable {
    let id: Int
    let filePath: String
    let sha1Hash: String?
    let title: String?
    let artist: String?
    let album: String?
    let albumArtist: String?
    let genre: String?
    let trackNumber: Int?
    let discNumber: Int?
    let year: Int?
    let durationMs: Int?
    let bitrate: Int?
    let hasArtwork: Bool
    let artworkHash: String?
    let isPodcast: Bool

    // iPod-specific fields
    var playcount: Int?
    var rating: Int?

    var formattedDuration: String {
        guard let ms = durationMs, ms > 0 else { return "0:00" }
        let totalSeconds = ms / 1000
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return "\(minutes):\(String(format: "%02d", seconds))"
    }

    var displayTitle: String {
        title ?? URL(fileURLWithPath: filePath).deletingPathExtension().lastPathComponent
    }

    var displayArtist: String {
        artist ?? "Unknown Artist"
    }

    var displayAlbum: String {
        album ?? "Unknown Album"
    }
}
