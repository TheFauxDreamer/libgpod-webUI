"""Flask application with SocketIO for the WebPod iPod manager."""

import os
import re
import shutil
import tempfile
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_socketio import SocketIO

from . import models
from .artwork import get_artwork_path, init_artwork_cache, ARTWORK_CACHE_DIR
from .duplicate_detector import sha1_hash
from .ipod_detect import detect_ipods
from .ipod_manager import IPodManager, IPodError
from .library_scanner import scan_directory, process_single_file, SUPPORTED_EXTENSIONS, _extract_metadata

app = Flask(__name__,
            static_folder='static',
            template_folder='templates')
app.config['SECRET_KEY'] = 'webpod-secret-key'
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500 MB

socketio = SocketIO(app, async_mode='threading')
ipod = IPodManager()

# Initialize database and artwork cache on import
models.init_db()
init_artwork_cache()


# ─── Page ────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory(app.template_folder, 'index.html')


# ─── Library API ─────────────────────────────────────────────────────

@app.route('/api/library/set-path', methods=['POST'])
def library_set_path():
    """Legacy endpoint - use /api/settings instead."""
    data = request.get_json()
    path = data.get('path', '').strip()
    if not path or not Path(path).is_dir():
        return jsonify({"error": "Invalid directory path"}), 400
    models.set_library_path(path)
    return jsonify({"path": path})


@app.route('/api/library/path', methods=['GET'])
def library_get_path():
    """Legacy endpoint - use /api/settings instead."""
    path = models.get_library_path()
    return jsonify({"path": path})


# ─── Settings API ─────────────────────────────────────────────────────

@app.route('/api/settings', methods=['GET'])
def get_settings():
    """Get all settings including library paths."""
    music_path = models.get_setting('music_library_path')
    podcast_path = models.get_setting('podcast_library_path')
    export_path = models.get_setting('export_path') or models.DEFAULT_EXPORT_PATH
    show_format_tags_setting = models.get_setting('show_format_tags')
    show_format_tags = show_format_tags_setting != '0'  # Default to True
    colorful_albums = models.get_setting('colorful_albums') != '0'  # Default to True
    theme = models.get_setting('theme') or 'auto'
    allow_no_metadata_setting = models.get_setting('allow_files_without_metadata')
    # Default to False (disallow) if not set - cleaner libraries by default
    allow_no_metadata = allow_no_metadata_setting == '1'

    # Transcoding settings
    transcode_flac = models.get_setting('transcode_flac_to_ipod')
    # Default to True (enable) if not set - FLAC files won't work on iPod otherwise
    transcode_flac_enabled = transcode_flac != '0'  # None or '1' = enabled
    transcode_format = models.get_setting('transcode_flac_format') or 'alac'

    return jsonify({
        'music_path': music_path,
        'podcast_path': podcast_path,
        'export_path': export_path,
        'music_set': bool(music_path),
        'podcast_set': bool(podcast_path),
        'music_count': models.get_track_count(is_podcast=False),
        'podcast_count': models.get_track_count(is_podcast=True),
        'show_format_tags': show_format_tags,
        'colorful_albums': colorful_albums,
        'theme': theme,
        'allow_files_without_metadata': allow_no_metadata,
        'transcode_flac_to_ipod': transcode_flac_enabled,
        'transcode_flac_format': transcode_format
    })


@app.route('/api/settings', methods=['POST'])
def save_settings():
    """Save settings."""
    data = request.get_json()

    if 'music_path' in data:
        path = data['music_path'].strip() if data['music_path'] else ''
        if path and not Path(path).is_dir():
            return jsonify({"error": f"Music directory not found: {path}"}), 400
        models.set_setting('music_library_path', path if path else None)

    if 'podcast_path' in data:
        path = data['podcast_path'].strip() if data['podcast_path'] else ''
        if path and not Path(path).is_dir():
            return jsonify({"error": f"Podcast directory not found: {path}"}), 400
        models.set_setting('podcast_library_path', path if path else None)

    if 'export_path' in data:
        path = data['export_path'].strip() if data['export_path'] else ''
        # Export path doesn't need to exist yet - it will be created on export
        models.set_setting('export_path', path if path else None)

    if 'show_format_tags' in data:
        models.set_setting('show_format_tags', '1' if data['show_format_tags'] else '0')

    if 'colorful_albums' in data:
        models.set_setting('colorful_albums', '1' if data['colorful_albums'] else '0')

    if 'theme' in data:
        theme = data['theme']
        if theme in ('light', 'dark', 'auto'):
            models.set_setting('theme', theme)

    if 'allow_files_without_metadata' in data:
        models.set_setting('allow_files_without_metadata', '1' if data['allow_files_without_metadata'] else '0')

    if 'transcode_flac_to_ipod' in data:
        models.set_setting('transcode_flac_to_ipod', '1' if data['transcode_flac_to_ipod'] else '0')

    if 'transcode_flac_format' in data:
        # Validate format is 'alac' or 'mp3'
        fmt = data['transcode_flac_format']
        if fmt in ['alac', 'mp3']:
            models.set_setting('transcode_flac_format', fmt)

    return jsonify({"success": True})


