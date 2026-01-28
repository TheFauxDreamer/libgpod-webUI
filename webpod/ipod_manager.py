"""Wrapper around gpod.Database for iPod operations.

This module manages the iPod database connection lifecycle and provides
thread-safe methods for all iPod operations used by the web interface.
"""

import threading

try:
    import gpod
except ImportError:
    gpod = None

from .duplicate_detector import sha1_hash
from .artwork import get_artwork_path


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
            return {
                "connected": True,
                "mountpoint": self._mountpoint,
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

                try:
                    # Create track on iPod (extracts ID3 tags automatically)
                    ipod_track = self._db.new_Track(filename=file_path)

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
