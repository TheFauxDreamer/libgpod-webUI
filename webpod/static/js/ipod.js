/**
 * WebPod - iPod Panel
 * Detection, connection, playlists, iPod track management
 */
var IPod = {
    connected: false,
    currentMountpoint: null,
    selectedPlaylistId: null,
    playlists: [],

    /**
     * Detect connected iPods and populate dropdown
     */
    detect: function() {
        WebPod.api('/api/ipod/detect').then(function(data) {
            var select = document.getElementById('ipod-select');
            select.innerHTML = '';

            var devices = data.devices || data || [];
            if (devices.length === 0) {
                var opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'No iPods detected';
                select.appendChild(opt);
            } else {
                devices.forEach(function(device) {
                    var opt = document.createElement('option');
                    opt.value = device.mountpoint || device.path || device;
                    opt.textContent = device.name || device.mountpoint || device;
                    select.appendChild(opt);
                });
            }

            // Add manual option
            var manualOpt = document.createElement('option');
            manualOpt.value = '__manual__';
            manualOpt.textContent = 'Manual...';
            select.appendChild(manualOpt);

            select.addEventListener('change', function() {
                IPod.handleDeviceSelect();
            });
        }).catch(function() {
            var select = document.getElementById('ipod-select');
            select.innerHTML = '<option value="">Detection failed</option>';
            var manualOpt = document.createElement('option');
            manualOpt.value = '__manual__';
            manualOpt.textContent = 'Manual...';
            select.appendChild(manualOpt);
        });
    },

    /**
     * Handle device selection change
     */
    handleDeviceSelect: function() {
        var select = document.getElementById('ipod-select');
        if (select.value === '__manual__') {
            // Replace select with text input temporarily
            var input = document.createElement('input');
            input.type = 'text';
            input.id = 'ipod-manual-input';
            input.placeholder = '/mnt/ipod';
            input.style.width = '100%';
            select.style.display = 'none';
            select.parentNode.insertBefore(input, select.nextSibling);
            input.focus();

            // Allow pressing Enter to confirm
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    IPod.currentMountpoint = input.value.trim();
                    input.remove();
                    select.style.display = '';
                    if (IPod.currentMountpoint) {
                        IPod.connect();
                    }
                } else if (e.key === 'Escape') {
                    input.remove();
                    select.style.display = '';
                    select.value = '';
                }
            });
        }
    },

    /**
     * Connect to selected iPod
     */
    connect: function() {
        var select = document.getElementById('ipod-select');
        var mountpoint = IPod.currentMountpoint || select.value;
        if (!mountpoint || mountpoint === '__manual__') {
            WebPod.toast('Please select an iPod', 'warning');
            return;
        }

        IPod.currentMountpoint = mountpoint;
        WebPod.api('/api/ipod/connect', {
            method: 'POST',
            body: { mountpoint: mountpoint }
        }).then(function(data) {
            IPod.connected = true;
            document.getElementById('ipod-status-text').textContent = 'Connected: ' + (data.name || mountpoint);
            document.getElementById('playlists-area').classList.remove('hidden');
            document.getElementById('connect-btn').classList.add('hidden');
            document.getElementById('disconnect-btn').classList.remove('hidden');
            document.getElementById('sync-btn').disabled = false;
            IPod.loadPlaylists();
            WebPod.toast('iPod connected', 'success');
        });
    },

    /**
     * Disconnect from iPod
     */
    disconnect: function() {
        WebPod.api('/api/ipod/disconnect', { method: 'POST' }).then(function() {
            IPod.connected = false;
            IPod.currentMountpoint = null;
            IPod.selectedPlaylistId = null;
            document.getElementById('ipod-status-text').textContent = 'No iPod connected';
            document.getElementById('playlists-area').classList.add('hidden');
            document.getElementById('connect-btn').classList.remove('hidden');
            document.getElementById('disconnect-btn').classList.add('hidden');
            document.getElementById('sync-btn').disabled = true;
            document.getElementById('sync-btn').classList.remove('btn-pulse');
            document.getElementById('playlists-list').innerHTML = '';
            document.getElementById('ipod-tracks-tbody').innerHTML = '';
            WebPod.toast('iPod disconnected', 'info');
        });
    },

    /**
     * Load and render playlists
     */
    loadPlaylists: function() {
        WebPod.api('/api/ipod/playlists').then(function(data) {
            var list = document.getElementById('playlists-list');
            var playlists = data.playlists || data || [];
            IPod.playlists = playlists;
            list.innerHTML = '';

            playlists.forEach(function(pl) {
                var li = document.createElement('li');
                li.dataset.playlistId = pl.id;
                li.className = 'playlist-item';

                var nameSpan = document.createElement('span');
                nameSpan.className = 'playlist-name';
                nameSpan.textContent = pl.name || 'Untitled';

                var badge = document.createElement('span');
                badge.className = 'playlist-count';
                badge.textContent = pl.track_count || 0;

                li.appendChild(nameSpan);
                li.appendChild(badge);

                // Delete button (not on master playlist)
                if (!pl.is_master) {
                    var deleteBtn = document.createElement('button');
                    deleteBtn.className = 'playlist-delete';
                    deleteBtn.textContent = '\u00d7';
                    deleteBtn.title = 'Delete playlist';
                    deleteBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        IPod.deletePlaylist(pl.id, pl.name);
                    });
                    li.appendChild(deleteBtn);
                }

                // Click to select and load tracks
                li.addEventListener('click', function() {
                    var items = list.querySelectorAll('li');
                    items.forEach(function(item) { item.classList.remove('selected'); });
                    li.classList.add('selected');
                    IPod.selectedPlaylistId = pl.id;
                    IPod.loadPlaylistTracks(pl.id);
                });

                list.appendChild(li);
            });
        });
    },

    /**
     * Load tracks for a specific playlist
     */
    loadPlaylistTracks: function(playlistId) {
        WebPod.api('/api/ipod/playlists/' + playlistId + '/tracks').then(function(data) {
            var tracks = data.tracks || data || [];
            IPod.renderIpodTracks(tracks);

            // Switch to iPod tracks view
            if (WebPod.currentView !== 'ipod-tracks') {
                WebPod.switchView('ipod-tracks');
            }
        });
    },

    /**
     * Load all iPod tracks
     */
    loadTracks: function() {
        if (!IPod.connected) {
            document.getElementById('ipod-tracks-tbody').innerHTML = '';
            return;
        }
        WebPod.api('/api/ipod/tracks').then(function(data) {
            var tracks = data.tracks || data || [];
            IPod.renderIpodTracks(tracks);
        });
    },

    /**
     * Render tracks into the iPod tracks table
     */
    renderIpodTracks: function(tracks) {
        var tbody = document.getElementById('ipod-tracks-tbody');
        tbody.innerHTML = '';

        tracks.forEach(function(track) {
            var tr = document.createElement('tr');
            tr.dataset.trackId = track.id;

            var tdTitle = document.createElement('td');
            tdTitle.textContent = track.title || 'Unknown';

            var tdArtist = document.createElement('td');
            tdArtist.textContent = track.artist || 'Unknown';

            var tdAlbum = document.createElement('td');
            tdAlbum.textContent = track.album || 'Unknown';

            var tdDuration = document.createElement('td');
            tdDuration.textContent = WebPod.formatDuration(track.duration);

            tr.appendChild(tdTitle);
            tr.appendChild(tdArtist);
            tr.appendChild(tdAlbum);
            tr.appendChild(tdDuration);

            tbody.appendChild(tr);
        });
    },

    /**
     * Show create playlist dialog
     */
    createPlaylist: function() {
        var dialog = document.getElementById('playlist-dialog');
        var input = document.getElementById('playlist-name-input');
        var cancelBtn = document.getElementById('playlist-cancel');
        var confirmBtn = document.getElementById('playlist-confirm');

        input.value = '';
        dialog.classList.remove('hidden');
        input.focus();

        function cleanup() {
            dialog.classList.add('hidden');
            cancelBtn.removeEventListener('click', onCancel);
            confirmBtn.removeEventListener('click', onConfirm);
            input.removeEventListener('keydown', onKeydown);
        }

        function onCancel() {
            cleanup();
        }

        function onConfirm() {
            var name = input.value.trim();
            if (!name) {
                WebPod.toast('Please enter a playlist name', 'warning');
                return;
            }
            WebPod.api('/api/ipod/playlists', {
                method: 'POST',
                body: { name: name }
            }).then(function() {
                WebPod.toast('Playlist "' + name + '" created', 'success');
                IPod.loadPlaylists();
                cleanup();
            });
        }

        function onKeydown(e) {
            if (e.key === 'Enter') onConfirm();
            else if (e.key === 'Escape') onCancel();
        }

        cancelBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
        input.addEventListener('keydown', onKeydown);
    },

    /**
     * Delete a playlist with confirmation
     */
    deletePlaylist: function(id, name) {
        if (!confirm('Delete playlist "' + (name || 'Untitled') + '"?')) return;

        WebPod.api('/api/ipod/playlists/' + id, {
            method: 'DELETE'
        }).then(function() {
            WebPod.toast('Playlist deleted', 'success');
            IPod.selectedPlaylistId = null;
            IPod.loadPlaylists();
        });
    },

    /**
     * Initialize iPod module
     */
    init: function() {
        document.getElementById('connect-btn').addEventListener('click', function() {
            IPod.connect();
        });
        document.getElementById('disconnect-btn').addEventListener('click', function() {
            IPod.disconnect();
        });
        document.getElementById('new-playlist-btn').addEventListener('click', function() {
            IPod.createPlaylist();
        });
    }
};

document.addEventListener('DOMContentLoaded', IPod.init);
