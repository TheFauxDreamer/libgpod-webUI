import Foundation

/// Parsed track info from M3U file
struct M3UTrack {
    let path: String
    let title: String?
    let duration: Int?
}

/// M3U/M3U8 playlist parser
class M3UParser {
    static let shared = M3UParser()

    /// Parse an M3U or M3U8 playlist file
    func parse(fileURL: URL) -> [M3UTrack] {
        var tracks: [M3UTrack] = []
        let playlistDir = fileURL.deletingLastPathComponent()

        // Try to read the file with different encodings
        var content: String?
        for encoding in [String.Encoding.utf8, .isoLatin1, .windowsCP1252] {
            if let str = try? String(contentsOf: fileURL, encoding: encoding) {
                content = str
                break
            }
        }

        guard let fileContent = content else {
            print("M3UParser: Could not read file with any encoding")
            return []
        }

        var currentInfo: (title: String?, duration: Int?) = (nil, nil)

        for line in fileContent.components(separatedBy: .newlines) {
            let trimmedLine = line.trimmingCharacters(in: .whitespaces)

            if trimmedLine.isEmpty {
                continue
            }

            if trimmedLine.hasPrefix("#EXTM3U") {
                // Header, skip
                continue
            }

            if trimmedLine.hasPrefix("#EXTINF:") {
                // Extended info: #EXTINF:duration,title
                let infoPart = String(trimmedLine.dropFirst(8))
                if let commaIndex = infoPart.firstIndex(of: ",") {
                    let durationStr = String(infoPart[..<commaIndex])
                    let title = String(infoPart[infoPart.index(after: commaIndex)...]).trimmingCharacters(in: .whitespaces)
                    currentInfo.duration = Int(Double(durationStr) ?? 0)
                    currentInfo.title = title
                } else {
                    currentInfo.duration = Int(Double(infoPart) ?? 0)
                }
                continue
            }

            if trimmedLine.hasPrefix("#") {
                // Other comment/directive, skip
                continue
            }

            // This is a file path
            var trackPath = trimmedLine

            // Handle relative paths
            if !trackPath.hasPrefix("/") && !trackPath.contains("://") {
                trackPath = playlistDir.appendingPathComponent(trackPath).path
            }

            // Normalize path
            trackPath = (trackPath as NSString).standardizingPath

            tracks.append(M3UTrack(
                path: trackPath,
                title: currentInfo.title,
                duration: currentInfo.duration
            ))

            currentInfo = (nil, nil)
        }

        print("M3UParser: Parsed \(tracks.count) tracks from \(fileURL.lastPathComponent)")
        return tracks
    }

    /// Match M3U tracks to library tracks
    func matchToLibrary(_ m3uTracks: [M3UTrack], libraryTracks: [Track]) -> (matched: [Track], unmatched: [String]) {
        // Build lookup by normalized path and by filename
        var pathToTrack: [String: Track] = [:]
        var filenameToTracks: [String: [Track]] = [:]

        for track in libraryTracks {
            let filepath = track.filePath
            let normPath = (filepath as NSString).standardizingPath

            pathToTrack[normPath] = track
            pathToTrack[normPath.lowercased()] = track

            let filename = (filepath as NSString).lastPathComponent.lowercased()
            filenameToTracks[filename, default: []].append(track)
        }

        var matchedTracks: [Track] = []
        var unmatchedPaths: [String] = []

        for m3uTrack in m3uTracks {
            let trackPath = m3uTrack.path
            let normPath = (trackPath as NSString).standardizingPath

            // Try exact path match
            if let track = pathToTrack[normPath] {
                matchedTracks.append(track)
                continue
            }

            // Try case-insensitive path match
            if let track = pathToTrack[normPath.lowercased()] {
                matchedTracks.append(track)
                continue
            }

            // Try filename match (only if unique)
            let filename = (trackPath as NSString).lastPathComponent.lowercased()
            if let tracks = filenameToTracks[filename], tracks.count == 1 {
                matchedTracks.append(tracks[0])
                continue
            }

            // No match found
            unmatchedPaths.append(trackPath)
        }

        print("M3UParser: Matched \(matchedTracks.count) tracks, \(unmatchedPaths.count) unmatched")
        return (matchedTracks, unmatchedPaths)
    }
}
