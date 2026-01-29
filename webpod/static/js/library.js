/**
 * WebPod - Library Panel
 * Album and track browsing, scanning
 */

// Inline SVG placeholder - no external file needed
var PLACEHOLDER_IMG = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<rect fill="#333" width="100" height="100"/>' +
    '<circle cx="50" cy="50" r="30" fill="none" stroke="#555" stroke-width="4"/>' +
    '<circle cx="50" cy="50" r="10" fill="#555"/>' +
    '</svg>'
);

var Library = {
    selectedTrackIds: [],
    lastSelectedIndex: -1,
    allTracks: [],
    currentPage: 1,
    totalPages: 1,

    /**
     * Load and render album cards
     */
    loadAlbums: function(search) {
        var url = '/api/library/albums';
        if (search) {
            url += '?search=' + encodeURIComponent(search);
        }
        WebPod.api(url).then(function(data) {
            var grid = document.getElementById('albums-grid');
            var empty = document.getElementById('empty-state');
            var albums = data.albums || data || [];

            if (albums.length === 0) {
                grid.innerHTML = '';
                if (empty) empty.classList.remove('hidden');
                return;
            }
            if (empty) empty.classList.add('hidden');

            grid.innerHTML = '';
            albums.forEach(function(album) {
                var card = document.createElement('div');
                card.className = 'album-card';
                card.draggable = true;

                var img = document.createElement('img');
                if (album.artwork_hash) {
                    img.src = '/api/artwork/' + album.artwork_hash;
                } else {
                    img.src = PLACEHOLDER_IMG;
                }
                img.alt = album.album || 'Unknown Album';
                img.onerror = function() {
                    this.src = PLACEHOLDER_IMG;
                };

                var info = document.createElement('div');
                info.className = 'album-card-info';

                var title = document.createElement('div');
                title.className = 'album-card-title';
                title.textContent = album.album || 'Unknown Album';

                var artist = document.createElement('div');
                artist.className = 'album-card-artist';
                artist.textContent = album.artist || 'Unknown Artist';

                var count = document.createElement('div');
                count.className = 'album-card-count';
                count.textContent = (album.track_count || 0) + ' tracks';

                info.appendChild(title);
                info.appendChild(artist);
                info.appendChild(count);
                card.appendChild(img);
                card.appendChild(info);

                // Click to show album tracks
                card.addEventListener('click', function() {
                    Library.loadAlbumTracks(album.album);
                });

                // Drag support
                card.addEventListener('dragstart', function(e) {
                    var dragData = JSON.stringify({
                        type: 'album',
                        album: album.album,
                        artist: album.artist
                    });
                    e.dataTransfer.setData('text/plain', dragData);
                    e.dataTransfer.effectAllowed = 'copy';
                });

                grid.appendChild(card);
            });

            Library.updateStats(albums.length + ' albums');
        });
    },

    /**
     * Load and render track rows
     */
    loadTracks: function(search, sort, album) {
        var sortSelect = document.getElementById('sort-select');
        sort = sort || (sortSelect ? sortSelect.value : 'title');
        var url = '/api/library/tracks?per_page=500&sort=' + encodeURIComponent(sort);
        if (album) {
            url += '&album=' + encodeURIComponent(album);
        } else if (search) {
            url += '&search=' + encodeURIComponent(search);
        }

        WebPod.api(url).then(function(data) {
            var tbody = document.getElementById('tracks-tbody');
            var empty = document.getElementById('empty-state');
            var tracks = data.tracks || data || [];
            Library.allTracks = tracks;
            Library.selectedTrackIds = [];
            Library.lastSelectedIndex = -1;

            if (tracks.length === 0) {
                tbody.innerHTML = '';
                if (empty) empty.classList.remove('hidden');
                return;
            }
            if (empty) empty.classList.add('hidden');

            tbody.innerHTML = '';
            tracks.forEach(function(track, index) {
                var tr = document.createElement('tr');
                tr.draggable = true;
                tr.dataset.trackId = track.id;
                tr.dataset.index = index;

                var tdNr = document.createElement('td');
                tdNr.textContent = track.track_nr || '';

                var tdTitle = document.createElement('td');
                tdTitle.textContent = track.title || 'Unknown';

                var tdArtist = document.createElement('td');
                tdArtist.textContent = track.artist || 'Unknown';

                var tdAlbum = document.createElement('td');
                tdAlbum.textContent = track.album || 'Unknown';

                var tdGenre = document.createElement('td');
                tdGenre.textContent = track.genre || '';

                var tdDuration = document.createElement('td');
                tdDuration.textContent = WebPod.formatDuration(track.duration);

                tr.appendChild(tdNr);
                tr.appendChild(tdTitle);
                tr.appendChild(tdArtist);
                tr.appendChild(tdAlbum);
                tr.appendChild(tdGenre);
                tr.appendChild(tdDuration);

                // Click to select with shift/ctrl support
                tr.addEventListener('click', function(e) {
                    Library.handleTrackClick(e, track.id, index);
                });

                // Drag support
                tr.addEventListener('dragstart', function(e) {
                    // If dragging a non-selected row, select it alone
                    if (Library.selectedTrackIds.indexOf(track.id) === -1) {
                        Library.selectedTrackIds = [track.id];
                        Library.updateTrackSelection();
                    }
                    var dragData = JSON.stringify({
                        type: 'tracks',
                        track_ids: Library.selectedTrackIds.slice()
                    });
                    e.dataTransfer.setData('text/plain', dragData);
                    e.dataTransfer.effectAllowed = 'copy';
                });

                tbody.appendChild(tr);
            });

            Library.updateStats(tracks.length + ' tracks');
        });
    },

    /**
     * Handle track row click with multi-select
     */
    handleTrackClick: function(e, trackId, index) {
        if (e.shiftKey && Library.lastSelectedIndex >= 0) {
            // Range select
            var start = Math.min(Library.lastSelectedIndex, index);
            var end = Math.max(Library.lastSelectedIndex, index);
            if (!e.ctrlKey && !e.metaKey) {
                Library.selectedTrackIds = [];
            }
            for (var i = start; i <= end; i++) {
                var id = Library.allTracks[i].id;
                if (Library.selectedTrackIds.indexOf(id) === -1) {
                    Library.selectedTrackIds.push(id);
                }
            }
        } else if (e.ctrlKey || e.metaKey) {
            // Toggle single
            var idx = Library.selectedTrackIds.indexOf(trackId);
            if (idx >= 0) {
                Library.selectedTrackIds.splice(idx, 1);
            } else {
                Library.selectedTrackIds.push(trackId);
            }
        } else {
            // Single select
            Library.selectedTrackIds = [trackId];
        }
        Library.lastSelectedIndex = index;
        Library.updateTrackSelection();
    },

    /**
     * Update visual selection state on track rows
     */
    updateTrackSelection: function() {
        var rows = document.querySelectorAll('#tracks-tbody tr');
        rows.forEach(function(row) {
            var id = parseInt(row.dataset.trackId, 10);
            if (Library.selectedTrackIds.indexOf(id) >= 0) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        });

        // Show/hide "Add to Playlist" button based on selection
        var container = document.getElementById('add-to-playlist-container');
        if (container) {
            if (Library.selectedTrackIds.length > 0 && IPod.connected) {
                container.classList.remove('hidden');
            } else {
                container.classList.add('hidden');
            }
        }
    },

    /**
     * Clear track selection
     */
    clearSelection: function() {
        Library.selectedTrackIds = [];
        Library.lastSelectedIndex = -1;
        Library.updateTrackSelection();
    },

    /**
     * Load tracks for a specific album, switch to tracks view
     */
    loadAlbumTracks: function(albumName) {
        WebPod.switchView('tracks');
        document.getElementById('search-input').value = albumName;
        Library.loadTracks(null, null, albumName);  // Use exact album filter
    },

    /**
     * Update the library stats display
     */
    updateStats: function(text) {
        var el = document.getElementById('library-stats');
        if (el) {
            el.textContent = text;
        }
    },

    /**
     * Initialize scan button
     */
    initScan: function() {
        var scanBtn = document.getElementById('scan-btn');
        scanBtn.addEventListener('click', function() {
            scanBtn.disabled = true;
            scanBtn.textContent = 'Scanning...';
            WebPod.api('/api/library/scan', { method: 'POST' })
                .then(function() {
                    WebPod.toast('Scan started', 'info');
                })
                .catch(function() {
                    scanBtn.disabled = false;
                    scanBtn.textContent = 'Scan Library';
                });
        });
    },

    /**
     * Initialize library module
     */
    init: function() {
        Library.initScan();
    }
};

document.addEventListener('DOMContentLoaded', Library.init);
