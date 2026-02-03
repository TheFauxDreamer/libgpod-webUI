import SwiftUI

struct TracksTableView: View {
    @ObservedObject var viewModel: LibraryViewModel
    @ObservedObject var ipodVM: IPodViewModel
    let searchText: String
    @State private var sortOrder = [KeyPathComparator(\Track.artist)]

    var filteredTracks: [Track] {
        var tracks = viewModel.tracks
        if !searchText.isEmpty {
            tracks = tracks.filter { track in
                (track.title?.localizedCaseInsensitiveContains(searchText) ?? false) ||
                (track.artist?.localizedCaseInsensitiveContains(searchText) ?? false) ||
                (track.album?.localizedCaseInsensitiveContains(searchText) ?? false)
            }
        }
        return tracks
    }

    var body: some View {
        if viewModel.isLoading {
            ProgressView("Loading tracks...")
        } else if filteredTracks.isEmpty {
            ContentUnavailableView(
                "No Tracks",
                systemImage: "music.note",
                description: Text("Configure your music library in Settings to see tracks here.")
            )
        } else {
            Table(filteredTracks, selection: $viewModel.selectedTrackIds, sortOrder: $sortOrder) {
                TableColumn("#") { track in
                    Text(track.trackNumber.map { "\($0)" } ?? "")
                }
                .width(40)

                TableColumn("Title", value: \.displayTitle)

                TableColumn("Artist", value: \.displayArtist)

                TableColumn("Album", value: \.displayAlbum)

                TableColumn("Genre") { track in
                    Text(track.genre ?? "")
                }
                .width(100)

                TableColumn("Duration") { track in
                    Text(track.formattedDuration)
                }
                .width(60)
            }
            .contextMenu(forSelectionType: Int.self) { selection in
                if !selection.isEmpty {
                    Button("Add to iPod") {
                        Task {
                            await addSelectedTracks(selection, to: nil)
                        }
                    }

                    if ipodVM.isConnected && !ipodVM.playlists.filter({ !$0.isMaster }).isEmpty {
                        Divider()

                        Menu("Add to Playlist") {
                            ForEach(ipodVM.playlists.filter { !$0.isMaster && !$0.isPodcast }) { playlist in
                                Button(playlist.displayName) {
                                    Task {
                                        await addSelectedTracks(selection, to: playlist.id)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func addSelectedTracks(_ trackIds: Set<Int>, to playlistId: Int?) async {
        let tracks = filteredTracks.filter { trackIds.contains($0.id) }
        let paths = tracks.map { $0.filePath }
        try? await ipodVM.addTracks(paths, to: playlistId)
    }
}

#Preview {
    TracksTableView(viewModel: LibraryViewModel(), ipodVM: IPodViewModel(), searchText: "")
}
