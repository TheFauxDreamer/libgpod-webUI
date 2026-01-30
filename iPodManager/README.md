# iPod Manager

A native macOS application for managing iPod music libraries, built with Swift and SwiftUI.

## Requirements

- macOS 13.0+ (Ventura or later)
- Apple Silicon Mac (arm64)
- Xcode 15.0+
- Homebrew

## Setup Instructions

### 1. Install Dependencies

```bash
# Install required libraries
brew install glib libplist sqlite3

# Optional: for USB device support
brew install libimobiledevice libusb
```

### 2. Build libgpod (Already Done)

libgpod has been built and installed to `~/.local/`:
- Library: `~/.local/lib/libgpod.dylib`
- Headers: `~/.local/include/gpod-1.0/gpod/itdb.h`

To rebuild if needed:
```bash
cd /Users/paul/Documents/GitHub/libgpod
./autogen.sh
./configure --prefix=$HOME/.local CFLAGS="-arch arm64 -Wno-error" LDFLAGS="-arch arm64"
make && make install
```

### 3. Create Xcode Project

1. Open Xcode
2. File → New → Project
3. Choose "macOS" → "App"
4. Configure:
   - Product Name: **iPod Manager**
   - Team: Your team
   - Organization Identifier: Your identifier
   - Interface: **SwiftUI**
   - Language: **Swift**
   - Storage: None
   - Include Tests: Yes

5. Save the project in the `iPodManager` folder (alongside the existing Swift files)

### 4. Add Existing Files

1. In Xcode, right-click on the "iPod Manager" group
2. Select "Add Files to iPod Manager..."
3. Navigate to and select all folders:
   - `App/`
   - `Views/`
   - `ViewModels/`
   - `Models/`
   - `GPodKit/`
   - `Services/`
   - `Bridging/`
4. Ensure "Copy items if needed" is **unchecked**
5. Ensure "Create groups" is selected
6. Click Add

### 5. Configure Build Settings

In Xcode, select the project in the navigator, then the target:

**General Tab:**
- Minimum Deployments: macOS 13.0

**Build Settings Tab:**

Search for and set these values:

| Setting | Value |
|---------|-------|
| Architectures | arm64 |
| Header Search Paths | $(HOME)/.local/include/gpod-1.0 /opt/homebrew/include /opt/homebrew/include/glib-2.0 /opt/homebrew/lib/glib-2.0/include |
| Library Search Paths | $(HOME)/.local/lib /opt/homebrew/lib |
| Other Linker Flags | -lgpod -lglib-2.0 -lgobject-2.0 -lgmodule-2.0 -lplist-2.0 -lsqlite3 |
| Objective-C Bridging Header | iPodManager/Bridging/iPodManager-Bridging-Header.h |

### 6. Delete Template Files

Remove the auto-generated files that Xcode created:
- `ContentView.swift` (we have `MainView.swift`)
- `iPod_ManagerApp.swift` (we have `iPodManagerApp.swift`)

### 7. Build and Run

Press ⌘R to build and run the app.

## Project Structure

```
iPodManager/
├── App/                    # App entry point and delegate
├── Views/                  # SwiftUI views
│   ├── Sidebar/           # Sidebar components
│   ├── Content/           # Main content views
│   ├── Components/        # Reusable components
│   └── Dialogs/           # Modal dialogs
├── ViewModels/            # Observable view models
├── Models/                # Data models
├── GPodKit/               # libgpod C library wrappers
├── Services/              # Business logic services
├── Bridging/              # C bridging header
└── Resources/             # Assets and resources
```

## Development Notes

### GPodKit Layer

The `GPodKit/` folder contains Swift wrappers around the libgpod C library:

- `GLibHelpers.swift` - Helpers for GLib types (GList iteration, string conversion)
- `GPodDatabase.swift` - Wraps `Itdb_iTunesDB` for database operations
- `GPodTrack.swift` - Wraps `Itdb_Track` for track metadata
- `GPodPlaylist.swift` - Wraps `Itdb_Playlist` for playlist management
- `GPodDevice.swift` - Wraps `Itdb_Device` for device information

Currently, these wrappers have placeholder implementations. Once libgpod is properly linked, uncomment the actual C function calls.

### Enabling libgpod Integration

After the project builds successfully without libgpod:

1. libgpod is installed at `~/.local/lib/libgpod.dylib`
2. The bridging header imports gpod headers from `~/.local/include/gpod-1.0/gpod/itdb.h`
3. Uncomment the C function calls in the GPodKit files
4. The GLib type aliases in `GLibHelpers.swift` can be removed (they'll come from glib.h)

### Testing with an iPod

1. Connect an iPod Classic/Nano via USB
2. The iPod should mount at `/Volumes/[iPod Name]/`
3. The app detects iPods by looking for `iPod_Control/` directories

## License

This is part of the libgpod project. See the main repository for license information.
