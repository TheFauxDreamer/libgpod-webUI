"""SQLite database for caching local music library metadata."""

import sqlite3
import os
from pathlib import Path

DB_PATH = Path(__file__).parent / "library.db"
DEFAULT_EXPORT_PATH = str(Path(__file__).parent / "export")

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
    artwork_hash TEXT,
    is_podcast   INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sha1 ON library_tracks(sha1_hash);
CREATE INDEX IF NOT EXISTS idx_album ON library_tracks(album);
CREATE INDEX IF NOT EXISTS idx_artist ON library_tracks(artist);
CREATE INDEX IF NOT EXISTS idx_is_podcast ON library_tracks(is_podcast);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- Migration: keep old scan_state for backwards compatibility
CREATE TABLE IF NOT EXISTS scan_state (
    id           INTEGER PRIMARY KEY CHECK (id = 1),
    library_path TEXT NOT NULL,
    last_scan    TEXT
);
"""

MIGRATIONS = [
    "ALTER TABLE library_tracks ADD COLUMN is_podcast INTEGER DEFAULT 0",
]


def get_db():
    """Get a database connection with row_factory set."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """Create tables if they don't exist and run migrations."""
    conn = get_db()
    conn.executescript(SCHEMA)
    conn.commit()

    # Run migrations (ignore errors for already-applied migrations)
    for migration in MIGRATIONS:
        try:
            conn.execute(migration)
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Column/table already exists

    # Migrate old scan_state to settings table
    row = conn.execute("SELECT library_path FROM scan_state WHERE id = 1").fetchone()
    if row and row["library_path"]:
        existing = conn.execute(
            "SELECT value FROM settings WHERE key = 'music_library_path'"
        ).fetchone()
        if not existing:
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                ("music_library_path", row["library_path"])
            )
            conn.commit()

    conn.close()


def set_library_path(path):
    """Store the library path (backwards compatibility)."""
    set_setting("music_library_path", str(path))


def get_library_path():
    """Get the configured library path (backwards compatibility)."""
    return get_setting("music_library_path")


def get_setting(key):
    """Get a setting value by key."""
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    return row["value"] if row else None


def set_setting(key, value):
    """Set a setting value."""
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (key, str(value) if value else None)
    )
    conn.commit()
    conn.close()


def get_all_settings():
    """Get all settings as a dict."""
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {row["key"]: row["value"] for row in rows}


def upsert_track(track_data):
    """Insert or update a track in the library cache.

    track_data is a dict with keys matching column names.
    """
    # Ensure is_podcast has a default value
    if 'is_podcast' not in track_data:
        track_data['is_podcast'] = 0

    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO library_tracks
            (file_path, file_mtime, sha1_hash, title, artist, album,
             album_artist, genre, track_nr, cd_nr, year, duration_ms,
             bitrate, has_artwork, artwork_hash, is_podcast)
        VALUES
            (:file_path, :file_mtime, :sha1_hash, :title, :artist, :album,
             :album_artist, :genre, :track_nr, :cd_nr, :year, :duration_ms,
             :bitrate, :has_artwork, :artwork_hash, :is_podcast)
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


def _get_format(file_path):
    """Extract format from file path (e.g., 'mp3', 'flac')."""
    if '.' in file_path:
        return file_path.rsplit('.', 1)[-1].lower()
    return ''


def get_tracks(page=1, per_page=50, sort="artist", order="asc", search=None, album=None, is_podcast=False):
    """Get paginated tracks from the library cache."""
    conn = get_db()
    allowed_sorts = {"artist", "album", "title", "year", "duration_ms", "genre", "track_nr"}
    if sort not in allowed_sorts:
        sort = "artist"
    if order not in ("asc", "desc"):
        order = "asc"

    # Filter by is_podcast
    podcast_filter = 1 if is_podcast else 0
    params = [podcast_filter]
    where = "WHERE is_podcast = ?"

    # Exact album filter (for clicking on album cards)
    if album:
        where += " AND album = ?"
        params.append(album)

    # General search across multiple fields
    if search:
        where += " AND (title LIKE ? OR artist LIKE ? OR album LIKE ?)"
        like = f"%{search}%"
        params.extend([like, like, like])

    count_row = conn.execute(
        f"SELECT COUNT(*) as cnt FROM library_tracks {where}", params
    ).fetchone()
    total = count_row["cnt"]

    offset = (page - 1) * per_page

    # When fetching tracks for a specific album, sort by disc and track number
    if album:
        order_clause = "ORDER BY COALESCE(cd_nr, 1), COALESCE(track_nr, 0)"
    else:
        order_clause = f"ORDER BY {sort} {order}"

    rows = conn.execute(
        f"SELECT * FROM library_tracks {where} {order_clause} LIMIT ? OFFSET ?",
        params + [per_page, offset]
    ).fetchall()
    conn.close()

    # Add format to each track
    tracks = []
    for r in rows:
        track = dict(r)
        track['format'] = _get_format(track.get('file_path', ''))
        tracks.append(track)

    return tracks, total


