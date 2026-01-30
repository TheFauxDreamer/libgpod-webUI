import SwiftUI

struct AlbumsGridView: View {
    @ObservedObject var viewModel: LibraryViewModel
    let searchText: String

    @State private var selectedAlbum: Album? = nil
    @State private var albumTracks: [Track] = []

    // Calculate how many albums fit per row based on width
    @State private var albumsPerRow: Int = 5

    var filteredAlbums: [Album] {
        if searchText.isEmpty {
            return viewModel.albums
        }
        return viewModel.albums.filter { album in
            album.album.localizedCaseInsensitiveContains(searchText) ||
            (album.artist?.localizedCaseInsensitiveContains(searchText) ?? false)
        }
    }

    // Group albums into rows
    var albumRows: [[Album]] {
        var rows: [[Album]] = []
        var currentRow: [Album] = []

        for album in filteredAlbums {
            currentRow.append(album)
            if currentRow.count >= albumsPerRow {
                rows.append(currentRow)
                currentRow = []
            }
        }

        if !currentRow.isEmpty {
            rows.append(currentRow)
        }

        return rows
    }

    // Find which row contains the selected album
    var selectedRowIndex: Int? {
        guard let selected = selectedAlbum else { return nil }
        for (index, row) in albumRows.enumerated() {
            if row.contains(where: { $0.id == selected.id }) {
                return index
            }
        }
        return nil
    }

    var body: some View {
        GeometryReader { geometry in
            let calculatedAlbumsPerRow = max(1, Int((geometry.size.width - 32) / 176))

            ScrollView {
                VStack(spacing: 0) {
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
                        VStack(spacing: 16) {
                            ForEach(Array(albumRows.enumerated()), id: \.offset) { rowIndex, row in
                                VStack(spacing: 0) {
                                    // Album row
                                    HStack(alignment: .top, spacing: 16) {
                                        ForEach(row) { album in
                                            AlbumCardView(album: album, isSelected: selectedAlbum?.id == album.id)
                                                .onTapGesture {
                                                    selectAlbum(album)
                                                }
                                        }
                                        Spacer()
                                    }
                                    .padding(.horizontal, 16)

                                    // Show detail panel after this row if it contains the selected album
                                    if let selected = selectedAlbum,
                                       row.contains(where: { $0.id == selected.id }) {
                                        AlbumDetailPanel(
                                            album: selected,
                                            tracks: albumTracks,
                                            onClose: {
                                                withAnimation(.easeInOut(duration: 0.2)) {
                                                    selectedAlbum = nil
                                                    albumTracks = []
                                                }
                                            }
                                        )
                                        .padding(.top, 16)
                                    }
                                }
                            }
                        }
                        .padding(.vertical, 16)
                    }
                }
            }
            .onChange(of: calculatedAlbumsPerRow) { _, newValue in
                albumsPerRow = newValue
            }
            .onAppear {
                albumsPerRow = calculatedAlbumsPerRow
            }
        }
    }

    private func selectAlbum(_ album: Album) {
        if selectedAlbum?.id == album.id {
            withAnimation(.easeInOut(duration: 0.2)) {
                selectedAlbum = nil
                albumTracks = []
            }
        } else {
            // Load tracks for this album
            let allTracks = LibraryDatabase.shared.loadTracks(isPodcast: false)
            let filtered = allTracks
                .filter { $0.album == album.album }
                .sorted {
                    let disc0 = $0.discNumber ?? 1
                    let disc1 = $1.discNumber ?? 1
                    if disc0 != disc1 { return disc0 < disc1 }
                    return ($0.trackNumber ?? 0) < ($1.trackNumber ?? 0)
                }

            withAnimation(.easeInOut(duration: 0.2)) {
                selectedAlbum = album
                albumTracks = filtered
            }
        }
    }
}

// MARK: - Album Detail Panel (iTunes-style)

struct AlbumDetailPanel: View {
    let album: Album
    let tracks: [Track]
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Top border
            Divider()

            HStack(alignment: .top, spacing: 20) {
                // Close button
                Button(action: onClose) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
                .padding(.top, 4)

                // Album info and track list
                VStack(alignment: .leading, spacing: 8) {
                    // Album title
                    Text(album.album)
                        .font(.title2)
                        .fontWeight(.semibold)

                    // Artist and year
                    HStack(spacing: 4) {
                        Text(album.displayArtist)
                            .foregroundColor(.secondary)
                        if let year = album.year {
                            Text("(\(String(year)))")
                                .foregroundColor(.secondary)
                        }
                        Text("•")
                            .foregroundColor(.secondary)
                        Text("\(tracks.count) songs")
                            .foregroundColor(.secondary)
                    }
                    .font(.subheadline)

                    Spacer().frame(height: 12)

                    // Track list in columns
                    if tracks.isEmpty {
                        Text("No tracks found")
                            .foregroundColor(.secondary)
                    } else {
                        TrackColumnsView(tracks: tracks)
                    }
                }

                Spacer()

                // Album artwork on the right
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
                .frame(width: 140, height: 140)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .padding(20)
            .background(Color(nsColor: .windowBackgroundColor))

            // Bottom border
            Divider()
        }
    }
}

// MARK: - Track Columns View

struct TrackColumnsView: View {
    let tracks: [Track]

    private let columnCount = 2

    var tracksPerColumn: Int {
        (tracks.count + columnCount - 1) / columnCount
    }

    var body: some View {
        HStack(alignment: .top, spacing: 40) {
            ForEach(0..<columnCount, id: \.self) { columnIndex in
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(tracksForColumn(columnIndex), id: \.id) { track in
                        TrackRowView(track: track)
                    }
                }
                .frame(minWidth: 250, alignment: .leading)
            }
        }
    }

    func tracksForColumn(_ column: Int) -> [Track] {
        let start = column * tracksPerColumn
        let end = min(start + tracksPerColumn, tracks.count)
        if start >= tracks.count { return [] }
        return Array(tracks[start..<end])
    }
}

// MARK: - Track Row View

struct TrackRowView: View {
    let track: Track

    var body: some View {
        HStack(spacing: 8) {
            // Track number - show the number, or position if no track number
            Text(String(track.trackNumber ?? 0))
                .font(.system(.callout, design: .monospaced))
                .foregroundColor(.secondary)
                .frame(width: 24, alignment: .trailing)

            // Track title
            Text(track.displayTitle)
                .lineLimit(1)
                .truncationMode(.tail)

            Spacer()

            // Duration
            Text(track.formattedDuration)
                .foregroundColor(.secondary)
                .font(.system(.callout, design: .monospaced))
        }
        .font(.callout)
        .padding(.vertical, 2)
    }
}

// MARK: - Album Card View

struct AlbumCardView: View {
    let album: Album
    var isSelected: Bool = false

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
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isSelected ? Color.accentColor : Color.clear, lineWidth: 3)
            )
            .shadow(color: isSelected ? Color.accentColor.opacity(0.3) : Color.clear, radius: 8)

            // Album info
            Text(album.album)
                .font(.headline)
                .lineLimit(1)

            Text(album.displayArtist)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
        .frame(width: 160)
    }
}

#Preview {
    AlbumsGridView(viewModel: LibraryViewModel(), searchText: "")
}
