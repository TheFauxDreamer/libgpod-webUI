/**
 * WebPod - Drag and Drop
 * Handles dragging library tracks/albums onto iPod playlists
 */
var DragDrop = {

    /**
     * Initialize drag and drop handlers
     */
    init: function() {
        // Set up drop targets on the playlists list (using event delegation)
        var playlistsList = document.getElementById('playlists-list');

        playlistsList.addEventListener('dragover', function(e) {
            var li = DragDrop.findPlaylistItem(e.target);
            if (li) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                li.classList.add('drop-target');
            }
        });

        playlistsList.addEventListener('dragleave', function(e) {
            var li = DragDrop.findPlaylistItem(e.target);
            if (li) {
                li.classList.remove('drop-target');
            }
        });

        playlistsList.addEventListener('drop', function(e) {
            e.preventDefault();
            var li = DragDrop.findPlaylistItem(e.target);
            if (li) {
                li.classList.remove('drop-target');
                var playlistId = parseInt(li.dataset.playlistId, 10);
                DragDrop.handleDrop(e, playlistId);
            }
        });

        // Also support dropping on the general playlists area (adds to master/default)
        var playlistsArea = document.getElementById('playlists-area');

        playlistsArea.addEventListener('dragover', function(e) {
            // Only handle if not over a specific playlist item
            if (!DragDrop.findPlaylistItem(e.target)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                playlistsArea.classList.add('drop-target');
            }
        });

        playlistsArea.addEventListener('dragleave', function(e) {
            playlistsArea.classList.remove('drop-target');
        });

        playlistsArea.addEventListener('drop', function(e) {
            if (!DragDrop.findPlaylistItem(e.target)) {
                e.preventDefault();
                playlistsArea.classList.remove('drop-target');
                // Drop onto master playlist (no playlist_id or first playlist)
                DragDrop.handleDrop(e, null);
            }
        });
    },

    /**
     * Find the closest playlist li element from an event target
     */
    findPlaylistItem: function(el) {
        while (el && el !== document) {
            if (el.tagName === 'LI' && el.dataset.playlistId) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    },

    /**
     * Handle a drop event
     */
    handleDrop: function(e, playlistId) {
        if (!IPod.connected) {
            WebPod.toast('No iPod connected', 'warning');
            return;
        }

        var raw = e.dataTransfer.getData('text/plain');
        if (!raw) return;

        var data;
        try {
            data = JSON.parse(raw);
        } catch (err) {
            return;
        }

        if (data.type === 'tracks') {
            DragDrop.addTracks(data.track_ids, playlistId);
        } else if (data.type === 'album') {
            DragDrop.addAlbum(data.album, data.artist, playlistId);
        }
    },

    /**
     * Add tracks by ID to a playlist on the iPod
     */
    addTracks: function(trackIds, playlistId) {
        if (!trackIds || trackIds.length === 0) {
            WebPod.toast('No tracks to add', 'warning');
            return;
        }

        var body = { track_ids: trackIds };
        if (playlistId) {
            body.playlist_id = playlistId;
        }

        WebPod.api('/api/ipod/add-tracks', {
            method: 'POST',
            body: body
        }).then(function(result) {
            var added = result.added || 0;
            var duplicates = result.duplicates || 0;
            var errors = result.errors || 0;

            var parts = [];
            if (added > 0) parts.push(added + ' added');
            if (duplicates > 0) parts.push(duplicates + ' duplicates skipped');
            if (errors > 0) parts.push(errors + ' errors');

            var msg = parts.join(', ') || 'Tracks queued';
            WebPod.toast(msg, errors > 0 ? 'warning' : 'success');

            // Enable sync button with pulse
            var syncBtn = document.getElementById('sync-btn');
            syncBtn.disabled = false;
            syncBtn.classList.add('btn-pulse');

            // Refresh playlists to update counts
            IPod.loadPlaylists();
        });
    },

    /**
     * Add all tracks from an album to a playlist
     */
    addAlbum: function(albumName, artistName, playlistId) {
        // First fetch the tracks for this album
        var url = '/api/library/tracks?per_page=500&search=' + encodeURIComponent(albumName);
        WebPod.api(url).then(function(data) {
            var tracks = data.tracks || data || [];
            // Filter to matching album name to be precise
            var trackIds = [];
            tracks.forEach(function(t) {
                if (t.album === albumName) {
                    trackIds.push(t.id);
                }
            });

            if (trackIds.length === 0) {
                // Fallback: use all returned tracks
                tracks.forEach(function(t) {
                    trackIds.push(t.id);
                });
            }

            if (trackIds.length === 0) {
                WebPod.toast('No tracks found for album', 'warning');
                return;
            }

            DragDrop.addTracks(trackIds, playlistId);
        });
    }
};

document.addEventListener('DOMContentLoaded', DragDrop.init);