@app.route('/api/library/scan', methods=['POST'])
def library_scan():
    path = models.get_library_path()
    if not path:
        return jsonify({"error": "No library path configured"}), 400
    if not Path(path).is_dir():
        return jsonify({"error": f"Directory not found: {path}"}), 400

    def _scan():
        def progress(scanned, total, current_file):
            socketio.emit('scan_progress', {
                'scanned': scanned,
                'total': total,
                'current_file': os.path.basename(current_file),
            })

        try:
            scan_directory(path, progress_callback=progress)
            total = models.get_track_count()
            socketio.emit('scan_complete', {'total_tracks': total})
        except Exception as e:
            socketio.emit('scan_error', {'message': str(e)})

    socketio.start_background_task(_scan)
    return jsonify({"status": "scanning"})


@app.route('/api/library/tracks', methods=['GET'])
def library_tracks():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 100, type=int)
    sort = request.args.get('sort', 'artist')
    order = request.args.get('order', 'asc')
    search = request.args.get('search', None)
    album = request.args.get('album', None)
    tracks, total = models.get_tracks(page, per_page, sort, order, search, album)
    return jsonify({"tracks": tracks, "total": total, "page": page, "per_page": per_page})


@app.route('/api/library/albums', methods=['GET'])
def library_albums():
    albums = models.get_albums()
    return jsonify({"albums": albums})


@app.route('/api/library/scan-podcasts', methods=['POST'])
def library_scan_podcasts():
    """Scan podcast library directory."""
    path = models.get_setting('podcast_library_path')
    if not path:
        return jsonify({"error": "No podcast library path configured"}), 400
    if not Path(path).is_dir():
        return jsonify({"error": f"Directory not found: {path}"}), 400

    def _scan():
        def progress(scanned, total, current_file):
            socketio.emit('podcast_scan_progress', {
                'scanned': scanned,
                'total': total,
                'current_file': os.path.basename(current_file),
            })

        try:
            scan_directory(path, progress_callback=progress, is_podcast=True)
            total = models.get_track_count(is_podcast=True)
            socketio.emit('podcast_scan_complete', {'total_episodes': total})
        except Exception as e:
            socketio.emit('podcast_scan_error', {'message': str(e)})

    socketio.start_background_task(_scan)
    return jsonify({"status": "scanning"})


# ─── Upload API ──────────────────────────────────────────────────────

def _sanitize_name(name):
    """Sanitize a string for use as a directory or file name."""
    # Remove characters that are problematic on filesystems
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    # Collapse multiple underscores/spaces
    name = re.sub(r'[_\s]+', ' ', name).strip()
    # Limit length
    return name[:100] if name else 'Unknown'


def _unique_path(dest_path):
    """Return dest_path if it doesn't exist, otherwise append (1), (2), etc."""
    if not dest_path.exists():
        return dest_path
    stem = dest_path.stem
    suffix = dest_path.suffix
    parent = dest_path.parent
    counter = 1
    while True:
        candidate = parent / f"{stem} ({counter}){suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


