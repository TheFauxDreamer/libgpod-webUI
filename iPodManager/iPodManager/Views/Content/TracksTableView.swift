import SwiftUI

struct TracksTableView: View {
    @ObservedObject var viewModel: LibraryViewModel
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
                            await viewModel.addTracksToIPod(Array(selection))
                        }
                    }
                }
            }
        }
    }
}

#Preview {
    TracksTableView(viewModel: LibraryViewModel(), searchText: "")
}
