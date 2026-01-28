"""Auto-detect mounted iPods across macOS, Linux, and Windows."""

import platform
from pathlib import Path


def detect_ipods():
    """Scan mounted volumes for iPods.

    Returns a list of dicts: [{"mountpoint": "/Volumes/IPOD", "name": "IPOD"}]
    """
    system = platform.system()
    if system == "Darwin":
        return _detect_macos()
    elif system == "Linux":
        return _detect_linux()
    elif system == "Windows":
        return _detect_windows()
    return []


def _detect_macos():
    """Scan /Volumes/ for iPod_Control directories."""
    ipods = []
    volumes = Path("/Volumes")
    if volumes.is_dir():
        for vol in volumes.iterdir():
            if vol.is_dir() and (vol / "iPod_Control").is_dir():
                ipods.append({
                    "mountpoint": str(vol),
                    "name": vol.name,
                })
    return ipods


def _detect_linux():
    """Scan common Linux mount points for iPod_Control."""
    ipods = []
    search_paths = []

    # /media/<user>/<device>
    media = Path("/media")
    if media.is_dir():
        for user_dir in media.iterdir():
            if user_dir.is_dir():
                for vol in user_dir.iterdir():
                    if vol.is_dir():
                        search_paths.append(vol)

    # /mnt/<device>
    mnt = Path("/mnt")
    if mnt.is_dir():
        for vol in mnt.iterdir():
            if vol.is_dir():
                search_paths.append(vol)

    # /run/media/<user>/<device>
    run_media = Path("/run/media")
    if run_media.is_dir():
        for user_dir in run_media.iterdir():
            if user_dir.is_dir():
                for vol in user_dir.iterdir():
                    if vol.is_dir():
                        search_paths.append(vol)

    for vol in search_paths:
        if (vol / "iPod_Control").is_dir():
            ipods.append({
                "mountpoint": str(vol),
                "name": vol.name,
            })
    return ipods


def _detect_windows():
    """Scan drive letters D-Z for iPod_Control."""
    ipods = []
    for letter in "DEFGHIJKLMNOPQRSTUVWXYZ":
        drive = Path(f"{letter}:\\")
        try:
            if drive.is_dir() and (drive / "iPod_Control").is_dir():
                ipods.append({
                    "mountpoint": str(drive),
                    "name": f"Drive {letter}:",
                })
        except OSError:
            continue
    return ipods