@app.route('/api/library/upload', methods=['POST'])
def library_upload():
    """Upload audio files from the browser and add them to the library."""
    files = request.files.getlist('files')
    if not files or all(f.filename == '' for f in files):
        return jsonify({"error": "No files provided"}), 400

    # Determine upload destination
    library_path = models.get_library_path()
    if library_path:
        upload_dir = Path(library_path) / 'Uploads'
    else:
        upload_dir = Path(__file__).parent / 'uploads'

    added = []
    duplicates = []
    errors = []

    for f in files:
        filename = f.filename or ''
        ext = Path(filename).suffix.lower()

        # Validate extension
        if ext not in SUPPORTED_EXTENSIONS:
            errors.append({'filename': filename, 'reason': f'Unsupported format: {ext}'})
            continue

        # Save to temp file first
        try:
            fd, tmp_path = tempfile.mkstemp(suffix=ext)
            os.close(fd)
            f.save(tmp_path)
        except Exception as e:
            errors.append({'filename': filename, 'reason': f'Failed to save: {e}'})
            continue

        # Check for duplicates by hash
        try:
            file_hash = sha1_hash(tmp_path)
        except OSError:
            os.unlink(tmp_path)
            errors.append({'filename': filename, 'reason': 'Failed to read file'})
            continue

        existing = models.check_duplicate_hash(file_hash)
        if existing:
            os.unlink(tmp_path)
            duplicates.append({
                'filename': filename,
                'existing_title': existing.get('title'),
                'existing_artist': existing.get('artist'),
            })
            continue

        # Extract metadata to determine destination folder
        meta = _extract_metadata(tmp_path)
        artist = _sanitize_name(
            (meta.get('artist') if meta else None) or 'Unknown Artist'
        )
        album = _sanitize_name(
            (meta.get('album') if meta else None) or 'Unknown Album'
        )

        # Build final destination path
        dest_dir = upload_dir / artist / album
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = _unique_path(dest_dir / filename)

        # Move temp file to final location
        try:
            shutil.move(tmp_path, str(dest_path))
        except Exception as e:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            errors.append({'filename': filename, 'reason': f'Failed to move file: {e}'})
            continue

        # Process into library database
        result = process_single_file(str(dest_path))
        if result['status'] == 'added':
            track = result['track_data']
            added.append({
                'filename': filename,
                'title': track.get('title'),
                'artist': track.get('artist'),
                'album': track.get('album'),
            })
        else:
            errors.append({
                'filename': filename,
                'reason': result.get('reason', 'Processing failed'),
            })

    return jsonify({
        'added': added,
        'duplicates': duplicates,
        'errors': errors,
        'summary': {
            'added_count': len(added),
            'duplicate_count': len(duplicates),
            'error_count': len(errors),
        }
    })


# ─── Podcast API ──────────────────────────────────────────────────────

@app.route('/api/podcasts/series', methods=['GET'])
def podcast_series():
    """Get all podcast series."""
    series = models.get_podcast_series_simple()
    return jsonify({"series": series})


@app.route('/api/podcasts/episodes/<path:series_name>', methods=['GET'])
def podcast_episodes(series_name):
    """Get episodes for a podcast series."""
    episodes = models.get_podcast_episodes(series_name)
    return jsonify({"episodes": episodes})


@app.route('/api/library/import-m3u', methods=['POST'])
def library_import_m3u():
    """Import an M3U/M3U8 playlist file and match tracks to library."""
    from .m3u_parser import parse_m3u, match_tracks_to_library

    data = request.get_json()
    file_path = data.get('path', '').strip()

    if not file_path:
        return jsonify({"error": "No file path provided"}), 400

    if not os.path.isfile(file_path):
        return jsonify({"error": f"File not found: {file_path}"}), 404

    # Parse M3U file
    m3u_tracks = parse_m3u(file_path)
    if not m3u_tracks:
        return jsonify({"error": "No tracks found in playlist file"}), 400

    # Get all library tracks for matching
    library_tracks = models.get_all_tracks_for_matching()

    # Match M3U paths to library
    matched_ids, unmatched_paths = match_tracks_to_library(m3u_tracks, library_tracks)

    # Get full track info for matched tracks
    matched_tracks = models.get_tracks_by_ids(matched_ids) if matched_ids else []

    return jsonify({
        "matched_tracks": matched_tracks,
        "matched_count": len(matched_ids),
        "unmatched_count": len(unmatched_paths),
        "unmatched_paths": unmatched_paths[:20]  # Limit to first 20 for UI
    })


# ─── Search API ───────────────────────────────────────────────────

