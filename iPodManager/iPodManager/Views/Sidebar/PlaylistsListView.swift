import SwiftUI

struct PlaylistsListView: View {
    @ObservedObject var ipodVM: IPodViewModel

    var body: some View {
        ForEach(ipodVM.playlists) { playlist in
            HStack {
                Image(systemName: playlist.systemImage)
                    .foregroundColor(.secondary)
                Text(playlist.displayName)
                Spacer()
                Text("\(playlist.trackCount)")
                    .foregroundColor(.secondary)
                    .font(.caption)
            }
            .contentShape(Rectangle())
            .onTapGesture {
                ipodVM.selectedPlaylistId = playlist.id
            }
            .background(
                ipodVM.selectedPlaylistId == playlist.id
                    ? Color.accentColor.opacity(0.2)
                    : Color.clear
            )
            .cornerRadius(4)
            .contextMenu {
                if !playlist.isMaster && !playlist.isPodcast {
                    Button("Delete Playlist", role: .destructive) {
                        Task {
                            try? await ipodVM.deletePlaylist(id: playlist.id)
                        }
                    }
                }
            }
        }
    }
}
