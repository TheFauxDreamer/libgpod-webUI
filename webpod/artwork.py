"""Extract and cache album artwork from audio files."""

import hashlib
import os
from pathlib import Path

from mutagen import File as MutagenFile
from mutagen.mp3 import MP3
from mutagen.mp4 import MP4

ARTWORK_CACHE_DIR = Path(__file__).parent / "artwork_cache"


def init_artwork_cache():
    """Create artwork cache directory if it doesn't exist."""
    ARTWORK_CACHE_DIR.mkdir(exist_ok=True)


def extract_artwork(file_path):
    """Extract artwork from an audio file.

    Returns (bytes, mime_type) or None if no artwork found.
    """
    try:
        audio = MutagenFile(file_path)
    except Exception:
        return None

    if audio is None:
        return None

    # MP3: check APIC frames (embedded pictures)
    if isinstance(audio, MP3) and audio.tags:
        for key in audio.tags:
            if key.startswith('APIC'):
                apic = audio.tags[key]
                return apic.data, apic.mime

    # MP4/M4A: check 'covr' atom
    if isinstance(audio, MP4) and audio.tags:
        covr = audio.tags.get('covr')
        if covr:
            return bytes(covr[0]), 'image/jpeg'

    # Fallback: folder.jpg in same directory
    folder_jpg = Path(file_path).parent / 'folder.jpg'
    if folder_jpg.exists():
        return folder_jpg.read_bytes(), 'image/jpeg'

    # Also check Folder.jpg, cover.jpg, Cover.jpg
    for name in ('Folder.jpg', 'cover.jpg', 'Cover.jpg', 'cover.png', 'Cover.png'):
        alt = Path(file_path).parent / name
        if alt.exists():
            mime = 'image/png' if name.endswith('.png') else 'image/jpeg'
            return alt.read_bytes(), mime

    return None


def cache_artwork(artwork_bytes):
    """Save artwork to disk cache. Returns the hash key for retrieval."""
    init_artwork_cache()
    h = hashlib.md5(artwork_bytes).hexdigest()
    path = ARTWORK_CACHE_DIR / f"{h}.jpg"
    if not path.exists():
        path.write_bytes(artwork_bytes)
    return h


def get_artwork_path(artwork_hash):
    """Get the filesystem path for a cached artwork by hash. Returns None if not found."""
    if not artwork_hash:
        return None
    path = ARTWORK_CACHE_DIR / f"{artwork_hash}.jpg"
    if path.exists():
        return str(path)
    return None


def extract_and_cache(file_path):
    """Extract artwork from file and cache it. Returns (has_artwork, artwork_hash)."""
    result = extract_artwork(file_path)
    if result:
        data, mime = result
        h = cache_artwork(data)
        return True, h
    return False, None
