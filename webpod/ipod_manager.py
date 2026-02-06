"""Wrapper around gpod.Database for iPod operations.

This module manages the iPod database connection lifecycle and provides
thread-safe methods for all iPod operations used by the web interface.
"""

import os
import re
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

try:
    import gpod
except ImportError:
    gpod = None

from .duplicate_detector import sha1_hash
from .artwork import get_artwork_path
from . import models


def transcode_flac_to_alac(flac_path, target_format='alac'):
    """Transcode a FLAC file to ALAC (or MP3) using ffmpeg.

    Args:
        flac_path: Path to the FLAC file
        target_format: 'alac' (default) or 'mp3'

    Returns:
        Path to the transcoded temporary file, or None if transcoding failed
    """
    # Check if ffmpeg is available
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("ERROR: ffmpeg not found. Install with: brew install ffmpeg (macOS) or apt-get install ffmpeg (Linux)")
        return None

    # Create temp file with appropriate extension
    ext = '.m4a' if target_format == 'alac' else '.mp3'
    temp_fd, temp_path = tempfile.mkstemp(suffix=ext, prefix='webpod_transcode_')
    os.close(temp_fd)  # Close file descriptor, ffmpeg will open it

    try:
        if target_format == 'alac':
            # Transcode to ALAC (Apple Lossless) in M4A container
            # -acodec alac: Use ALAC codec
            # -map_metadata 0: Copy all metadata from source
            cmd = [
                'ffmpeg',
                '-i', flac_path,
                '-acodec', 'alac',
                '-map_metadata', '0',
                '-y',  # Overwrite output file
                temp_path
            ]
        else:
            # Transcode to MP3
            # -b:a 320k: High quality MP3 (320 kbps)
            # -map_metadata 0: Copy all metadata
            cmd = [
                'ffmpeg',
                '-i', flac_path,
                '-b:a', '320k',
                '-map_metadata', '0',
                '-y',
                temp_path
            ]

        # Run ffmpeg (capture output for error handling)
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout for large files
        )

        if result.returncode != 0:
            print(f"ERROR: ffmpeg transcoding failed: {result.stderr}")
            os.unlink(temp_path)
            return None

        return temp_path

    except subprocess.TimeoutExpired:
        print(f"ERROR: ffmpeg transcoding timed out for {flac_path}")
        os.unlink(temp_path)
        return None
    except Exception as e:
        print(f"ERROR: Transcoding failed: {e}")
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        return None


class IPodError(Exception):
    """Exception for iPod operation errors."""
    pass


