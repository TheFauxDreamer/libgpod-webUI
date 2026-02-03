import SwiftUI

struct PodcastsView: View {
    @ObservedObject var viewModel: LibraryViewModel
    let searchText: String
    @State private var selectedSeries: PodcastSeries? = nil
    @State private var episodes: [Track] = []

    private let columns = [
        GridItem(.adaptive(minimum: 160, maximum: 200), spacing: 16)
    ]

    var filteredSeries: [PodcastSeries] {
        if searchText.isEmpty {
            return viewModel.podcastSeries
        }
        return viewModel.podcastSeries.filter { series in
            series.seriesName.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        if selectedSeries != nil {
            // Episodes view
            VStack(alignment: .leading, spacing: 0) {
                // Back button
                HStack {
                    Button {
                        selectedSeries = nil
                        episodes = []
                    } label: {
                        Label("Back to Series", systemImage: "chevron.left")
                    }
                    .buttonStyle(.plain)
                    .padding()

                    Spacer()
                }

                Divider()

                // Episodes table
                if episodes.isEmpty {
                    ContentUnavailableView(
                        "No Episodes",
                        systemImage: "mic",
                        description: Text("No episodes found for this series.")
                    )
                } else {
                    Table(episodes) {
                        TableColumn("#") { track in
                            Text(track.trackNumber.map { "\($0)" } ?? "")
                        }
                        .width(40)

                        TableColumn("Episode", value: \.displayTitle)

                        TableColumn("Year") { track in
                            Text(track.year.map { "\($0)" } ?? "")
                        }
                        .width(60)

                        TableColumn("Duration") { track in
                            Text(track.formattedDuration)
                        }
                        .width(60)
                    }
                }
            }
        } else {
            // Series grid view
            ScrollView {
                if viewModel.isLoading {
                    ProgressView("Loading podcasts...")
                        .padding()
                } else if filteredSeries.isEmpty {
                    ContentUnavailableView(
                        "No Podcasts",
                        systemImage: "mic.fill",
                        description: Text("Configure your podcast library in Settings to see podcasts here.")
                    )
                } else {
                    LazyVGrid(columns: columns, spacing: 16) {
                        ForEach(filteredSeries) { series in
                            PodcastSeriesCard(series: series)
                                .onTapGesture {
                                    selectedSeries = series
                                    episodes = LibraryDatabase.shared.loadPodcastEpisodes(forSeries: series.seriesName)
                                }
                        }
                    }
                    .padding()
                }
            }
        }
    }
}

struct PodcastSeriesCard: View {
    let series: PodcastSeries

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Artwork
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.purple.opacity(0.2))

                if let hash = series.artworkHash {
                    AsyncImage(url: ArtworkCache.shared.artworkURL(for: hash)) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } placeholder: {
                        Image(systemName: "mic.fill")
                            .font(.system(size: 40))
                            .foregroundColor(.purple)
                    }
                } else {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 40))
                        .foregroundColor(.purple)
                }
            }
            .frame(width: 160, height: 160)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            // Series info
            Text(series.displayName)
                .font(.headline)
                .lineLimit(2)

            Text("\(series.episodeCount) episodes")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(width: 160)
    }
}

#Preview {
    PodcastsView(viewModel: LibraryViewModel(), searchText: "")
}