def get_albums():
    """Get grouped album data for grid view (music only, not podcasts)."""
    conn = get_db()
    # Get album metadata
    rows = conn.execute("""
        SELECT album, artist, album_artist, artwork_hash,
               COUNT(*) as track_count, MIN(year) as year
        FROM library_tracks
        WHERE album IS NOT NULL AND album != '' AND is_podcast = 0
        GROUP BY album, COALESCE(album_artist, artist)
        ORDER BY COALESCE(album_artist, artist), album
    """).fetchall()

    albums = [dict(r) for r in rows]

    # Get formats for each album
    format_rows = conn.execute("""
        SELECT album, COALESCE(album_artist, artist) as group_artist, file_path
        FROM library_tracks
        WHERE album IS NOT NULL AND album != '' AND is_podcast = 0
    """).fetchall()
    conn.close()

    # Build format sets per album
    album_formats = {}
    for row in format_rows:
        key = (row['album'], row['group_artist'])
        fmt = _get_format(row['file_path'])
        if key not in album_formats:
            album_formats[key] = set()
        if fmt:
            album_formats[key].add(fmt)

    # Attach formats to albums
    for album in albums:
        key = (album['album'], album.get('album_artist') or album.get('artist'))
        formats = album_formats.get(key, set())
        album['formats'] = ','.join(sorted(formats))

    return albums


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


def get_all_tracks_for_matching():
    """Get all tracks with id and filepath for M3U matching."""
    conn = get_db()
    rows = conn.execute("SELECT id, file_path as filepath FROM library_tracks").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_track_count(is_podcast=None):
    """Get total number of tracks in library."""
    conn = get_db()
    if is_podcast is None:
        row = conn.execute("SELECT COUNT(*) as cnt FROM library_tracks").fetchone()
    else:
        podcast_filter = 1 if is_podcast else 0
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM library_tracks WHERE is_podcast = ?",
            (podcast_filter,)
        ).fetchone()
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


# ─── Podcast Functions ────────────────────────────────────────────────