class IPodManager:
    """Thread-safe singleton manager for iPod database operations."""

    def __init__(self):
        self._db = None
        self._mountpoint = None
        self._lock = threading.Lock()

    @property
    def connected(self):
        return self._db is not None

    @property
    def mountpoint(self):
        return self._mountpoint

    def connect(self, mountpoint):
        """Connect to an iPod at the given mount point."""
        if gpod is None:
            raise IPodError("libgpod Python bindings not available. "
                            "Please install libgpod with Python support.")
        with self._lock:
            if self._db is not None:
                raise IPodError("Already connected to an iPod. Disconnect first.")
            try:
                self._db = gpod.Database(mountpoint)
            except Exception as e:
                raise IPodError(f"Failed to connect to iPod at {mountpoint}: {e}")
            self._mountpoint = mountpoint

    def disconnect(self):
        """Sync pending files, save database, and disconnect."""
        with self._lock:
            self._require_connected()
            try:
                self._db.copy_delayed_files()
                self._db.close()
            except Exception as e:
                raise IPodError(f"Error during disconnect: {e}")
            finally:
                self._db = None
                self._mountpoint = None

    def get_status(self):
        """Get iPod connection status."""
        with self._lock:
            if not self.connected:
                return {"connected": False}
            # Extract name from mountpoint (last component of path)
            name = os.path.basename(self._mountpoint.rstrip('/')) or 'iPod'
            return {
                "connected": True,
                "mountpoint": self._mountpoint,
                "name": name,
                "track_count": len(self._db),
            }

    def get_tracks(self):
        """Get all tracks on the iPod as a list of dicts."""
        with self._lock:
            self._require_connected()
            tracks = []
            for i in range(len(self._db)):
                track = self._db[i]
                tracks.append(self._track_to_dict(track))
            return tracks

    def get_playlists(self):
        """Get all playlists on the iPod."""
        with self._lock:
            self._require_connected()
            playlists = []
            for i in range(len(self._db.Playlists)):
                pl = self._db.Playlists[i]
                playlists.append({
                    "id": pl.id,
                    "name": pl.name,
                    "smart": pl.smart,
                    "master": pl.master,
                    "podcast": pl.podcast,
                    "track_count": len(pl),
                })
            return playlists

    def get_playlist_tracks(self, playlist_id):
        """Get tracks in a specific playlist."""
        with self._lock:
            self._require_connected()
            pl = self._find_playlist(playlist_id)
            tracks = []
            for i in range(len(pl)):
                tracks.append(self._track_to_dict(pl[i]))
            return tracks

    def get_albums(self):
        """Get all albums on the iPod, grouped by album name and artist.

        Returns:
            List of dicts with album, artist, track_count, year
        """
        with self._lock:
            self._require_connected()
            albums = {}
            for i in range(len(self._db)):
                track = self._db[i]
                album_name = track['album'] or 'Unknown Album'
                artist = track['artist'] or 'Unknown Artist'
                key = f"{album_name}|||{artist}"

                if key not in albums:
                    albums[key] = {
                        'album': album_name,
                        'artist': artist,
                        'track_count': 0,
                        'year': track['year'],
                    }
                albums[key]['track_count'] += 1

            # Sort by artist, then album name
            return sorted(albums.values(), key=lambda x: (x['artist'].lower(), x['album'].lower()))

    def get_artists(self):
        """Get all artists on the iPod with album and track counts.

        Returns:
            List of dicts with name, album_count, track_count
        """
        with self._lock:
            self._require_connected()
            artists = {}
            for i in range(len(self._db)):
                track = self._db[i]
                artist = track['artist'] or 'Unknown Artist'
                album = track['album'] or 'Unknown Album'

                if artist not in artists:
                    artists[artist] = {
                        'name': artist,
                        'album_count': 0,
                        'track_count': 0,
                        'albums': set()
                    }
                artists[artist]['track_count'] += 1
                artists[artist]['albums'].add(album)

            # Convert album sets to counts
            result = []
            for artist in artists.values():
                result.append({
                    'name': artist['name'],
                    'album_count': len(artist['albums']),
                    'track_count': artist['track_count'],
                })

            return sorted(result, key=lambda x: x['name'].lower())

    def get_genres(self):
        """Get all genres on the iPod with track counts.

        Returns:
            List of dicts with name, track_count
        """
        with self._lock:
            self._require_connected()
            genres = {}
            for i in range(len(self._db)):
                track = self._db[i]
                genre = track['genre'] or 'Unknown'

                if genre not in genres:
                    genres[genre] = {
                        'name': genre,
                        'track_count': 0
                    }
                genres[genre]['track_count'] += 1

            return sorted(genres.values(), key=lambda x: x['name'].lower())

    def get_album_tracks(self, album_name, artist=None):
        """Get all tracks for a specific album on the iPod.

        Args:
            album_name: Album name to match
            artist: Optional artist name for disambiguation

        Returns:
            List of track dicts sorted by disc/track number
        """
        with self._lock:
            self._require_connected()
            tracks = []
            for i in range(len(self._db)):
                track = self._db[i]
                track_album = track['album'] or 'Unknown Album'
                if track_album == album_name:
                    # If artist specified, also match artist
                    if artist is not None:
                        track_artist = track['artist'] or 'Unknown Artist'
                        if track_artist != artist:
                            continue
                    tracks.append(self._track_to_dict(track))

            # Sort by disc number, then track number
            tracks.sort(key=lambda t: (t.get('cd_nr') or 1, t.get('track_nr') or 0))
            return tracks

    def get_storage_info(self):
        """Get iPod storage capacity and usage.

        Returns:
            Dict with total_bytes, used_bytes, free_bytes, and formatted GB values
        """
        with self._lock:
            self._require_connected()

            try:
                usage = shutil.disk_usage(self._mountpoint)
                return {
                    'total_bytes': usage.total,
                    'used_bytes': usage.used,
                    'free_bytes': usage.free,
                    'total_gb': round(usage.total / (1024**3), 1),
                    'used_gb': round(usage.used / (1024**3), 1),
                    'free_gb': round(usage.free / (1024**3), 1),
                    'percent_used': round((usage.used / usage.total) * 100, 1)
                }
            except Exception as e:
                return {
                    'total_bytes': 0,
                    'used_bytes': 0,
                    'free_bytes': 0,
                    'total_gb': 0,
                    'used_gb': 0,
                    'free_gb': 0,
                    'percent_used': 0,
                    'error': str(e)
                }

    def get_device_info(self):
        """Get iPod device model and generation info.

        Returns:
            Dict with model, generation, capacity, model_string, generation_string
        """
        with self._lock:
            self._require_connected()

            try:
                device = self._db._itdb.device
                info = gpod.itdb_device_get_ipod_info(device)

                if info:
                    # Check video support
                    try:
                        video_support = gpod.itdb_device_supports_video(device)
                    except Exception:
                        video_support = False

                    return {
                        'model': info.ipod_model,
                        'generation': info.ipod_generation,
                        'capacity': info.capacity,
                        'model_string': gpod.itdb_info_get_ipod_model_name_string(info.ipod_model),
                        'generation_string': gpod.itdb_info_get_ipod_generation_string(info.ipod_generation),
                        'supports_video': video_support,
                    }
            except Exception:
                pass

            return {
                'model': 'unknown',
                'generation': 'unknown',
                'capacity': 0,
                'model_string': 'Unknown iPod',
                'generation_string': 'Unknown',
                'supports_video': False,
            }

    def supports_video(self):
        """Check if the connected iPod supports video playback.

        Returns:
            bool: True if iPod supports video, False otherwise
        """
        with self._lock:
            self._require_connected()

            try:
                device = self._db._itdb.device
                return gpod.itdb_device_supports_video(device)
            except Exception:
                return False

    def create_playlist(self, name):
        """Create a new playlist on the iPod."""
        with self._lock:
            self._require_connected()
            pl = self._db.new_Playlist(title=name)
            return {
                "id": pl.id,
                "name": pl.name,
                "smart": pl.smart,
                "master": pl.master,
                "podcast": pl.podcast,
                "track_count": 0,
            }

    def rename_playlist(self, playlist_id, new_name):
        """Rename a playlist."""
        with self._lock:
            self._require_connected()
            pl = self._find_playlist(playlist_id)
            if pl.master:
                raise IPodError("Cannot rename the master playlist")
            pl.name = new_name
            return {"id": pl.id, "name": pl.name}

    def delete_playlist(self, playlist_id):
        """Delete a playlist (does not remove its tracks from iPod)."""
        with self._lock:
            self._require_connected()
            pl = self._find_playlist(playlist_id)
            if pl.master:
                raise IPodError("Cannot delete the master playlist")
            self._db.remove(pl)

    def add_tracks(self, library_tracks, playlist_id=None):
        """Add tracks from the local library to the iPod.

        Args:
            library_tracks: List of dicts from models.py with file_path, sha1_hash, artwork_hash
            playlist_id: Optional playlist ID to add tracks to

        Returns:
            dict with 'added', 'skipped_duplicates', 'errors' lists
        """
        with self._lock:
            self._require_connected()

            # Check if any tracks are videos and if iPod supports video
            has_videos = any(t.get('is_video') for t in library_tracks)
            if has_videos:
                try:
                    device = self._db._itdb.device
                    video_support = gpod.itdb_device_supports_video(device)
                except Exception:
                    video_support = False

                if not video_support:
                    raise IPodError(
                        "This iPod does not support video playback. "
                        "Video-capable models: iPod Video (5G), Classic, Nano 3-5G, and iPod Touch."
                    )

            # Collect existing hashes from iPod for duplicate detection
            existing_hashes = set()
            for i in range(len(self._db)):
                track = self._db[i]
                try:
                    ud = track['userdata']
                    if ud and 'sha1_hash' in ud:
                        existing_hashes.add(ud['sha1_hash'])
                except (KeyError, TypeError):
                    pass

            # Find the target playlist
            target_pl = None
            if playlist_id is not None:
                target_pl = self._find_playlist(playlist_id)

            added = []
            skipped = []
            errors = []
            transcoded_temp_files = []  # Track temp files for cleanup

            for lib_track in library_tracks:
                file_path = lib_track['file_path']
                track_hash = lib_track.get('sha1_hash', '')

                # Duplicate detection
                if track_hash in existing_hashes:
                    skipped.append({
                        'file_path': file_path,
                        'title': lib_track.get('title', ''),
                        'artist': lib_track.get('artist', ''),
                        'reason': 'Already on iPod',
                    })
                    continue

                # Check if transcoding is needed
                original_path = file_path
                is_flac = Path(file_path).suffix.lower() == '.flac'

                if is_flac:
                    # Check user settings
                    transcode_flac = models.get_setting('transcode_flac_to_ipod')
                    transcode_format = models.get_setting('transcode_flac_format') or 'alac'

                    # Default: enable transcoding for FLAC files (they won't work otherwise)
                    if transcode_flac != '0':  # '1' or None (not set) = enable
                        print(f"Transcoding FLAC file: {Path(file_path).name}")
                        transcoded_path = transcode_flac_to_alac(file_path, target_format=transcode_format)

                        if transcoded_path:
                            file_path = transcoded_path
                            transcoded_temp_files.append(transcoded_path)
                            print(f"Transcoded to: {Path(transcoded_path).name}")
                        else:
                            print(f"WARNING: Transcoding failed for {Path(file_path).name}, skipping file")
                            errors.append({
                                'file_path': original_path,
                                'title': lib_track.get('title', ''),
                                'error': 'Transcoding failed',
                            })
                            continue  # Skip this file if transcoding fails

                try:
                    # Create track on iPod (extracts ID3 tags automatically)
                    ipod_track = self._db.new_Track(filename=file_path)

                    # Set media type for video tracks
                    if lib_track.get('is_video'):
                        ipod_track['mediatype'] = gpod.ITDB_MEDIATYPE_MOVIE

                    # Set artwork from cache if available
                    art_path = get_artwork_path(lib_track.get('artwork_hash'))
                    if art_path:
                        try:
                            ipod_track.set_coverart_from_file(art_path)
                        except Exception:
                            pass  # Non-fatal: track works without artwork

                    # Add to target playlist
                    if target_pl is not None:
                        target_pl.add(ipod_track)

                    # Track the hash so subsequent tracks in this batch
                    # are also detected as duplicates
                    if track_hash:
                        existing_hashes.add(track_hash)

                    added.append({
                        'title': lib_track.get('title', ''),
                        'artist': lib_track.get('artist', ''),
                    })
                except Exception as e:
                    errors.append({
                        'file_path': file_path,
                        'title': lib_track.get('title', ''),
                        'error': str(e),
                    })

            # Clean up temporary transcoded files
            for temp_file in transcoded_temp_files:
                try:
                    if os.path.exists(temp_file):
                        os.unlink(temp_file)
                except Exception as e:
                    print(f"WARNING: Failed to delete temp file {temp_file}: {e}")

            return {
                'added': added,
                'skipped_duplicates': skipped,
                'errors': errors,
            }

    def add_to_playlist(self, playlist_id, ipod_track_ids):
        """Add existing iPod tracks to a playlist by track ID."""
        with self._lock:
            self._require_connected()
            pl = self._find_playlist(playlist_id)
            added = 0
            for i in range(len(self._db)):
                track = self._db[i]
                if track['id'] in ipod_track_ids:
                    pl.add(track)
                    added += 1
            return added

    def remove_tracks(self, ipod_track_ids):
        """Remove tracks from the iPod by track ID."""
        with self._lock:
            self._require_connected()
            removed = 0
            # Collect tracks first to avoid modifying list during iteration
            to_remove = []
            for i in range(len(self._db)):
                track = self._db[i]
                if track['id'] in ipod_track_ids:
                    to_remove.append(track)
            for track in to_remove:
                self._db.remove(track, ipod=True, quiet=True)
                removed += 1
            return removed

    def sync(self, progress_callback=None):
        """Copy pending files to iPod and save the database.

        Args:
            progress_callback: Optional function(copied, total, track_info)
        """
        with self._lock:
            self._require_connected()

            def _cb(db, track, i, total):
                if progress_callback:
                    info = f"{track['artist'] or 'Unknown'} - {track['title'] or 'Unknown'}"
                    progress_callback(i, total, info)

            self._db.copy_delayed_files(callback=_cb)
            self._db.close()

            # Re-open to refresh state
            mountpoint = self._mountpoint
            try:
                self._db = gpod.Database(mountpoint)
            except Exception as e:
                self._db = None
                self._mountpoint = None
                raise IPodError(f"Failed to re-open iPod after sync: {e}")

    def export_tracks(self, destination_path, progress_callback=None):
        """Export all tracks from iPod to destination folder.

        Args:
            destination_path: Directory to export tracks to
            progress_callback: Optional function(exported, total, track_info)

        Returns:
            dict with 'exported', 'skipped', 'errors' counts
        """
        with self._lock:
            self._require_connected()

            # Create destination directory if it doesn't exist
            os.makedirs(destination_path, exist_ok=True)

            total = len(self._db)
            exported = 0
            skipped = 0
            errors = []

            for i in range(total):
                track = self._db[i]
                artist = track['artist'] or 'Unknown Artist'
                album = track['album'] or 'Unknown Album'
                title = track['title'] or 'Unknown'

                # Get source file path on iPod
                try:
                    source_path = track.ipod_filename()
                except Exception:
                    source_path = None

                if not source_path or not os.path.exists(source_path):
                    errors.append({
                        'title': title,
                        'artist': artist,
                        'error': 'File not found on iPod'
                    })
                    if progress_callback:
                        progress_callback(i + 1, total, f"{artist} - {title}")
                    continue

                # Get file extension from source
                _, ext = os.path.splitext(source_path)
                if not ext:
                    ext = '.mp3'  # Default extension

                # Sanitize names for filesystem
                safe_artist = self._sanitize_filename(artist)
                safe_album = self._sanitize_filename(album)
                safe_title = self._sanitize_filename(title)

                # Create artist/album directory structure
                dest_dir = os.path.join(destination_path, safe_artist, safe_album)
                os.makedirs(dest_dir, exist_ok=True)

                # Build destination filename
                dest_filename = f"{safe_title}{ext}"
                dest_path = os.path.join(dest_dir, dest_filename)

                # Handle duplicate filenames by adding track number or counter
                if os.path.exists(dest_path):
                    # Check if it's the same file (same size)
                    try:
                        if os.path.getsize(source_path) == os.path.getsize(dest_path):
                            skipped += 1
                            if progress_callback:
                                progress_callback(i + 1, total, f"{artist} - {title}")
                            continue
                    except OSError:
                        pass

                    # Different file, add counter
                    counter = 1
                    base_name = safe_title
                    while os.path.exists(dest_path):
                        dest_filename = f"{base_name} ({counter}){ext}"
                        dest_path = os.path.join(dest_dir, dest_filename)
                        counter += 1

                # Copy the file
                try:
                    shutil.copy2(source_path, dest_path)
                    exported += 1
                except Exception as e:
                    errors.append({
                        'title': title,
                        'artist': artist,
                        'error': str(e)
                    })

                if progress_callback:
                    progress_callback(i + 1, total, f"{artist} - {title}")

            return {
                'exported': exported,
                'skipped': skipped,
                'errors': len(errors),
                'error_details': errors[:10]  # Limit error details
            }

    def _sanitize_filename(self, name):
        """Sanitize a string for use as a filename."""
        # Remove or replace invalid characters
        sanitized = re.sub(r'[<>:"/\\|?*]', '_', name)
        # Remove leading/trailing spaces and dots
        sanitized = sanitized.strip(' .')
        # Limit length
        if len(sanitized) > 200:
            sanitized = sanitized[:200]
        # Ensure not empty
        return sanitized or 'Unknown'

    # --- Private helpers ---

    def _require_connected(self):
        if self._db is None:
            raise IPodError("Not connected to an iPod")

    def _find_playlist(self, playlist_id):
        """Find a playlist by ID. Raises IPodError if not found."""
        try:
            pl = self._db.Playlists(id=playlist_id)
            return pl
        except KeyError:
            raise IPodError(f"Playlist with id {playlist_id} not found")

    def _track_to_dict(self, track):
        """Serialize a gpod Track to a plain dict."""
        return {
            'id': track['id'],
            'title': track['title'],
            'artist': track['artist'],
            'album': track['album'],
            'genre': track['genre'],
            'track_nr': track['track_nr'],
            'cd_nr': track['cd_nr'],
            'duration_ms': track['tracklen'],
            'year': track['year'],
            'bitrate': track['bitrate'],
            'rating': track['rating'],
            'playcount': track['playcount'],
        }
