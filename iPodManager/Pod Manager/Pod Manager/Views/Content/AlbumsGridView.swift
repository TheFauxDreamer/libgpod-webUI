import SwiftUI

struct AlbumsGridView: View {
    @ObservedObject var viewModel: LibraryViewModel
    let searchText: String

    private let columns = [
        GridItem(.adaptive(minimum: 160, maximum: 200), spacing: 16)
    ]

    var filteredAlbums: [Album] {
        if searchText.isEmpty {
            return viewModel.albums
        }
        return viewModel.albums.filter { album in
            album.album.localizedCaseInsensitiveContains(searchText) ||
            (album.artist?.localizedCaseInsensitiveContains(searchText) ?? false)
        }
    }

    var body: some View {
        ScrollView {
            if viewModel.isLoading {
                ProgressView("Loading albums...")
                    .padding()
            } else if filteredAlbums.isEmpty {
                ContentUnavailableView(
                    "No Albums",
                    systemImage: "music.note.list",
                    description: Text("Configure your music library in Settings to see albums here.")
                )
            } else {
                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(filteredAlbums) { album in
                        AlbumCardView(album: album)
                            .onTapGesture {
                                Task {
                                    await viewModel.loadTracks(album: album.album)
                                }
                            }
                            .draggable(album.album) // Enable drag for adding to playlists
                    }
                }
                .padding()
            }
        }
    }
}

struct AlbumCardView: View {
    let album: Album

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Artwork
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.gray.opacity(0.2))

                if let hash = album.artworkHash {
                    AsyncImage(url: ArtworkCache.shared.artworkURL(for: hash)) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } placeholder: {
                        Image(systemName: "music.note")
                            .font(.system(size: 40))
                            .foregroundColor(.gray)
                    }
                } else {
                    Image(systemName: "music.note")
                        .font(.system(size: 40))
                        .foregroundColor(.gray)
                }
            }
            .frame(width: 160, height: 160)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            // Album info
            Text(album.album)
                .font(.headline)
                .lineLimit(1)

            Text(album.displayArtist)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .lineLimit(1)

            Text("\(album.trackCount) tracks")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(width: 160)
    }
}

#Preview {
    AlbumsGridView(viewModel: LibraryViewModel(), searchText: "")
}
