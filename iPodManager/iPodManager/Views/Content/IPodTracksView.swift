import SwiftUI

struct IPodTracksView: View {
    @ObservedObject var viewModel: IPodViewModel

    var displayedTracks: [Track] {
        // TODO: Filter by selected playlist
        viewModel.tracks
    }

    var body: some View {
        if !viewModel.isConnected {
            ContentUnavailableView(
                "No iPod Connected",
                systemImage: "ipod",
                description: Text("Connect an iPod to view its contents.")
            )
        } else if viewModel.tracks.isEmpty {
            ContentUnavailableView(
                "iPod is Empty",
                systemImage: "music.note",
                description: Text("Add tracks from your library to get started.")
            )
        } else {
            Table(displayedTracks) {
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

                TableColumn("Plays") { track in
                    Text(track.playcount.map { "\($0)" } ?? "0")
                }
                .width(50)
            }
        }
    }
}

#Preview {
    IPodTracksView(viewModel: IPodViewModel())
}
