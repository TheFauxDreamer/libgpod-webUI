import Foundation
import AVFoundation
import CryptoKit

class LibraryScanner {
    static let shared = LibraryScanner()

    private let supportedExtensions = ["mp3", "m4a", "aac", "mp4", "wav", "aiff", "flac", "alac"]
    private let fileManager = FileManager.default

    /// Scan a directory for audio files
    /// - Parameters:
    ///   - directory: The folder to scan
    ///   - isPodcast: Whether these are podcast files
    ///   - progress: Callback with progress from 0.0 to 1.0
    /// - Returns: Array of Track objects with metadata
    func scan(
        directory: URL,
        isPodcast: Bool = false,
        progress: @escaping (Double) -> Void
    ) async -> [Track] {
        var tracks: [Track] = []
        var trackId = 1

        print("LibraryScanner: Starting scan of \(directory.path)")

        // Find all audio files
        let audioFiles = findAudioFiles(in: directory)
        print("LibraryScanner: Found \(audioFiles.count) audio files")

        guard !audioFiles.isEmpty else {
            print("LibraryScanner: No audio files found")
            progress(1.0)
            return []
        }

        for (index, fileURL) in audioFiles.enumerated() {
            // Report progress
            let progressValue = Double(index) / Double(audioFiles.count)
            progress(progressValue)

            if let track = await extractMetadata(from: fileURL, id: trackId, isPodcast: isPodcast) {
                tracks.append(track)
                trackId += 1
            }
        }

        print("LibraryScanner: Scan complete, found \(tracks.count) tracks with metadata")
        progress(1.0)
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

            // Also try iTunes-specific metadata
            let iTunesMetadata = try? await asset.load(.metadata)
            if let iTunesMeta = iTunesMetadata {
                for item in iTunesMeta {
                    if let identifier = item.identifier {
                        switch identifier {
                        case .iTunesMetadataAlbumArtist:
                            albumArtist = try? await item.load(.stringValue)
                        case .iTunesMetadataTrackNumber:
                            if let value = try? await item.load(.numberValue) {
                                trackNumber = value.intValue
                            }
                        case .iTunesMetadataDiscNumber:
                            if let value = try? await item.load(.numberValue) {
                                discNumber = value.intValue
                            }
                        case .id3MetadataContentType, .iTunesMetadataUserGenre:
                            genre = try? await item.load(.stringValue)
                        case .id3MetadataYear, .iTunesMetadataReleaseDate:
                            if let yearStr = try? await item.load(.stringValue),
                               let yearInt = Int(yearStr.prefix(4)) {
                                year = yearInt
                            }
                        default:
                            break
                        }
                    }
                }
            }

            // Calculate SHA1 hash of first 16KB for duplicate detection
            let sha1Hash = calculateSHA1(of: fileURL)

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
