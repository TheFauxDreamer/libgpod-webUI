import SwiftUI

struct SidebarView: View {
    @ObservedObject var ipodVM: IPodViewModel
    @Binding var showSettings: Bool
    @State private var showNewPlaylist = false

    var body: some View {
        List {
            // Library Section
            Section("Library") {
                Button {
                    showSettings = true
                } label: {
                    Label("Settings", systemImage: "gear")
                }
                .buttonStyle(.plain)

                HStack {
                    Circle()
                        .fill(AppSettings.shared.musicLibraryPath != nil ? .green : .red)
                        .frame(width: 8, height: 8)
                    Text("Music")
                        .foregroundColor(.secondary)
                }

                HStack {
                    Circle()
                        .fill(AppSettings.shared.podcastLibraryPath != nil ? .green : .red)
                        .frame(width: 8, height: 8)
                    Text("Podcasts")
                        .foregroundColor(.secondary)
                }
            }

            // iPod Section
            Section("iPod") {
                if ipodVM.isConnected {
                    HStack {
                        Image(systemName: "ipod")
                        Text(ipodVM.deviceName ?? "iPod")
                        Spacer()
                        Button {
                            Task { await ipodVM.disconnect() }
                        } label: {
                            Text("Eject")
                                .font(.caption)
                        }
                        .buttonStyle(.bordered)
                    }
                } else {
                    IPodDetectionView(ipodVM: ipodVM)
                }
            }

            // Playlists Section (when connected)
            if ipodVM.isConnected {
                Section("Playlists") {
                    PlaylistsListView(ipodVM: ipodVM)

                    Button {
                        showNewPlaylist = true
                    } label: {
                        Label("New Playlist", systemImage: "plus")
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .listStyle(.sidebar)
        .sheet(isPresented: $showNewPlaylist) {
            NewPlaylistSheet(ipodVM: ipodVM)
        }
    }
}

struct IPodDetectionView: View {
    @ObservedObject var ipodVM: IPodViewModel
    @State private var selectedDevice: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if ipodVM.detectedDevices.isEmpty {
                Button {
                    Task { await ipodVM.detectDevices() }
                } label: {
                    Label("Detect iPod", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.plain)
            } else {
                Picker("Select iPod", selection: $selectedDevice) {
                    Text("Select...").tag(nil as String?)
                    ForEach(ipodVM.detectedDevices) { device in
                        Text(device.displayName).tag(device.mountpoint as String?)
                    }
                }
                .pickerStyle(.menu)

                if let device = selectedDevice {
                    Button("Connect") {
                        Task {
                            try? await ipodVM.connect(to: device)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
        .onAppear {
            Task { await ipodVM.detectDevices() }
        }
    }
}
