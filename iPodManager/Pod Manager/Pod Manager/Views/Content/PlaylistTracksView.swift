import SwiftUI

struct PlaylistTracksView: View {
    @ObservedObject var viewModel: IPodViewModel
    let playlistId: Int

    var playlist: Playlist? {
        viewModel.playlists.first { $0.id == playlistId }
    }

    var tracks: [Track] {
        viewModel.getPlaylistTracks(playlistId: playlistId)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header with playlist info
            HStack {
                Image(systemName: playlist?.systemImage ?? "music.note")
                    .font(.title2)
                    .foregroundColor(.secondary)

                VStack(alignment: .leading) {
                    Text(playlist?.displayName ?? "Playlist")
                        .font(.title2)
                        .fontWeight(.semibold)

                    Text("\(tracks.count) tracks")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Button {
                    viewModel.selectedPlaylistId = nil
                } label: {
                    Label("Back", systemImage: "chevron.left")
                }
                .buttonStyle(.plain)
            }
            .padding()

            Divider()

            // Track list
            if tracks.isEmpty {
                ContentUnavailableView(
                    "No Tracks",
                    systemImage: "music.note",
                    description: Text("This playlist is empty. Drag tracks here to add them.")
                )
            } else {
                Table(tracks) {
                    TableColumn("#") { track in
                        Text(track.trackNumber.map { "\($0)" } ?? "")
                    }
                    .width(40)

                    TableColumn("Title", value: \.displayTitle)

                    TableColumn("Artist", value: \.displayArtist)

                    TableColumn("Album", value: \.displayAlbum)

                    TableColumn("Duration") { track in
                        Text(track.formattedDuration)
                    }
                    .width(60)
                }
            }
        }
    }
}

#Preview {
    PlaylistTracksView(viewModel: IPodViewModel(), playlistId: 1)
}
