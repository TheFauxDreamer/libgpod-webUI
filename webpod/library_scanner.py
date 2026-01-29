"""Scan a local directory for audio files and extract metadata."""

import os
from pathlib import Path

from mutagen import File as MutagenFile
from mutagen.mp3 import MP3
from mutagen.mp4 import MP4

from . import models
from . import artwork as artwork_module
from .duplicate_detector import sha1_hash

SUPPORTED_EXTENSIONS = {'.mp3', '.m4a', '.aac', '.mp4'}


def _extract_metadata(file_path):
    """Extract metadata from an audio file using mutagen.

    Returns a dict of metadata fields, or None if the file can't be parsed.
    """
    try:
        audio = MutagenFile(file_path)
    except Exception:
        return None

    if audio is None:
        return None

    meta = {
        'title': None,
        'artist': None,
        'album': None,
        'album_artist': None,
        'genre': None,
        'track_nr': None,
        'cd_nr': None,
        'year': None,
        'duration_ms': None,
        'bitrate': None,
    }

    # Duration (available on all formats)
    if audio.info:
        if hasattr(audio.info, 'length') and audio.info.length:
            meta['duration_ms'] = int(audio.info.length * 1000)
        if hasattr(audio.info, 'bitrate') and audio.info.bitrate:
            meta['bitrate'] = audio.info.bitrate // 1000  # kbps

    if isinstance(audio, MP3) and audio.tags:
        # ID3 frames
        tag_map = {
            'TPE1': 'artist',
            'TIT2': 'title',
            'TALB': 'album',
            'TPE2': 'album_artist',
            'TCON': 'genre',
        }
        for frame_id, field in tag_map.items():
            frame = audio.tags.get(frame_id)
            if frame and frame.text:
                meta[field] = str(frame.text[0])

        # Track number (e.g., "3/12")
        trck = audio.tags.get('TRCK')
        if trck and trck.text:
            parts = str(trck.text[0]).split('/')
            try:
                meta['track_nr'] = int(parts[0])
            except ValueError:
                pass

        # Disc number
        tpos = audio.tags.get('TPOS')
        if tpos and tpos.text:
            parts = str(tpos.text[0]).split('/')
            try:
                meta['cd_nr'] = int(parts[0])
            except ValueError:
                pass

        # Year
        tdrc = audio.tags.get('TDRC')
        if tdrc and tdrc.text:
            try:
                meta['year'] = int(str(tdrc.text[0])[:4])
            except (ValueError, IndexError):
                pass

    elif isinstance(audio, MP4) and audio.tags:
        # MP4 atoms
        atom_map = {
            '\xa9ART': 'artist',
            '\xa9nam': 'title',
            '\xa9alb': 'album',
            'aART': 'album_artist',
            '\xa9gen': 'genre',
        }
        for atom, field in atom_map.items():
            val = audio.tags.get(atom)
            if val:
                meta[field] = str(val[0])

        # Track number tuple (track_nr, total)
        trkn = audio.tags.get('trkn')
        if trkn:
            meta['track_nr'] = trkn[0][0]

        # Disc number tuple
        disk = audio.tags.get('disk')
        if disk:
            meta['cd_nr'] = disk[0][0]

        # Year
        day = audio.tags.get('\xa9day')
        if day:
            try:
                meta['year'] = int(str(day[0])[:4])
            except (ValueError, IndexError):
                pass

    # Fallback title to filename
    if not meta['title']:
        meta['title'] = Path(file_path).stem

    return meta


def scan_directory(library_path, progress_callback=None, is_podcast=False):
    """Scan a directory for audio files and store metadata in the database.

    Args:
        library_path: Root directory to scan
        progress_callback: Optional function(scanned, total, current_file)
        is_podcast: If True, mark scanned tracks as podcasts
    """
    library_path = Path(library_path)
    if not library_path.is_dir():
        raise ValueError(f"Not a directory: {library_path}")

    # First pass: collect all audio files
    audio_files = []
    for root, dirs, files in os.walk(library_path):
        for fname in files:
            if Path(fname).suffix.lower() in SUPPORTED_EXTENSIONS:
                audio_files.append(Path(root) / fname)

    total = len(audio_files)
    scanned = 0

    for file_path in audio_files:
        scanned += 1
        file_str = str(file_path)

        # Incremental scan: skip unchanged files
        try:
            mtime = os.stat(file_str).st_mtime
        except OSError:
            continue

        cached_mtime = models.get_cached_mtime(file_str)
        if cached_mtime is not None and abs(cached_mtime - mtime) < 0.01:
            if progress_callback and scanned % 10 == 0:
                progress_callback(scanned, total, file_str)
            continue

        # Extract metadata
        meta = _extract_metadata(file_str)
        if meta is None:
            continue

        # Compute hash for duplicate detection
        try:
            file_hash = sha1_hash(file_str)
        except OSError:
            continue

        # Extract and cache artwork
        has_art, art_hash = artwork_module.extract_and_cache(file_str)

        # Store in database
        track_data = {
            'file_path': file_str,
            'file_mtime': mtime,
            'sha1_hash': file_hash,
            'has_artwork': 1 if has_art else 0,
            'artwork_hash': art_hash,
            'is_podcast': 1 if is_podcast else 0,
            **meta,
        }
        models.upsert_track(track_data)

        if progress_callback and scanned % 10 == 0:
            progress_callback(scanned, total, file_str)

    # Clean up files that no longer exist
    models.remove_missing_files()

    if progress_callback:
        progress_callback(total, total, "Done")
