import SwiftUI
import AppKit

struct SettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var settings = AppSettings.shared
    @State private var isScanning = false
    @State private var scanProgress: Double = 0
    @State private var scanStatus: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("Settings")
                .font(.title2)
                .fontWeight(.semibold)

            // Music Library Section
            GroupBox("Music Library") {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        if let path = settings.musicLibraryPath {
                            Image(systemName: "folder.fill")
                                .foregroundColor(.secondary)
                            Text(path)
                                .lineLimit(1)
                                .truncationMode(.middle)
                                .foregroundColor(.primary)
                            Spacer()
                        } else {
                            Text("No folder selected")
                                .foregroundColor(.secondary)
                            Spacer()
                        }

                        Button("Choose...") {
                            selectMusicFolder()
                        }
                    }

                    if settings.musicLibraryPath != nil {
                        HStack {
                            Button {
                                scanMusicLibrary()
                            } label: {
                                HStack(spacing: 6) {
                                    if isScanning {
                                        ProgressView()
                                            .controlSize(.small)
                                    }
                                    Text("Scan Library")
                                }
                            }
                            .disabled(isScanning)

                            if isScanning {
                                ProgressView(value: scanProgress)
                                    .frame(width: 100)
                            }

                            Spacer()

                            let count = LibraryDatabase.shared.trackCount(isPodcast: false)
                            if count > 0 {
                                Text("\(count) tracks")
                                    .foregroundColor(.secondary)
                                    .font(.callout)
                            }
                        }

                        if !scanStatus.isEmpty {
                            Text(scanStatus)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                .padding(8)
            }

            // Podcast Library Section
            GroupBox("Podcast Library") {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        if let path = settings.podcastLibraryPath {
                            Image(systemName: "folder.fill")
                                .foregroundColor(.secondary)
                            Text(path)
                                .lineLimit(1)
                                .truncationMode(.middle)
                                .foregroundColor(.primary)
                            Spacer()
                        } else {
                            Text("No folder selected")
                                .foregroundColor(.secondary)
                            Spacer()
                        }

                        Button("Choose...") {
                            selectPodcastFolder()
                        }
                    }

                    if settings.podcastLibraryPath != nil {
                        HStack {
                            Button("Scan Podcasts") {
                                scanPodcastLibrary()
                            }
                            .disabled(isScanning)

                            Spacer()

                            let count = LibraryDatabase.shared.trackCount(isPodcast: true)
                            if count > 0 {
                                Text("\(count) episodes")
                                    .foregroundColor(.secondary)
                                    .font(.callout)
                            }
                        }
                    }
                }
                .padding(8)
            }

            Spacer()

            HStack {
                Spacer()
                Button("Done") {
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 500, height: 350)
    }

    // MARK: - Folder Selection

    private func selectMusicFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.message = "Select your music library folder"
        panel.prompt = "Select"

        if panel.runModal() == .OK, let url = panel.url {
            _ = url.startAccessingSecurityScopedResource()
            settings.saveMusicLibraryBookmark(from: url)
        }
    }

    private func selectPodcastFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.message = "Select your podcast folder"
        panel.prompt = "Select"

        if panel.runModal() == .OK, let url = panel.url {
            _ = url.startAccessingSecurityScopedResource()
            settings.savePodcastLibraryBookmark(from: url)
        }
    }

    // MARK: - Library Scanning

    private func scanMusicLibrary() {
        guard let url = settings.resolveMusicLibraryURL() else {
            scanStatus = "Error: Could not access folder"
            return
        }

        let hasAccess = url.startAccessingSecurityScopedResource()

        isScanning = true
        scanStatus = "Scanning..."
        scanProgress = 0

        Task {
            let tracks = await LibraryScanner.shared.scan(
                directory: url,
                isPodcast: false
            ) { progress in
                Task { @MainActor in
                    scanProgress = progress
                }
            }

            // Save tracks to database
            LibraryDatabase.shared.saveTracks(tracks, isPodcast: false)

            if hasAccess {
                url.stopAccessingSecurityScopedResource()
            }

            await MainActor.run {
                isScanning = false
                scanProgress = 1
                scanStatus = "Found \(tracks.count) tracks"

                // Notify that library was updated
                NotificationCenter.default.post(name: .libraryDidUpdate, object: nil)
            }
        }
    }

    private func scanPodcastLibrary() {
        guard let url = settings.resolvePodcastLibraryURL() else {
            scanStatus = "Error: Could not access folder"
            return
        }

        let hasAccess = url.startAccessingSecurityScopedResource()

        isScanning = true
        scanStatus = "Scanning podcasts..."
        scanProgress = 0

        Task {
            let tracks = await LibraryScanner.shared.scan(
                directory: url,
                isPodcast: true
            ) { progress in
                Task { @MainActor in
                    scanProgress = progress
                }
            }

            LibraryDatabase.shared.saveTracks(tracks, isPodcast: true)

            if hasAccess {
                url.stopAccessingSecurityScopedResource()
            }

            await MainActor.run {
                isScanning = false
                scanProgress = 1
                scanStatus = "Found \(tracks.count) episodes"

                NotificationCenter.default.post(name: .libraryDidUpdate, object: nil)
            }
        }
    }
}

// Notification for library updates
extension Notification.Name {
    static let libraryDidUpdate = Notification.Name("libraryDidUpdate")
}

#Preview {
    SettingsSheet()
}
