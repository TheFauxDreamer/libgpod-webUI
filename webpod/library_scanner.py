"""Scan a local directory for audio files and extract metadata."""

import os
from pathlib import Path

from mutagen import File as MutagenFile
from mutagen.mp3 import MP3
from mutagen.mp4 import MP4
from mutagen.flac import FLAC
from mutagen.wave import WAVE

from . import models
from . import artwork as artwork_module
from .duplicate_detector import sha1_hash

SUPPORTED_EXTENSIONS = {'.mp3', '.m4a', '.aac', '.mp4', '.flac', '.wav'}
VIDEO_EXTENSIONS = {'.m4v', '.mov'}


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

    elif isinstance(audio, FLAC) and audio.tags:
        # Vorbis comments
        tag_map = {
            'artist': 'artist',
            'title': 'title',
            'album': 'album',
            'albumartist': 'album_artist',
            'genre': 'genre',
        }
        for tag, field in tag_map.items():
            val = audio.tags.get(tag)
            if val:
                meta[field] = str(val[0])

        # Track number
        tracknumber = audio.tags.get('tracknumber')
        if tracknumber:
            parts = str(tracknumber[0]).split('/')
            try:
                meta['track_nr'] = int(parts[0])
            except ValueError:
                pass

        # Disc number
        discnumber = audio.tags.get('discnumber')
        if discnumber:
            parts = str(discnumber[0]).split('/')
            try:
                meta['cd_nr'] = int(parts[0])
            except ValueError:
                pass

        # Year
        date = audio.tags.get('date')
        if date:
            try:
                meta['year'] = int(str(date[0])[:4])
            except (ValueError, IndexError):
                pass

    elif isinstance(audio, WAVE):
        # WAV files can have ID3 tags or INFO tags
        if audio.tags:
            # Check for ID3 tags first (more common)
            # ID3 tags in WAV files use the same structure as MP3
            tag_map = {
                'TPE1': 'artist',
                'TIT2': 'title',
                'TALB': 'album',
                'TPE2': 'album_artist',
                'TCON': 'genre',
            }
            for frame_id, field in tag_map.items():
                frame = audio.tags.get(frame_id)
                if frame and hasattr(frame, 'text') and frame.text:
                    meta[field] = str(frame.text[0])

            # Track number
            trck = audio.tags.get('TRCK')
            if trck and hasattr(trck, 'text') and trck.text:
                parts = str(trck.text[0]).split('/')
                try:
                    meta['track_nr'] = int(parts[0])
                except ValueError:
                    pass

            # Disc number
            tpos = audio.tags.get('TPOS')
            if tpos and hasattr(tpos, 'text') and tpos.text:
                parts = str(tpos.text[0]).split('/')
                try:
                    meta['cd_nr'] = int(parts[0])
                except ValueError:
                    pass

            # Year
            tdrc = audio.tags.get('TDRC')
            if tdrc and hasattr(tdrc, 'text') and tdrc.text:
                try:
                    meta['year'] = int(str(tdrc.text[0])[:4])
                except (ValueError, IndexError):
                    pass

        # Check for INFO tags (older RIFF INFO format)
        # INFO tags are stored as dictionary-like attributes
        if hasattr(audio, 'info') and hasattr(audio.info, 'tags'):
            info_tags = audio.info.tags
            if info_tags:
                info_map = {
                    'INAM': 'title',      # Title
                    'IART': 'artist',     # Artist
                    'IPRD': 'album',      # Album (Product)
                    'IGNR': 'genre',      # Genre
                }
                for info_key, field in info_map.items():
                    val = info_tags.get(info_key)
                    if val and not meta[field]:  # Don't override ID3 tags
                        meta[field] = str(val)

    # Fallback title to filename
    if not meta['title']:
        meta['title'] = Path(file_path).stem

    return meta


def process_single_file(file_path, is_podcast=False, is_video=False):
    """Process a single audio/video file: extract metadata, hash, artwork, store in DB.

    Args:
        file_path: Path to the audio/video file.
        is_podcast: If True, mark the track as a podcast.
        is_video: If True, mark the track as a video.

    Returns:
        dict with 'status' ('added', 'skipped', 'error') and optional 'track_data' or 'reason'.
    """
    file_str = str(file_path)

    try:
        mtime = os.stat(file_str).st_mtime
    except OSError:
        return {'status': 'error', 'reason': 'File not accessible'}

    # Extract metadata
    meta = _extract_metadata(file_str)
    if meta is None:
        return {'status': 'error', 'reason': 'Cannot parse audio file'}

    # Check if file has meaningful metadata (beyond just filename/duration)
    has_metadata = bool(
        meta.get('artist') or
        meta.get('album') or
        meta.get('album_artist') or
        meta.get('genre') or
        meta.get('year') or
        meta.get('track_nr')
    )

    # If no metadata, check user setting (podcasts are always allowed through)
    if not has_metadata and not is_podcast:
        allow_no_metadata = models.get_setting('allow_files_without_metadata')
        if allow_no_metadata != '1':
            return {'status': 'skipped', 'reason': 'No metadata'}

    # Compute hash for duplicate detection
    try:
        file_hash = sha1_hash(file_str)
    except OSError:
        return {'status': 'error', 'reason': 'Cannot read file for hashing'}

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
        'is_video': 1 if is_video else 0,
        **meta,
    }
    models.upsert_track(track_data)

    return {'status': 'added', 'track_data': track_data}


def scan_directory(library_path, progress_callback=None, is_podcast=False, is_video=False):
    """Scan a directory for audio/video files and store metadata in the database.

    Args:
        library_path: Root directory to scan
        progress_callback: Optional function(scanned, total, current_file)
        is_podcast: If True, mark scanned tracks as podcasts
        is_video: If True, mark scanned tracks as videos
    """
    library_path = Path(library_path)
    if not library_path.is_dir():
        raise ValueError(f"Not a directory: {library_path}")

    # Choose extensions based on scan type
    extensions = VIDEO_EXTENSIONS if is_video else SUPPORTED_EXTENSIONS

    # First pass: collect all media files
    audio_files = []
    for root, dirs, files in os.walk(library_path):
        for fname in files:
            if Path(fname).suffix.lower() in extensions:
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

        process_single_file(file_path, is_podcast=is_podcast, is_video=is_video)

        if progress_callback and scanned % 10 == 0:
            progress_callback(scanned, total, file_str)

    # Clean up files that no longer exist
    models.remove_missing_files()

    # Clean up files without metadata if setting is disabled
    removed_count = models.remove_files_without_metadata_if_disabled()
    if removed_count > 0 and progress_callback:
        # Notify about cleanup
        progress_callback(total, total, f"Removed {removed_count} files without metadata")

    if progress_callback:
        progress_callback(total, total, "Done")
