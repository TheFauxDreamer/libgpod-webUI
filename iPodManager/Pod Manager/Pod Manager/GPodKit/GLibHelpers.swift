import Foundation

// MARK: - GLib Type Aliases (for when bridging header is configured)

// These will be available once the bridging header is set up
// For now, define placeholder types to allow compilation without libgpod

#if canImport(glib)
// GLib is available through bridging header
#else
// Placeholder types for development without libgpod installed
typealias gpointer = UnsafeMutableRawPointer
typealias gconstpointer = UnsafeRawPointer
typealias gchar = CChar
typealias guint32 = UInt32
typealias guint64 = UInt64
typealias gint32 = Int32
typealias gboolean = Int32

struct GList {
    var data: gpointer?
    var next: UnsafeMutablePointer<GList>?
    var prev: UnsafeMutablePointer<GList>?
}
#endif

// MARK: - GList Iteration Helpers

/// Iterator for safely traversing GLib linked lists
struct GListIterator<T>: IteratorProtocol {
    private var current: UnsafeMutablePointer<GList>?
    private let transform: (gpointer) -> T?

    init(list: UnsafeMutablePointer<GList>?, transform: @escaping (gpointer) -> T?) {
        self.current = list
        self.transform = transform
    }

    mutating func next() -> T? {
        guard let node = current else { return nil }
        defer { current = node.pointee.next }

        guard let data = node.pointee.data else { return nil }
        return transform(data)
    }
}

/// Sequence wrapper for GLib linked lists
struct GListSequence<T>: Sequence {
    private let list: UnsafeMutablePointer<GList>?
    private let transform: (gpointer) -> T?

    init(list: UnsafeMutablePointer<GList>?, transform: @escaping (gpointer) -> T?) {
        self.list = list
        self.transform = transform
    }

    func makeIterator() -> GListIterator<T> {
        return GListIterator(list: list, transform: transform)
    }

    var count: Int {
        var count = 0
        var current = list
        while current != nil {
            count += 1
            current = current?.pointee.next
        }
        return count
    }
}

// MARK: - String Conversion Helpers

extension String {
    /// Create a Swift String from a gchar pointer (C string)
    init?(gchar pointer: UnsafePointer<gchar>?) {
        guard let pointer = pointer else { return nil }
        self = String(cString: pointer)
    }

    /// Create a Swift String from a gchar pointer, with a fallback value
    init(gchar pointer: UnsafePointer<gchar>?, default defaultValue: String) {
        if let pointer = pointer {
            self = String(cString: pointer)
        } else {
            self = defaultValue
        }
    }

    /// Execute a closure with this string as a C string, ensuring proper memory management
    func withGChar<T>(_ body: (UnsafePointer<gchar>) throws -> T) rethrows -> T {
        return try self.withCString { cString in
            return try body(cString)
        }
    }
}

// MARK: - Memory Management Helpers

/// RAII-style wrapper for gchar* strings that need to be freed
class GCharString {
    private let pointer: UnsafeMutablePointer<gchar>?

    init(_ pointer: UnsafeMutablePointer<gchar>?) {
        self.pointer = pointer
    }

    deinit {
        // Will call g_free when libgpod is linked
        // g_free(pointer)
    }

    var string: String? {
        guard let pointer = pointer else { return nil }
        return String(cString: pointer)
    }
}

// MARK: - Date Conversion

extension Date {
    /// Create a Date from a Unix timestamp (time_t)
    init?(unixTimestamp: Int) {
        guard unixTimestamp > 0 else { return nil }
        self = Date(timeIntervalSince1970: TimeInterval(unixTimestamp))
    }

    /// Convert to Unix timestamp
    var unixTimestamp: Int {
        return Int(timeIntervalSince1970)
    }

    /// Create a Date from a Mac HFS+ timestamp (seconds since Jan 1, 1904)
    init?(macTimestamp: UInt32) {
        guard macTimestamp > 0 else { return nil }
        // Mac epoch is Jan 1, 1904; Unix epoch is Jan 1, 1970
        // Difference is 2082844800 seconds
        let unixTime = TimeInterval(macTimestamp) - 2082844800
        self = Date(timeIntervalSince1970: unixTime)
    }
}