@app.route('/api/search', methods=['GET'])
def search():
    """Unified search across albums, tracks, and podcasts."""
    query = request.args.get('q', '').strip()
    formats = request.args.getlist('formats')
    show_all_albums = request.args.get('show_all_albums', 'false') == 'true'
    show_all_tracks = request.args.get('show_all_tracks', 'false') == 'true'
    show_all_podcasts = request.args.get('show_all_podcasts', 'false') == 'true'

    if not query:
        return jsonify({
            'albums': [], 'albums_total': 0,
            'tracks': [], 'tracks_total': 0,
            'podcasts': [], 'podcasts_total': 0
        })

    # Set limits based on show_all parameters for each category
    limit_albums = None if show_all_albums else 20
    limit_tracks = None if show_all_tracks else 40
    limit_podcasts = None if show_all_podcasts else 20

    results = models.search_all(
        query,
        formats=formats if formats else None,
        limit_albums=limit_albums,
        limit_tracks=limit_tracks,
        limit_podcasts=limit_podcasts
    )

    return jsonify(results)


@app.route('/api/library/all-track-ids', methods=['GET'])
def library_all_track_ids():
    """Get all track IDs with optional filtering."""
    track_type = request.args.get('type', 'all')  # 'music', 'podcast', 'all'
    formats_param = request.args.get('formats', '')

    # Determine is_podcast filter
    if track_type == 'music':
        is_podcast = False
    elif track_type == 'podcast':
        is_podcast = True
    else:
        is_podcast = None

    # Parse formats
    formats = None
    if formats_param and formats_param != 'all':
        formats = [f.strip().lower() for f in formats_param.split(',') if f.strip()]

    track_ids = models.get_all_track_ids(is_podcast=is_podcast, formats=formats)

    return jsonify({
        'track_ids': track_ids,
        'count': len(track_ids)
    })


@app.route('/api/library/formats', methods=['GET'])
def library_formats():
    """Get available audio formats in the library."""
    formats = models.get_available_formats()
    return jsonify({'formats': formats})


@app.route('/api/artwork/<artwork_hash>')
def serve_artwork(artwork_hash):
    path = get_artwork_path(artwork_hash)
    if path:
        return send_file(path, mimetype='image/jpeg')
    # Return placeholder
    placeholder = Path(app.static_folder) / 'img' / 'placeholder.png'
    if placeholder.exists():
        return send_file(str(placeholder), mimetype='image/png')
    return '', 404


# ─── Audio Streaming API ─────────────────────────────────────────────

AUDIO_MIME_TYPES = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/mp4',
    '.mp4': 'audio/mp4',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
}


@app.route('/api/library/stream/<int:track_id>')
def stream_track(track_id):
    """Stream an audio file for browser playback."""
    tracks = models.get_tracks_by_ids([track_id])
    if not tracks:
        return '', 404
    file_path = tracks[0]['file_path']
    if not os.path.isfile(file_path):
        return '', 404
    ext = Path(file_path).suffix.lower()
    mimetype = AUDIO_MIME_TYPES.get(ext, 'application/octet-stream')
    return send_file(file_path, mimetype=mimetype, conditional=True)


# ─── iPod API ────────────────────────────────────────────────────────

@app.route('/api/ipod/detect', methods=['GET'])
def ipod_detect():
    devices = detect_ipods()
    return jsonify({"devices": devices})


@app.route('/api/ipod/connect', methods=['POST'])
def ipod_connect():
    data = request.get_json()
    mountpoint = data.get('mountpoint', '').strip()
    if not mountpoint:
        return jsonify({"error": "No mountpoint specified"}), 400
    try:
        ipod.connect(mountpoint)
        return jsonify(ipod.get_status())
    except IPodError as e:
        return jsonify({"error": str(e)}), 400


@app.route('/api/ipod/disconnect', methods=['POST'])
def ipod_disconnect():
    try:
        ipod.disconnect()
        return jsonify({"connected": False})
    except IPodError as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/ipod/status', methods=['GET'])
def ipod_status():
    return jsonify(ipod.get_status())


@app.route('/api/ipod/tracks', methods=['GET'])
def ipod_tracks():
    try:
        tracks = ipod.get_tracks()
        return jsonify({"tracks": tracks})
    except IPodError as e:
        return jsonify({"error": str(e)}), 503


