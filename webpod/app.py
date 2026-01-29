"""Flask application with SocketIO for the WebPod iPod manager."""

import os
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_socketio import SocketIO

from . import models
from .artwork import get_artwork_path, init_artwork_cache, ARTWORK_CACHE_DIR
from .ipod_detect import detect_ipods
from .ipod_manager import IPodManager, IPodError
from .library_scanner import scan_directory

app = Flask(__name__,
            static_folder='static',
            template_folder='templates')
app.config['SECRET_KEY'] = 'webpod-secret-key'

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
    return jsonify({
        'music_path': music_path,
        'podcast_path': podcast_path,
        'music_set': bool(music_path),
        'podcast_set': bool(podcast_path),
        'music_count': models.get_track_count(is_podcast=False),
        'podcast_count': models.get_track_count(is_podcast=True)
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
    tracks, total = models.get_tracks(page, per_page, sort, order, search)
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


def run(port=5000, debug=False):
    """Run the WebPod server."""
    socketio.run(app, host='127.0.0.1', port=port, debug=debug,
                 allow_unsafe_werkzeug=True)
