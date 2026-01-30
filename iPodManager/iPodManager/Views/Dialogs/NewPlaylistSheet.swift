import SwiftUI

struct NewPlaylistSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var ipodVM: IPodViewModel
    @State private var playlistName: String = ""
    @State private var isCreating = false
    @State private var errorMessage: String? = nil

    var body: some View {
        VStack(spacing: 20) {
            Text("New Playlist")
                .font(.title2)
                .fontWeight(.semibold)

            TextField("Playlist name", text: $playlistName)
                .textFieldStyle(.roundedBorder)
                .frame(width: 300)

            if let error = errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .font(.caption)
            }

            HStack(spacing: 12) {
                Button("Cancel") {
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)

                Button("Create") {
                    createPlaylist()
                }
                .keyboardShortcut(.defaultAction)
                .disabled(playlistName.isEmpty || isCreating)
            }
        }
        .padding()
        .frame(width: 350, height: 150)
    }

    private func createPlaylist() {
        isCreating = true
        errorMessage = nil

        Task {
            do {
                try await ipodVM.createPlaylist(name: playlistName)
                await MainActor.run {
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isCreating = false
                }
            }
        }
    }
}
