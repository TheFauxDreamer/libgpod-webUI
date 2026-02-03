import SwiftUI

struct PlaylistsListView: View {
    @ObservedObject var ipodVM: IPodViewModel
    @State private var playlistToRename: Playlist? = nil
    @State private var renameText: String = ""

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
                    Button("Rename...") {
                        renameText = playlist.name
                        playlistToRename = playlist
                    }

                    Divider()

                    Button("Delete Playlist", role: .destructive) {
                        Task {
                            try? await ipodVM.deletePlaylist(id: playlist.id)
                        }
                    }
                }
            }
        }
        .sheet(item: $playlistToRename) { playlist in
            RenamePlaylistSheet(
                playlistName: $renameText,
                onRename: {
                    Task {
                        try? await ipodVM.renamePlaylist(id: playlist.id, newName: renameText)
                    }
                    playlistToRename = nil
                },
                onCancel: {
                    playlistToRename = nil
                }
            )
        }
    }
}

// MARK: - Rename Playlist Sheet

struct RenamePlaylistSheet: View {
    @Binding var playlistName: String
    let onRename: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Text("Rename Playlist")
                .font(.headline)

            TextField("Playlist Name", text: $playlistName)
                .textFieldStyle(.roundedBorder)
                .frame(width: 250)

            HStack(spacing: 12) {
                Button("Cancel") {
                    onCancel()
                }
                .keyboardShortcut(.cancelAction)

                Button("Rename") {
                    onRename()
                }
                .keyboardShortcut(.defaultAction)
                .disabled(playlistName.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(24)
        .frame(minWidth: 300)
    }
}
