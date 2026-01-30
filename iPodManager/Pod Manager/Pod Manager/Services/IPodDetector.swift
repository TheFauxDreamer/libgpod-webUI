import Foundation

struct IPodDetector {
    /// Detect iPods mounted on macOS by looking for iPod_Control directories
    static func detect() -> [IPodDevice] {
        var devices: [IPodDevice] = []

        let volumesURL = URL(fileURLWithPath: "/Volumes")
        let fileManager = FileManager.default

        do {
            let volumes = try fileManager.contentsOfDirectory(
                at: volumesURL,
                includingPropertiesForKeys: [.isDirectoryKey],
                options: [.skipsHiddenFiles]
            )

            for volume in volumes {
                let ipodControlPath = volume.appendingPathComponent("iPod_Control")
                var isDirectory: ObjCBool = false

                if fileManager.fileExists(atPath: ipodControlPath.path, isDirectory: &isDirectory),
                   isDirectory.boolValue {
                    // This looks like an iPod
                    let deviceName = getDeviceName(at: volume.path)
                    devices.append(IPodDevice(
                        mountpoint: volume.path,
                        name: deviceName
                    ))
                }
            }
        } catch {
            print("Error scanning /Volumes: \(error)")
        }

        return devices
    }

    /// Try to get the device name from SysInfoExtended or fallback to volume name
    private static func getDeviceName(at mountpoint: String) -> String? {
        let sysInfoPath = URL(fileURLWithPath: mountpoint)
            .appendingPathComponent("iPod_Control")
            .appendingPathComponent("Device")
            .appendingPathComponent("SysInfoExtended")

        if let data = try? Data(contentsOf: sysInfoPath),
           let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
           let deviceName = plist["UserVisibleName"] as? String {
            return deviceName
        }

        // Fallback to volume name
        return URL(fileURLWithPath: mountpoint).lastPathComponent
    }
}
