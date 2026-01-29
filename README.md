# WebPod - iPod Web Manager

Manage your iPod's music library through a simple web interface.

## Quick Start

### 1. Download

Go to [Releases](../../releases) and download the file for your system:

| Your Computer | Download |
|---------------|----------|
| Windows | `libgpod-windows-x86_64-py3.12.tar.gz` |
| Mac (M1/M2/M3) | `libgpod-macos-arm64-py3.12.tar.gz` |
| Mac (Intel) | `libgpod-macos-x86_64-py3.12.tar.gz` |
| Linux (Ubuntu 24.04) | `libgpod-linux-x86_64-py3.12.tar.gz` |
| Linux (Ubuntu 22.04) | `libgpod-linux-x86_64-py3.10.tar.gz` |

### 2. Extract

**Windows:** Right-click the file → Extract All

**Mac:** Double-click the file

**Linux:** Double-click the file, or run `tar -xzf libgpod-*.tar.gz`

### 3. Run WebPod

Open a terminal/command prompt in the extracted folder and run:

```
python webpod/run.py
```

Your browser will open automatically to http://localhost:5000

### 4. Connect Your iPod

1. Plug in your iPod
2. Wait for it to appear in your file manager
3. Click "Detect iPod" in WebPod
4. Select your iPod and start managing your music!

---

## Troubleshooting

**"python" not found**
- Download Python from https://python.org
- Windows: Make sure to check "Add Python to PATH" during installation

**iPod not detected**
- Make sure your iPod shows up in File Explorer / Finder first
- Try unplugging and reconnecting

**Linux: Permission denied**
- Add yourself to the plugdev group: `sudo usermod -a -G plugdev $USER`
- Log out and back in

---

## For Developers

### About libgpod

libgpod is a library for reading and writing the iTunes database on iPods. It supports:
- All "classic" iPod models, iPod Nano, iPod Mini
- iPhone and iPod Touch (partial - requires iTunes-initialized database)
- Cover art and photos
- Playlists and track metadata

### Building from Source

```bash
# Install dependencies (Ubuntu)
sudo apt-get install libglib2.0-dev libsqlite3-dev libplist-dev \
    libgdk-pixbuf-2.0-dev libxml2-dev swig python3-dev

# Build
autoreconf -fi
./configure --with-python
make
make install
```

### Python API Example

```python
import gpod

# Open iPod database
db = gpod.Database('/path/to/ipod/mount')

# List all tracks
for track in db:
    print(f"{track.artist} - {track.title}")

# Add a track
track = db.new_Track()
track.copy_to_ipod('/path/to/song.mp3')
db.copy_delayed_files()
db.close()
```

### Documentation

- [README.overview](README.overview) - Architecture overview
- [README.SysInfo](README.SysInfo) - Device information
- [README.sqlite](README.sqlite) - SQLite database format

---

## License

libgpod is licensed under the LGPL. See COPYING for details.

## Credits

Originally part of [gtkpod](http://www.gtkpod.org). WebPod interface added for modern web-based iPod management.
