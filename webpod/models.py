"""SQLite database for caching local music library metadata."""

import sqlite3
import os
from pathlib import Path

DB_PATH = Path(__file__).parent / "library.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS library_tracks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path    TEXT UNIQUE NOT NULL,
    file_mtime   REAL NOT NULL,
    sha1_hash    TEXT NOT NULL,
    title        TEXT,
    artist       TEXT,
    album        TEXT,
    album_artist TEXT,
    genre        TEXT,
    track_nr     INTEGER,
    cd_nr        INTEGER,
    year         INTEGER,
    duration_ms  INTEGER,
    bitrate      INTEGER,
    has_artwork  INTEGER DEFAULT 0,
    artwork_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_sha1 ON library_tracks(sha1_hash);
CREATE INDEX IF NOT EXISTS idx_album ON library_tracks(album);
CREATE INDEX IF NOT EXISTS idx_artist ON library_tracks(artist);

CREATE TABLE IF NOT EXISTS scan_state (
    id           INTEGER PRIMARY KEY CHECK (id = 1),
    library_path TEXT NOT NULL,
    last_scan    TEXT
);
"""


def get_db():
    """Get a database connection with row_factory set."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """Create tables if they don't exist."""
    conn = get_db()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


def set_library_path(path):
    """Store the library path."""
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO scan_state (id, library_path) VALUES (1, ?)",
        (str(path),)
    )
    conn.commit()
    conn.close()


def get_library_path():
    """Get the configured library path, or None."""
    conn = get_db()
    row = conn.execute("SELECT library_path FROM scan_state WHERE id = 1").fetchone()
    conn.close()
    if row:
        return row["library_path"]
    return None


def upsert_track(track_data):
    """Insert or update a track in the library cache.

    track_data is a dict with keys matching column names.
    """
    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO library_tracks
            (file_path, file_mtime, sha1_hash, title, artist, album,
             album_artist, genre, track_nr, cd_nr, year, duration_ms,
             bitrate, has_artwork, artwork_hash)
        VALUES
            (:file_path, :file_mtime, :sha1_hash, :title, :artist, :album,
             :album_artist, :genre, :track_nr, :cd_nr, :year, :duration_ms,
             :bitrate, :has_artwork, :artwork_hash)
    """, track_data)
    conn.commit()
    conn.close()


def get_cached_mtime(file_path):
    """Get the cached mtime for a file, or None if not cached."""
    conn = get_db()
    row = conn.execute(
        "SELECT file_mtime FROM library_tracks WHERE file_path = ?",
        (str(file_path),)
    ).fetchone()
    conn.close()
    if row:
        return row["file_mtime"]
    return None


def get_tracks(page=1, per_page=50, sort="artist", order="asc", search=None):
    """Get paginated tracks from the library cache."""
    conn = get_db()
    allowed_sorts = {"artist", "album", "title", "year", "duration_ms", "genre", "track_nr"}
    if sort not in allowed_sorts:
        sort = "artist"
    if order not in ("asc", "desc"):
        order = "asc"

    params = []
    where = ""
    if search:
        where = "WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?"
        like = f"%{search}%"
        params = [like, like, like]

    count_row = conn.execute(
        f"SELECT COUNT(*) as cnt FROM library_tracks {where}", params
    ).fetchone()
    total = count_row["cnt"]

    offset = (page - 1) * per_page
    rows = conn.execute(
        f"SELECT * FROM library_tracks {where} ORDER BY {sort} {order} LIMIT ? OFFSET ?",
        params + [per_page, offset]
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows], total


def get_albums():
    """Get grouped album data for grid view."""
    conn = get_db()
    rows = conn.execute("""
        SELECT album, artist, album_artist, artwork_hash,
               COUNT(*) as track_count, MIN(year) as year
        FROM library_tracks
        WHERE album IS NOT NULL AND album != ''
        GROUP BY album, COALESCE(album_artist, artist)
        ORDER BY COALESCE(album_artist, artist), album
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_tracks_by_ids(track_ids):
    """Get tracks by their IDs."""
    if not track_ids:
        return []
    conn = get_db()
    placeholders = ",".join("?" for _ in track_ids)
    rows = conn.execute(
        f"SELECT * FROM library_tracks WHERE id IN ({placeholders})",
        track_ids
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_track_count():
    """Get total number of tracks in library."""
    conn = get_db()
    row = conn.execute("SELECT COUNT(*) as cnt FROM library_tracks").fetchone()
    conn.close()
    return row["cnt"]


def remove_missing_files():
    """Remove tracks whose files no longer exist on disk."""
    conn = get_db()
    rows = conn.execute("SELECT id, file_path FROM library_tracks").fetchall()
    missing_ids = [row["id"] for row in rows if not os.path.exists(row["file_path"])]
    if missing_ids:
        placeholders = ",".join("?" for _ in missing_ids)
        conn.execute(f"DELETE FROM library_tracks WHERE id IN ({placeholders})", missing_ids)
        conn.commit()
    conn.close()
    return len(missing_ids)
