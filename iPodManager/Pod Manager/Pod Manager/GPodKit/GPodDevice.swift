import Foundation

/// Swift wrapper for libgpod's Itdb_Device structure
/// Provides information about the connected iPod device
class GPodDevice {
    // Placeholder for actual Itdb_Device* pointer
    // private var device: UnsafeMutablePointer<Itdb_Device>?

    private var _mountpoint: String
    private var _modelNumber: String?
    private var _modelName: String?
    private var _generation: String?
    private var _capacityGB: Double = 0
    private var _serialNumber: String?
    private var _firmwareVersion: String?

    // MARK: - Properties

    var mountpoint: String { _mountpoint }
    var modelNumber: String? { _modelNumber }
    var modelName: String? { _modelName }
    var generation: String? { _generation }
    var capacityGB: Double { _capacityGB }
    var serialNumber: String? { _serialNumber }
    var firmwareVersion: String? { _firmwareVersion }

    // MARK: - Initialization

    /// Initialize from a mountpoint by reading device info
    init(mountpoint: String) {
        self._mountpoint = mountpoint
        loadDeviceInfo()
    }

    /// Initialize from a C Itdb_Device pointer
    /// init(pointer: UnsafeMutablePointer<Itdb_Device>) {
    ///     self.device = pointer
    ///     extractValues()
    /// }

    // MARK: - Device Info Loading

    private func loadDeviceInfo() {
        // Read SysInfo file
        let sysInfoPath = URL(fileURLWithPath: _mountpoint)
            .appendingPathComponent("iPod_Control")
            .appendingPathComponent("Device")
            .appendingPathComponent("SysInfo")

        if let contents = try? String(contentsOf: sysInfoPath, encoding: .utf8) {
            parseSysInfo(contents)
        }

        // Also try SysInfoExtended (plist format)
        let sysInfoExtPath = URL(fileURLWithPath: _mountpoint)
            .appendingPathComponent("iPod_Control")
            .appendingPathComponent("Device")
            .appendingPathComponent("SysInfoExtended")

        if let data = try? Data(contentsOf: sysInfoExtPath),
           let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any] {
            parseSysInfoExtended(plist)
        }
    }

    private func parseSysInfo(_ contents: String) {
        // SysInfo is a key: value format
        let lines = contents.components(separatedBy: .newlines)
        for line in lines {
            let parts = line.split(separator: ":", maxSplits: 1)
            guard parts.count == 2 else { continue }

            let key = parts[0].trimmingCharacters(in: .whitespaces)
            let value = parts[1].trimmingCharacters(in: .whitespaces)

            switch key {
            case "ModelNumStr":
                _modelNumber = value
            case "Serial Number", "pSerialNumber":
                _serialNumber = value
            case "visibleBuildID":
                _firmwareVersion = value
            default:
                break
            }
        }
    }

    private func parseSysInfoExtended(_ plist: [String: Any]) {
        if let modelNum = plist["ModelNumStr"] as? String {
            _modelNumber = modelNum
        }
        if let serial = plist["SerialNumber"] as? String {
            _serialNumber = serial
        }
        if let firmware = plist["VisibleBuildID"] as? String {
            _firmwareVersion = firmware
        }

        // Decode model number to get generation and name
        if let modelNum = _modelNumber {
            decodeModelNumber(modelNum)
        }
    }

    private func decodeModelNumber(_ modelNumber: String) {
        // Common iPod model numbers
        // This is a subset - full list in libgpod's itdb_device.c
        let modelInfo: [String: (name: String, generation: String, capacityGB: Double)] = [
            // iPod Classic
            "MA002": ("iPod", "5th Gen", 30),
            "MA003": ("iPod", "5th Gen", 60),
            "MA446": ("iPod", "5.5 Gen", 30),
            "MA448": ("iPod", "5.5 Gen", 80),
            "MB029": ("iPod Classic", "6th Gen", 80),
            "MB147": ("iPod Classic", "6th Gen", 160),
            "MB562": ("iPod Classic", "6th Gen", 120),
            "MC293": ("iPod Classic", "6th Gen", 160),
            "MC297": ("iPod Classic", "6th Gen", 160),

            // iPod Nano
            "MA004": ("iPod Nano", "1st Gen", 1),
            "MA005": ("iPod Nano", "1st Gen", 2),
            "MA099": ("iPod Nano", "1st Gen", 4),
            "MA477": ("iPod Nano", "2nd Gen", 2),
            "MA478": ("iPod Nano", "2nd Gen", 4),
            "MA497": ("iPod Nano", "2nd Gen", 8),
            "MB261": ("iPod Nano", "3rd Gen", 4),
            "MB249": ("iPod Nano", "3rd Gen", 8),
            "MB754": ("iPod Nano", "4th Gen", 8),
            "MB748": ("iPod Nano", "4th Gen", 16),

            // iPod Shuffle
            "MA564": ("iPod Shuffle", "2nd Gen", 1),
            "MB226": ("iPod Shuffle", "2nd Gen", 2),
            "MB518": ("iPod Shuffle", "3rd Gen", 4),
            "MC584": ("iPod Shuffle", "4th Gen", 2),

            // iPod Mini
            "M9800": ("iPod Mini", "1st Gen", 4),
            "M9801": ("iPod Mini", "1st Gen", 4),
            "M9802": ("iPod Mini", "1st Gen", 4),
            "M9803": ("iPod Mini", "1st Gen", 4),
            "M9804": ("iPod Mini", "1st Gen", 4),
            "M9436": ("iPod Mini", "2nd Gen", 4),
            "M9437": ("iPod Mini", "2nd Gen", 6),
        ]

        // Try to match the model number (first 5 characters)
        let prefix = String(modelNumber.prefix(5))
        if let info = modelInfo[prefix] {
            _modelName = info.name
            _generation = info.generation
            _capacityGB = info.capacityGB
        } else {
            _modelName = "iPod"
            _generation = "Unknown"
        }
    }

    // MARK: - Computed Properties

    var displayName: String {
        if let model = modelName, let gen = generation {
            return "\(model) (\(gen))"
        }
        return "iPod"
    }

    var capacityString: String {
        if capacityGB >= 1 {
            return "\(Int(capacityGB)) GB"
        } else if capacityGB > 0 {
            return "\(Int(capacityGB * 1024)) MB"
        }
        return "Unknown"
    }
}
