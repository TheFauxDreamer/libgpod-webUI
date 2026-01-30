import SwiftUI

struct SettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var settings = AppSettings.shared
    @State private var musicPath: String = ""
    @State private var podcastPath: String = ""
    @State private var isScanning = false
    @State private var scanStatus: String? = nil

    var body: some View {
        VStack(spacing: 20) {
            Text("Settings")
                .font(.title2)
                .fontWeight(.semibold)

            Form {
                Section("Music Library") {
                    HStack {
                        TextField("Music folder path", text: $musicPath)
                            .textFieldStyle(.roundedBorder)

                        Button("Browse...") {
                            selectFolder { url in
                                musicPath = url.path
                            }
                        }
                    }

                    Button {
                        settings.musicLibraryPath = musicPath
                        scanLibrary()
                    } label: {
                        HStack {
                            if isScanning {
                                ProgressView()
                                    .scaleEffect(0.8)
                            }
                            Text("Scan Music Library")
                        }
                    }
                    .disabled(musicPath.isEmpty || isScanning)

                    if let status = scanStatus {
                        Text(status)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                Section("Podcast Library") {
                    HStack {
                        TextField("Podcast folder path", text: $podcastPath)
                            .textFieldStyle(.roundedBorder)

                        Button("Browse...") {
                            selectFolder { url in
                                podcastPath = url.path
                            }
                        }
                    }

                    Button("Scan Podcasts") {
                        settings.podcastLibraryPath = podcastPath
                        // TODO: Scan podcasts
                    }
                    .disabled(podcastPath.isEmpty || isScanning)
                }
            }
            .formStyle(.grouped)

            HStack {
                Spacer()
                Button("Done") {
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding()
        .frame(width: 500, height: 400)
        .onAppear {
            musicPath = settings.musicLibraryPath ?? ""
            podcastPath = settings.podcastLibraryPath ?? ""
        }
    }

    private func selectFolder(completion: @escaping (URL) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = true
        panel.canChooseFiles = false

        if panel.runModal() == .OK, let url = panel.url {
            completion(url)
        }
    }

    private func scanLibrary() {
        isScanning = true
        scanStatus = "Scanning..."

        Task {
            // TODO: Implement actual scanning
            try? await Task.sleep(nanoseconds: 2_000_000_000)

            await MainActor.run {
                isScanning = false
                scanStatus = "Scan complete"
            }
        }
    }
}

#Preview {
    SettingsSheet()
}
