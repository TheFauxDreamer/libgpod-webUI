import SwiftUI
import AppKit
import UniformTypeIdentifiers

struct M3UImportSheet: View {
    @ObservedObject var ipodVM: IPodViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var selectedFileURL: URL? = nil
    @State private var matchedTracks: [Track] = []
    @State private var unmatchedPaths: [String] = []
    @State private var isProcessing = false
    @State private var hasProcessed = false

    var body: some View {
        VStack(spacing: 20) {
            Text("Import M3U Playlist")
                .font(.headline)

            if !hasProcessed {
                // File selection
                VStack(spacing: 12) {
                    if let url = selectedFileURL {
                        HStack {
                            Image(systemName: "doc.text")
                            Text(url.lastPathComponent)
                                .lineLimit(1)
                                .truncationMode(.middle)
                            Spacer()
                            Button("Change") {
                                selectFile()
                            }
                        }
                        .padding()
                        .background(Color.secondary.opacity(0.1))
                        .cornerRadius(8)
                    } else {
                        Button {
                            selectFile()
                        } label: {
                            Label("Choose M3U File...", systemImage: "folder")
                        }
                        .buttonStyle(.bordered)
                    }

                    Text("Select an .m3u or .m3u8 playlist file to import")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .frame(width: 300)
            } else {
                // Results
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("\(matchedTracks.count) tracks matched")
                    }

                    if !unmatchedPaths.isEmpty {
                        HStack {
                            Image(systemName: "exclamationmark.circle.fill")
                                .foregroundColor(.orange)
                            Text("\(unmatchedPaths.count) tracks not found in library")
                        }

                        ScrollView {
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(unmatchedPaths.prefix(10), id: \.self) { path in
                                    Text(URL(fileURLWithPath: path).lastPathComponent)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                        .lineLimit(1)
                                }
                                if unmatchedPaths.count > 10 {
                                    Text("... and \(unmatchedPaths.count - 10) more")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                            }
                        }
                        .frame(maxHeight: 100)
                    }
                }
                .frame(width: 300)
            }

            Divider()

            // Actions
            HStack(spacing: 12) {
                Button("Cancel") {
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)

                if hasProcessed {
                    Button("Add to iPod") {
                        addTracksToiPod()
                    }
                    .keyboardShortcut(.defaultAction)
                    .disabled(matchedTracks.isEmpty)
                } else {
                    Button("Load Playlist") {
                        loadPlaylist()
                    }
                    .keyboardShortcut(.defaultAction)
                    .disabled(selectedFileURL == nil || isProcessing)
                }
            }
        }
        .padding(24)
        .frame(minWidth: 400)
    }

    private func selectFile() {
        let panel = NSOpenPanel()
        // Allow .m3u and .m3u8 files
        panel.allowedContentTypes = [
            UTType(filenameExtension: "m3u") ?? .plainText,
            UTType(filenameExtension: "m3u8") ?? .plainText
        ]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.message = "Select an M3U playlist file"

        if panel.runModal() == .OK {
            selectedFileURL = panel.url
        }
    }

    private func loadPlaylist() {
        guard let url = selectedFileURL else { return }

        isProcessing = true

        // Parse M3U file
        let m3uTracks = M3UParser.shared.parse(fileURL: url)

        // Get library tracks for matching
        let libraryTracks = LibraryDatabase.shared.loadTracks(isPodcast: false)

        // Match to library
        let result = M3UParser.shared.matchToLibrary(m3uTracks, libraryTracks: libraryTracks)

        matchedTracks = result.matched
        unmatchedPaths = result.unmatched
        hasProcessed = true
        isProcessing = false
    }

    private func addTracksToiPod() {
        let paths = matchedTracks.map { $0.filePath }
        Task {
            try? await ipodVM.addTracks(paths, to: nil)
            await MainActor.run {
                dismiss()
            }
        }
    }
}

#Preview {
    M3UImportSheet(ipodVM: IPodViewModel())
}
