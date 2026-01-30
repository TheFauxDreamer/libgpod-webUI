import Foundation

struct Playlist: Identifiable, Hashable {
    let id: Int
    let name: String
    let isSmart: Bool
    let isMaster: Bool
    let isPodcast: Bool
    let trackCount: Int

    var displayName: String {
        if isMaster { return "All Tracks" }
        if isPodcast { return "Podcasts" }
        return name
    }

    var systemImage: String {
        if isMaster { return "music.note.list" }
        if isPodcast { return "mic.fill" }
        if isSmart { return "wand.and.stars" }
        return "music.note"
    }
}

struct IPodDevice: Identifiable, Hashable {
    var id: String { mountpoint }

    let mountpoint: String
    let name: String?

    var displayName: String {
        name ?? URL(fileURLWithPath: mountpoint).lastPathComponent
    }
}
