import Foundation
import AppKit
import CryptoKit

class ArtworkCache {
    static let shared = ArtworkCache()

    private let cacheDirectory: URL
    private let fileManager = FileManager.default

    private init() {
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        cacheDirectory = appSupport
            .appendingPathComponent("iPodManager")
            .appendingPathComponent("ArtworkCache")

        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    /// Get the local file URL for cached artwork
    func artworkURL(for hash: String) -> URL {
        return cacheDirectory.appendingPathComponent("\(hash).jpg")
    }

    /// Check if artwork is cached
    func hasCachedArtwork(for hash: String) -> Bool {
        return fileManager.fileExists(atPath: artworkURL(for: hash).path)
    }

    /// Cache artwork data and return its hash
    @discardableResult
    func cacheArtwork(_ data: Data) -> String {
        let hash = md5Hash(data)
        let url = artworkURL(for: hash)

        if !fileManager.fileExists(atPath: url.path) {
            try? data.write(to: url)
        }

        return hash
    }

    /// Cache artwork from an image
    @discardableResult
    func cacheArtwork(_ image: NSImage) -> String? {
        guard let tiffData = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData),
              let jpegData = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.8]) else {
            return nil
        }

        return cacheArtwork(jpegData)
    }

    /// Extract artwork from an audio file and cache it
    func extractAndCacheArtwork(from audioFileURL: URL) -> String? {
        // Try to extract embedded artwork using AVFoundation
        // This is a simplified version - full implementation would use AVAsset

        // Check for folder.jpg in the same directory
        let folderArtwork = audioFileURL.deletingLastPathComponent().appendingPathComponent("folder.jpg")
        if let data = try? Data(contentsOf: folderArtwork) {
            return cacheArtwork(data)
        }

        // Check for cover.jpg
        let coverArtwork = audioFileURL.deletingLastPathComponent().appendingPathComponent("cover.jpg")
        if let data = try? Data(contentsOf: coverArtwork) {
            return cacheArtwork(data)
        }

        return nil
    }

    /// Clear the artwork cache
    func clearCache() {
        try? fileManager.removeItem(at: cacheDirectory)
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    /// Calculate MD5 hash of data
    private func md5Hash(_ data: Data) -> String {
        let digest = Insecure.MD5.hash(data: data)
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}
