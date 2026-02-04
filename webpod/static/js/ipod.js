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

            // Update the "Add to Playlist" dropdown
            IPod.updatePlaylistDropdown();
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
     * Show M3U import dialog
     */
    showM3UDialog: function() {
        var dialog = document.getElementById('m3u-dialog');
        var input = document.getElementById('m3u-path-input');
        var results = document.getElementById('m3u-results');
        var importBtn = document.getElementById('m3u-import');
        var addBtn = document.getElementById('m3u-add-to-ipod');

        input.value = '';
        results.classList.add('hidden');
        importBtn.classList.remove('hidden');
        addBtn.classList.add('hidden');
        dialog.classList.remove('hidden');
        input.focus();
    },

    /**
     * Load M3U file and show matched tracks
     */
    loadM3U: function() {
        var input = document.getElementById('m3u-path-input');
        var path = input.value.trim();
        if (!path) {
            WebPod.toast('Please enter a path', 'error');
            return;
        }

        WebPod.api('/api/library/import-m3u', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path })
        }).then(function(data) {
            var results = document.getElementById('m3u-results');
            var stats = document.getElementById('m3u-stats');
            var list = document.getElementById('m3u-tracks-list');
            var importBtn = document.getElementById('m3u-import');
            var addBtn = document.getElementById('m3u-add-to-ipod');

            stats.innerHTML = '<strong>' + data.matched_count + '</strong> tracks matched, ' +
                '<strong>' + data.unmatched_count + '</strong> not found';

            list.innerHTML = '';
            if (data.matched_tracks && data.matched_tracks.length > 0) {
                var ul = document.createElement('ul');
                ul.className = 'm3u-track-list';
                data.matched_tracks.slice(0, 20).forEach(function(track) {
                    var li = document.createElement('li');
                    li.textContent = (track.artist || 'Unknown') + ' - ' + (track.title || 'Unknown');
                    ul.appendChild(li);
                });
                if (data.matched_tracks.length > 20) {
                    var more = document.createElement('li');
                    more.textContent = '... and ' + (data.matched_tracks.length - 20) + ' more';
                    more.className = 'm3u-more';
                    ul.appendChild(more);
                }
                list.appendChild(ul);
            }

            results.classList.remove('hidden');
            importBtn.classList.add('hidden');
            addBtn.classList.remove('hidden');

            // Store matched track IDs for adding
            IPod._m3uMatchedIds = data.matched_tracks.map(function(t) { return t.id; });
        }).catch(function(err) {
            WebPod.toast(err.message || 'Failed to load playlist', 'error');
        });
    },

    /**
     * Add M3U matched tracks to iPod
     */
    addM3UToIPod: function() {
        if (!IPod._m3uMatchedIds || IPod._m3uMatchedIds.length === 0) {
            WebPod.toast('No tracks to add', 'error');
            return;
        }

        WebPod.api('/api/ipod/add-tracks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                track_ids: IPod._m3uMatchedIds,
                playlist_id: IPod.selectedPlaylistId
            })
        }).then(function(data) {
            var msg = 'Added ' + (data.added || 0) + ' tracks';
            if (data.duplicates) msg += ' (' + data.duplicates + ' duplicates skipped)';
            WebPod.toast(msg, 'success');
            document.getElementById('m3u-dialog').classList.add('hidden');
            IPod._m3uMatchedIds = null;
            IPod.loadTracks();
        }).catch(function(err) {
            WebPod.toast(err.message || 'Failed to add tracks', 'error');
        });
    },

    /**
     * Update "Add to Playlist" dropdown with current playlists
     */
    updatePlaylistDropdown: function() {
        var list = document.getElementById('playlist-dropdown-list');
        if (!list) return;

        list.innerHTML = '';
        IPod.playlists.forEach(function(pl) {
            if (pl.is_master) return; // Skip master playlist
            var item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = pl.name;
            item.dataset.playlistId = pl.id;
            item.addEventListener('click', function() {
                IPod.addSelectedToPlaylist(pl.id, pl.name);
            });
            list.appendChild(item);
        });
    },

    /**
     * Add currently selected library tracks to a playlist
     */
    addSelectedToPlaylist: function(playlistId, playlistName) {
        // Check for expansion selection first, then fall back to tracks view selection
        var trackIds = Library.expansionSelectedIds.length > 0
            ? Library.expansionSelectedIds
            : Library.selectedTrackIds;

        if (!trackIds || trackIds.length === 0) {
            WebPod.toast('No tracks selected', 'error');
            return;
        }

        document.getElementById('playlist-dropdown').classList.add('hidden');

        WebPod.api('/api/ipod/add-tracks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                track_ids: trackIds,
                playlist_id: playlistId
            })
        }).then(function(data) {
            var msg = 'Added ' + (data.added || 0) + ' tracks to ' + (playlistName || 'iPod');
            if (data.duplicates) msg += ' (' + data.duplicates + ' duplicates skipped)';
            WebPod.toast(msg, 'success');

            // Clear appropriate selection
            if (Library.expansionSelectedIds.length > 0) {
                Library.expansionSelectedIds = [];
                Library.updateExpansionSelection();
            } else {
                Library.clearSelection();
            }

            IPod.loadTracks();
            IPod.loadPlaylists();
        }).catch(function(err) {
            WebPod.toast(err.message || 'Failed to add tracks', 'error');
        });
    },

    /**
     * Initialize Add All Content modal
     */
    initAddAllContent: function() {
        var dialog = document.getElementById('add-all-dialog');
        var openBtn = document.getElementById('add-all-content-btn');
        var cancelBtn = document.getElementById('add-all-cancel');
        var syncBtn = document.getElementById('add-all-sync');
        var musicCheckbox = document.getElementById('add-all-music');
        var podcastCheckbox = document.getElementById('add-all-podcasts');
        var formatSelect = document.getElementById('add-all-format');
        var musicOptions = document.getElementById('music-options');
        var summary = document.getElementById('add-all-summary');

        // Track IDs to sync
        var pendingTrackIds = [];

        // Open dialog
        openBtn.addEventListener('click', function() {
            if (!IPod.connected) {
                WebPod.toast('Connect an iPod first', 'error');
                return;
            }
            dialog.classList.remove('hidden');
            updateSummary();
        });

        // Close dialog
        cancelBtn.addEventListener('click', function() {
            dialog.classList.add('hidden');
        });

        // Toggle music options visibility
        musicCheckbox.addEventListener('change', function() {
            musicOptions.classList.toggle('hidden', !this.checked);
            updateSummary();
        });

        // Update on podcast checkbox change
        podcastCheckbox.addEventListener('change', updateSummary);

        // Update on format change
        formatSelect.addEventListener('change', updateSummary);

        // Update summary with track counts
        function updateSummary() {
            var includeMusic = musicCheckbox.checked;
            var includePodcasts = podcastCheckbox.checked;
            var format = formatSelect.value;

            if (!includeMusic && !includePodcasts) {
                summary.textContent = 'Select content to add';
                syncBtn.disabled = true;
                pendingTrackIds = [];
                return;
            }

            summary.textContent = 'Calculating...';
            syncBtn.disabled = true;

            // Build requests
            var requests = [];

            if (includeMusic) {
                var musicUrl = '/api/library/all-track-ids?type=music';
                if (format !== 'all') {
                    musicUrl += '&formats=' + format;
                }
                requests.push(WebPod.api(musicUrl).then(function(data) {
                    return { type: 'music', ids: data.track_ids, count: data.count };
                }));
            }

            if (includePodcasts) {
                requests.push(WebPod.api('/api/library/all-track-ids?type=podcast').then(function(data) {
                    return { type: 'podcast', ids: data.track_ids, count: data.count };
                }));
            }

            Promise.all(requests).then(function(results) {
                var musicCount = 0;
                var podcastCount = 0;
                pendingTrackIds = [];

                results.forEach(function(result) {
                    if (result.type === 'music') {
                        musicCount = result.count;
                        pendingTrackIds = pendingTrackIds.concat(result.ids);
                    } else {
                        podcastCount = result.count;
                        pendingTrackIds = pendingTrackIds.concat(result.ids);
                    }
                });

                var parts = [];
                if (musicCount > 0) parts.push(musicCount + ' music track' + (musicCount !== 1 ? 's' : ''));
                if (podcastCount > 0) parts.push(podcastCount + ' podcast episode' + (podcastCount !== 1 ? 's' : ''));

                if (parts.length > 0) {
                    summary.textContent = 'Will add: ' + parts.join(', ');
                    syncBtn.disabled = false;
                } else {
                    summary.textContent = 'No content found';
                    syncBtn.disabled = true;
                }
            }).catch(function(err) {
                summary.textContent = 'Error loading content';
                syncBtn.disabled = true;
            });
        }

        // Sync to iPod
        syncBtn.addEventListener('click', function() {
            if (pendingTrackIds.length === 0) return;

            syncBtn.disabled = true;
            syncBtn.textContent = 'Syncing...';

            WebPod.api('/api/ipod/add-tracks', {
                method: 'POST',
                body: { track_ids: pendingTrackIds }
            }).then(function(data) {
                var added = data.added ? data.added.length : 0;
                var skipped = data.skipped_duplicates ? data.skipped_duplicates.length : 0;
                var errors = data.errors ? data.errors.length : 0;

                var msg = 'Added ' + added + ' tracks to iPod';
                if (skipped > 0) msg += ', ' + skipped + ' duplicates skipped';
                if (errors > 0) msg += ', ' + errors + ' errors';

                WebPod.toast(msg, errors > 0 ? 'warning' : 'success');
                dialog.classList.add('hidden');
                IPod.loadTracks();

                syncBtn.textContent = 'Sync to iPod';
                syncBtn.disabled = false;
            }).catch(function(err) {
                WebPod.toast('Sync failed: ' + (err.message || 'Unknown error'), 'error');
                syncBtn.textContent = 'Sync to iPod';
                syncBtn.disabled = false;
            });
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

        // M3U import handlers
        document.getElementById('import-m3u-btn').addEventListener('click', function() {
            IPod.showM3UDialog();
        });
        document.getElementById('m3u-cancel').addEventListener('click', function() {
            document.getElementById('m3u-dialog').classList.add('hidden');
        });
        document.getElementById('m3u-import').addEventListener('click', function() {
            IPod.loadM3U();
        });
        document.getElementById('m3u-add-to-ipod').addEventListener('click', function() {
            IPod.addM3UToIPod();
        });
        document.getElementById('m3u-path-input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') IPod.loadM3U();
        });

        // Add to Playlist dropdown
        var addBtn = document.getElementById('add-to-playlist-btn');
        var dropdown = document.getElementById('playlist-dropdown');
        if (addBtn && dropdown) {
            addBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                dropdown.classList.toggle('hidden');
            });

            // Create new playlist option
            dropdown.querySelector('[data-action="new"]').addEventListener('click', function() {
                dropdown.classList.add('hidden');
                IPod.createPlaylist();
            });

            // Close dropdown when clicking elsewhere
            document.addEventListener('click', function() {
                dropdown.classList.add('hidden');
            });
        }

        // Initialize Add All Content modal
        IPod.initAddAllContent();
    }
};

document.addEventListener('DOMContentLoaded', IPod.init);