def get_podcast_series():
    """Get podcast series, grouping by album tag or folder name."""
    conn = get_db()
    # Group by album, or if album is empty, extract folder name from path
    rows = conn.execute("""
        SELECT
            CASE
                WHEN album IS NOT NULL AND album != '' THEN album
                ELSE REPLACE(
                    SUBSTR(file_path, 1,
                        LENGTH(file_path) - LENGTH(
                            SUBSTR(file_path, LENGTH(RTRIM(file_path, REPLACE(file_path, '/', ''))) + 1)
                        ) - 1
                    ),
                    RTRIM(
                        SUBSTR(file_path, 1,
                            LENGTH(file_path) - LENGTH(
                                SUBSTR(file_path, LENGTH(RTRIM(file_path, REPLACE(file_path, '/', ''))) + 1)
                            ) - 1
                        ),
                        REPLACE(
                            SUBSTR(file_path, 1,
                                LENGTH(file_path) - LENGTH(
                                    SUBSTR(file_path, LENGTH(RTRIM(file_path, REPLACE(file_path, '/', ''))) + 1)
                                ) - 1
                            ),
                            '/',
                            ''
                        )
                    ) || '/',
                    ''
                )
            END as series_name,
            COUNT(*) as episode_count,
            artwork_hash,
            MIN(year) as earliest_year
        FROM library_tracks
        WHERE is_podcast = 1
        GROUP BY series_name
        ORDER BY series_name
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_podcast_series_simple():
    """Get podcast series using a simpler grouping (album only, folder as fallback)."""
    import os
    conn = get_db()
    rows = conn.execute("""
        SELECT album, file_path, artwork_hash, year, track_nr
        FROM library_tracks
        WHERE is_podcast = 1
    """).fetchall()
    conn.close()

    # Group by series name (album or folder name)
    series_map = {}
    for row in rows:
        album = row['album']
        file_path = row['file_path']

        # Use album if set, otherwise extract folder name from path
        if album and album.strip():
            series_name = album.strip()
        else:
            # Extract parent folder name (works on both Windows and Unix paths)
            parent_dir = os.path.dirname(file_path)
            series_name = os.path.basename(parent_dir) or 'Unknown Podcast'

        if series_name not in series_map:
            series_map[series_name] = {
                'series_name': series_name,
                'episode_count': 0,
                'artwork_hash': None,
                'earliest_year': None,
                '_latest_year': 0,
                '_latest_track_nr': 0
            }

        series_map[series_name]['episode_count'] += 1

        # Track artwork from most recent episode (highest year, then highest track_nr)
        if row['artwork_hash']:
            year = row['year'] or 0
            track_nr = row['track_nr'] or 0
            current = series_map[series_name]
            if (year > current['_latest_year']) or \
               (year == current['_latest_year'] and track_nr > current['_latest_track_nr']):
                current['artwork_hash'] = row['artwork_hash']
                current['_latest_year'] = year
                current['_latest_track_nr'] = track_nr

        # Track earliest year
        if row['year']:
            current_earliest = series_map[series_name]['earliest_year']
            if current_earliest is None or row['year'] < current_earliest:
                series_map[series_name]['earliest_year'] = row['year']

    # Clean up internal tracking fields
    for series in series_map.values():
        del series['_latest_year']
        del series['_latest_track_nr']

    return sorted(series_map.values(), key=lambda x: x['series_name'])


def get_podcast_episodes(series_name):
    """Get episodes for a podcast series."""
    import os
    conn = get_db()
    rows = conn.execute("""
        SELECT *
        FROM library_tracks
        WHERE is_podcast = 1
        ORDER BY COALESCE(track_nr, 0) DESC, year DESC, title
    """).fetchall()
    conn.close()

    # Filter episodes matching the series name (by album or folder)
    episodes = []
    for row in rows:
        album = row['album']
        file_path = row['file_path']

        # Determine this episode's series name
        if album and album.strip():
            ep_series = album.strip()
        else:
            parent_dir = os.path.dirname(file_path)
            ep_series = os.path.basename(parent_dir) or 'Unknown Podcast'

        if ep_series == series_name:
            episodes.append(dict(row))

    return episodes


def search_all(query, formats=None, limit_albums=20, limit_tracks=40, limit_podcasts=20):
    """
    Search across albums, tracks, and podcasts.
    Returns dict with arrays and metadata for each section.
    Set limit to None for unlimited results.
    """
    if not query:
        return {
            'albums': [], 'albums_total': 0,
            'tracks': [], 'tracks_total': 0,
            'podcasts': [], 'podcasts_total': 0
        }

    conn = get_db()
    cursor = conn.cursor()
    search_pattern = f"%{query}%"
    results = {}

    # ─── Search Albums ────────────────────────────────────────────────
    album_query = """
        SELECT album, artist, album_artist, artwork_hash,
               COUNT(*) as track_count, MIN(year) as year
        FROM library_tracks
        WHERE album IS NOT NULL AND album != '' AND is_podcast = 0
          AND (album LIKE ? OR COALESCE(album_artist, artist) LIKE ?)
    """
    params = [search_pattern, search_pattern]

    # Add format filter if specified
    if formats and 'all' not in formats:
        format_conditions = []
        for fmt in formats:
            format_conditions.append(f"file_path LIKE '%.{fmt}'")
        album_query += " AND (" + " OR ".join(format_conditions) + ")"

    album_query += " GROUP BY album, COALESCE(album_artist, artist)"

    # Get total count first
    count_query = "SELECT COUNT(*) FROM (" + album_query + ")"
    cursor.execute(count_query, params)
    results['albums_total'] = cursor.fetchone()[0]

    # Get limited results
    album_query += " ORDER BY COALESCE(album_artist, artist), album"
    if limit_albums is not None:
        album_query += f" LIMIT {limit_albums}"

    cursor.execute(album_query, params)
    results['albums'] = [dict(row) for row in cursor.fetchall()]

    # ─── Search Tracks ────────────────────────────────────────────────
    track_query = """
        SELECT id, title, artist, album, genre, year, duration_ms, file_path, artwork_hash
        FROM library_tracks
        WHERE is_podcast = 0
          AND (title LIKE ? OR artist LIKE ? OR album LIKE ? OR genre LIKE ?)
    """
    track_params = [search_pattern, search_pattern, search_pattern, search_pattern]

    # Add format filter
    if formats and 'all' not in formats:
        format_conditions = []
        for fmt in formats:
            format_conditions.append(f"file_path LIKE '%.{fmt}'")
        track_query += " AND (" + " OR ".join(format_conditions) + ")"

    # Get total count
    count_query = "SELECT COUNT(*) FROM (" + track_query + ")"
    cursor.execute(count_query, track_params)
    results['tracks_total'] = cursor.fetchone()[0]

    # Get limited results
    track_query += " ORDER BY artist, album, title"
    if limit_tracks is not None:
        track_query += f" LIMIT {limit_tracks}"

    cursor.execute(track_query, track_params)
    results['tracks'] = [dict(row) for row in cursor.fetchall()]

    # ─── Search Podcasts ──────────────────────────────────────────────
    # Podcasts: series_name is computed from album/folder, so fetch all and filter in Python
    import os
    podcast_query = """
        SELECT album, file_path, artwork_hash, year, track_nr
        FROM library_tracks
        WHERE is_podcast = 1
    """
    cursor.execute(podcast_query)
    podcast_rows = cursor.fetchall()
    conn.close()

    # Group by series name and filter by search query
    series_map = {}
    for row in podcast_rows:
        album = row['album']
        file_path = row['file_path']

        # Compute series name (same logic as get_podcast_series_simple)
        if album and album.strip():
            series_name = album.strip()
        else:
            parent_dir = os.path.dirname(file_path)
            series_name = os.path.basename(parent_dir) or 'Unknown Podcast'

        # Filter by search query
        if query.lower() not in series_name.lower():
            continue

        if series_name not in series_map:
            series_map[series_name] = {
                'series_name': series_name,
                'episode_count': 0,
                'artwork_hash': None,
                '_latest_year': 0,
                '_latest_track_nr': 0
            }

        series_map[series_name]['episode_count'] += 1

        # Track artwork from most recent episode
        if row['artwork_hash']:
            year = row['year'] or 0
            track_nr = row['track_nr'] or 0
            current = series_map[series_name]
            if (year > current['_latest_year']) or \
               (year == current['_latest_year'] and track_nr > current['_latest_track_nr']):
                current['artwork_hash'] = row['artwork_hash']
                current['_latest_year'] = year
                current['_latest_track_nr'] = track_nr

    # Clean up internal tracking fields and sort
    podcast_list = []
    for series in series_map.values():
        del series['_latest_year']
        del series['_latest_track_nr']
        podcast_list.append(series)

    podcast_list.sort(key=lambda x: x['series_name'])

    # Apply limit
    results['podcasts_total'] = len(podcast_list)
    if limit_podcasts is not None:
        results['podcasts'] = podcast_list[:limit_podcasts]
    else:
        results['podcasts'] = podcast_list

    return results


def get_all_track_ids(is_podcast=None, formats=None):
    """Get all track IDs, optionally filtered by type and format.

    Args:
        is_podcast: True for podcasts, False for music, None for both
        formats: List of format extensions (e.g., ['mp3', 'flac']) or None for all

    Returns:
        List of track IDs
    """
    conn = get_db()

    conditions = []
    params = []

    if is_podcast is not None:
        conditions.append("is_podcast = ?")
        params.append(1 if is_podcast else 0)

    if formats:
        format_conditions = []
        for fmt in formats:
            format_conditions.append("file_path LIKE ?")
            params.append(f"%.{fmt}")
        conditions.append("(" + " OR ".join(format_conditions) + ")")

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    rows = conn.execute(f"SELECT id FROM library_tracks {where}", params).fetchall()
    conn.close()

    return [row['id'] for row in rows]
