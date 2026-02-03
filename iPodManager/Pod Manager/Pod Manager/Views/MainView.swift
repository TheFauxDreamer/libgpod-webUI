import SwiftUI

enum ContentViewType: String, CaseIterable {
    case albums = "Albums"
    case tracks = "Tracks"
    case podcasts = "Podcasts"
    case ipodTracks = "iPod"
}

struct MainView: View {
    @StateObject private var libraryVM = LibraryViewModel()
    @StateObject private var ipodVM = IPodViewModel()
    @State private var selectedView: ContentViewType = .albums
    @State private var showSettings = false
    @State private var searchText = ""

    var body: some View {
        NavigationSplitView {
            SidebarView(ipodVM: ipodVM, showSettings: $showSettings)
                .frame(minWidth: 200, idealWidth: 250)
        } detail: {
            VStack(spacing: 0) {
                // Toolbar
                ToolbarView(
                    selectedView: $selectedView,
                    searchText: $searchText,
                    libraryVM: libraryVM
                )

                Divider()

                // Main content
                if let playlistId = ipodVM.selectedPlaylistId {
                    // Show playlist tracks when a playlist is selected
                    PlaylistTracksView(viewModel: ipodVM, playlistId: playlistId)
                } else {
                    switch selectedView {
                    case .albums:
                        AlbumsGridView(viewModel: libraryVM, ipodVM: ipodVM, searchText: searchText)
                    case .tracks:
                        TracksTableView(viewModel: libraryVM, ipodVM: ipodVM, searchText: searchText)
                    case .podcasts:
                        PodcastsView(viewModel: libraryVM, searchText: searchText)
                    case .ipodTracks:
                        IPodTracksView(viewModel: ipodVM)
                    }
                }
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
        }
        .onReceive(NotificationCenter.default.publisher(for: .showSettings)) { _ in
            showSettings = true
        }
        .onAppear {
            Task {
                await libraryVM.loadAlbums()
            }
        }
    }
}

#Preview {
    MainView()
}
