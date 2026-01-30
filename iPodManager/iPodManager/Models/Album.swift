import Foundation

struct Album: Identifiable, Hashable {
    var id: String { "\(album)-\(albumArtist ?? artist ?? "")" }

    let album: String
    let artist: String?
    let albumArtist: String?
    let artworkHash: String?
    let trackCount: Int
    let year: Int?

    var displayArtist: String {
        albumArtist ?? artist ?? "Unknown Artist"
    }
}

struct PodcastSeries: Identifiable, Hashable {
    var id: String { seriesName }

    let seriesName: String
    let artworkHash: String?
    let episodeCount: Int

    var displayName: String {
        seriesName.isEmpty ? "Unknown Series" : seriesName
    }
}
