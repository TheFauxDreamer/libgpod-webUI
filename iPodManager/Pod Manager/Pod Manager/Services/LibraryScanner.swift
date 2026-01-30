import Foundation
import AVFoundation
import CryptoKit

class LibraryScanner {
    static let shared = LibraryScanner()

    private let supportedExtensions = ["mp3", "m4a", "aac", "mp4", "wav", "aiff"]
    private let fileManager = FileManager.default

    struct ScanProgress {
        let scanned: Int
        let total: Int
        let currentFile: String
    }

    /// Scan a directory for audio files
    func scan(
        directory: URL,
        isPodcast: Bool = false,
        progress: @escaping (ScanProgress) -> Void
    ) async throws -> [Track] {
        var tracks: [Track] = []
        var trackId = 1

        // Find all audio files
        let audioFiles = findAudioFiles(in: directory)

        for (index, fileURL) in audioFiles.enumerated() {
            progress(ScanProgress(
                scanned: index,
                total: audioFiles.count,
                currentFile: fileURL.lastPathComponent
            ))

            if let track = await extractMetadata(from: fileURL, id: trackId, isPodcast: isPodcast) {
                tracks.append(track)
                trackId += 1
            }
        }

        progress(ScanProgress(scanned: audioFiles.count, total: audioFiles.count, currentFile: ""))
        return tracks
    }

    /// Find all audio files in a directory recursively
    private func findAudioFiles(in directory: URL) -> [URL] {
        var audioFiles: [URL] = []

        guard let enumerator = fileManager.enumerator(
            at: directory,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) else {
            return audioFiles
        }

        for case let fileURL as URL in enumerator {
            let ext = fileURL.pathExtension.lowercased()
            if supportedExtensions.contains(ext) {
                audioFiles.append(fileURL)
            }
        }

        return audioFiles
    }

    /// Extract metadata from an audio file using AVFoundation
    private func extractMetadata(from fileURL: URL, id: Int, isPodcast: Bool) async -> Track? {
        let asset = AVAsset(url: fileURL)

        do {
            let metadata = try await asset.load(.commonMetadata)
            let duration = try await asset.load(.duration)

            var title: String?
            var artist: String?
            var album: String?
            var albumArtist: String?
            var genre: String?
            var trackNumber: Int?
            var discNumber: Int?
            var year: Int?
            var artworkHash: String?

            for item in metadata {
                guard let key = item.commonKey else { continue }

                switch key {
                case .commonKeyTitle:
                    title = try? await item.load(.stringValue)
                case .commonKeyArtist:
                    artist = try? await item.load(.stringValue)
                case .commonKeyAlbumName:
                    album = try? await item.load(.stringValue)
                case .commonKeyArtwork:
                    if let data = try? await item.load(.dataValue) {
                        artworkHash = ArtworkCache.shared.cacheArtwork(data)
                    }
                default:
                    break
                }
            }

            // Calculate SHA1 hash of first 16KB for duplicate detection
            let sha1Hash = calculateSHA1(of: fileURL)

            // Get file modification time
            let attributes = try? fileManager.attributesOfItem(atPath: fileURL.path)
            let modTime = attributes?[.modificationDate] as? Date

            // Calculate duration in milliseconds
            let durationMs = Int(CMTimeGetSeconds(duration) * 1000)

            return Track(
                id: id,
                filePath: fileURL.path,
                sha1Hash: sha1Hash,
                title: title,
                artist: artist,
                album: album,
                albumArtist: albumArtist,
                genre: genre,
                trackNumber: trackNumber,
                discNumber: discNumber,
                year: year,
                durationMs: durationMs,
                bitrate: nil,
                hasArtwork: artworkHash != nil,
                artworkHash: artworkHash,
                isPodcast: isPodcast
            )
        } catch {
            print("Error extracting metadata from \(fileURL.lastPathComponent): \(error)")
            return nil
        }
    }

    /// Calculate SHA1 hash of the first 16KB of a file (for duplicate detection)
    private func calculateSHA1(of fileURL: URL) -> String? {
        guard let handle = try? FileHandle(forReadingFrom: fileURL) else {
            return nil
        }
        defer { try? handle.close() }

        let data = handle.readData(ofLength: 16 * 1024)
        let hash = Insecure.SHA1.hash(data: data)
        return hash.map { String(format: "%02x", $0) }.joined()
    }
}