@app.route('/api/ipod/playlists', methods=['GET'])
def ipod_playlists_list():
    try:
        playlists = ipod.get_playlists()
        return jsonify({"playlists": playlists})
    except IPodError as e:
        return jsonify({"error": str(e)}), 503


@app.route('/api/ipod/playlists/<int:playlist_id>/tracks', methods=['GET'])
def ipod_playlist_tracks(playlist_id):
    try:
        tracks = ipod.get_playlist_tracks(playlist_id)
        return jsonify({"tracks": tracks})
    except IPodError as e:
        return jsonify({"error": str(e)}), 503


@app.route('/api/ipod/playlists', methods=['POST'])
def ipod_create_playlist():
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({"error": "Playlist name required"}), 400
    try:
        pl = ipod.create_playlist(name)
        return jsonify(pl), 201
    except IPodError as e:
        return jsonify({"error": str(e)}), 503


@app.route('/api/ipod/playlists/<int:playlist_id>', methods=['PUT'])
def ipod_rename_playlist(playlist_id):
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({"error": "Playlist name required"}), 400
    try:
        result = ipod.rename_playlist(playlist_id, name)
        return jsonify(result)
    except IPodError as e:
        return jsonify({"error": str(e)}), 503


@app.route('/api/ipod/playlists/<int:playlist_id>', methods=['DELETE'])
def ipod_delete_playlist(playlist_id):
    try:
        ipod.delete_playlist(playlist_id)
        return jsonify({"deleted": True})
    except IPodError as e:
        return jsonify({"error": str(e)}), 503


# ─── Transfer API ────────────────────────────────────────────────────

@app.route('/api/ipod/add-tracks', methods=['POST'])
def ipod_add_tracks():
    data = request.get_json()
    track_ids = data.get('track_ids', [])
    playlist_id = data.get('playlist_id', None)

    if not track_ids:
        return jsonify({"error": "No tracks specified"}), 400

    # Fetch library track data
    library_tracks = models.get_tracks_by_ids(track_ids)
    if not library_tracks:
        return jsonify({"error": "No matching tracks found in library"}), 404

    try:
        result = ipod.add_tracks(library_tracks, playlist_id)
        return jsonify(result)
    except IPodError as e:
        return jsonify({"error": str(e)}), 503


@app.route('/api/ipod/remove-tracks', methods=['POST'])
def ipod_remove_tracks():
    data = request.get_json()
    track_ids = data.get('track_ids', [])
    if not track_ids:
        return jsonify({"error": "No tracks specified"}), 400
    try:
        removed = ipod.remove_tracks(set(track_ids))
        return jsonify({"removed": removed})
    except IPodError as e:
        return jsonify({"error": str(e)}), 503


@app.route('/api/ipod/sync', methods=['POST'])
def ipod_sync():
    def _sync():
        def progress(copied, total, track_info):
            socketio.emit('sync_progress', {
                'copied': copied,
                'total': total,
                'track': track_info,
            })

        try:
            ipod.sync(progress_callback=progress)
            socketio.emit('sync_complete', {'success': True})
        except IPodError as e:
            socketio.emit('sync_error', {'message': str(e)})

    socketio.start_background_task(_sync)
    return jsonify({"status": "syncing"})


@app.route('/api/ipod/export', methods=['POST'])
def ipod_export():
    """Export all music from iPod to destination folder."""
    if not ipod.connected:
        return jsonify({"error": "No iPod connected"}), 400

    # Get export path from settings or use default
    export_path = models.get_setting('export_path') or models.DEFAULT_EXPORT_PATH

    def _export():
        def progress(exported, total, track_info):
            socketio.emit('export_progress', {
                'exported': exported,
                'total': total,
                'track': track_info,
            })

        try:
            result = ipod.export_tracks(export_path, progress_callback=progress)
            socketio.emit('export_complete', result)
        except IPodError as e:
            socketio.emit('export_error', {'message': str(e)})
        except Exception as e:
            socketio.emit('export_error', {'message': str(e)})

    socketio.start_background_task(_export)
    return jsonify({"status": "exporting", "destination": export_path})


def run(port=5000, debug=False):
    """Run the WebPod server."""
    socketio.run(app, host='127.0.0.1', port=port, debug=debug,
                 allow_unsafe_werkzeug=True)
