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

    // Tracks pagination state
    tracksPage: 1,
    tracksTotal: 0,
    tracksLoading: false,
    tracksPerPage: 100,
    tracksSearch: '',
    tracksSort: 'title',

    // Album expansion state
    expandedAlbum: null,
    expandedAlbumData: null,
    expandedAlbumCard: null,
    expansionTracks: [],
    expansionSelectedIds: [],
    expansionLastSelectedIndex: -1,

    /**
     * Load and render album cards
     */
    loadAlbums: function(search) {
        // Collapse any open expansion before reloading albums
        Library.collapseAlbum();

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

                // Click to show album tracks inline
                card.addEventListener('click', function() {
                    Library.loadAlbumTracks(album.album, album, card);
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
     * Load and render track rows with pagination support
     * @param {string} search - Search query
     * @param {string} sort - Sort field
     * @param {string} album - Album filter (if set, no pagination)
     * @param {boolean} append - If true, append to existing tracks
     */
    loadTracks: function(search, sort, album, append) {
        if (Library.tracksLoading) return;

        var sortSelect = document.getElementById('sort-select');
        sort = sort || (sortSelect ? sortSelect.value : 'title');

        // Reset pagination unless appending
        if (!append) {
            Library.tracksPage = 1;
            Library.allTracks = [];
            Library.selectedTrackIds = [];
            Library.lastSelectedIndex = -1;
            Library.tracksSearch = search || '';
            Library.tracksSort = sort;
        }

        Library.tracksLoading = true;

        // Build URL with pagination (unless filtering by album)
        var url = '/api/library/tracks?page=' + Library.tracksPage +
                  '&per_page=' + Library.tracksPerPage +
                  '&sort=' + encodeURIComponent(sort);
        if (album) {
            url = '/api/library/tracks?per_page=500&sort=' + encodeURIComponent(sort) +
                  '&album=' + encodeURIComponent(album);
        } else if (search) {
            url += '&search=' + encodeURIComponent(search);
        }

        WebPod.api(url).then(function(data) {
            var tbody = document.getElementById('tracks-tbody');
            var empty = document.getElementById('empty-state');
            var tracks = data.tracks || data || [];
            Library.tracksTotal = data.total || tracks.length;

            // Append or replace tracks
            if (append) {
                Library.allTracks = Library.allTracks.concat(tracks);
            } else {
                Library.allTracks = tracks;
                tbody.innerHTML = '';
            }

            Library.tracksLoading = false;

            if (Library.allTracks.length === 0) {
                if (empty) empty.classList.remove('hidden');
                Library.updateStats('0 tracks');
                return;
            }
            if (empty) empty.classList.add('hidden');

            // Render new tracks (all if replacing, or just new ones if appending)
            var startIndex = append ? (Library.allTracks.length - tracks.length) : 0;
            var tracksToRender = append ? tracks : Library.allTracks;

            tracksToRender.forEach(function(track, i) {
                var index = startIndex + i;
                var tr = document.createElement('tr');
                tr.draggable = true;
                tr.dataset.trackId = track.id;
                tr.dataset.index = index;

                var tdNr = document.createElement('td');
                tdNr.textContent = track.track_nr || '';

                var tdTitle = document.createElement('td');
                var trackTitle = track.title || 'Unknown';
                if (WebPod.showFormatTags && track.format) {
                    var formatSpan = document.createElement('span');
                    formatSpan.className = 'format-tag';
                    formatSpan.textContent = track.format.toUpperCase();
                    tdTitle.textContent = trackTitle;
                    tdTitle.appendChild(formatSpan);
                } else {
                    tdTitle.textContent = trackTitle;
                }

                var tdArtist = document.createElement('td');
                tdArtist.textContent = track.artist || 'Unknown';

                var tdAlbum = document.createElement('td');
                tdAlbum.textContent = track.album || 'Unknown';

                var tdGenre = document.createElement('td');
                tdGenre.textContent = track.genre || '';

                var tdDuration = document.createElement('td');
                tdDuration.textContent = WebPod.formatDuration(track.duration_ms);

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

            // Update stats to show loaded/total
            if (Library.tracksTotal > Library.allTracks.length) {
                Library.updateStats(Library.allTracks.length + ' of ' + Library.tracksTotal + ' tracks');
            } else {
                Library.updateStats(Library.allTracks.length + ' tracks');
            }
        }).catch(function() {
            Library.tracksLoading = false;
        });
    },

    /**
     * Load more tracks (infinite scroll)
     */
    loadMoreTracks: function() {
        if (Library.tracksLoading) return;
        if (Library.allTracks.length >= Library.tracksTotal) return;

        Library.tracksPage++;
        Library.loadTracks(Library.tracksSearch, Library.tracksSort, null, true);
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
     * Collapse any open album expansion
     */
    collapseAlbum: function() {
        var existing = document.querySelector('.album-expansion');
        if (existing) {
            existing.remove();
        }
        if (Library.expandedAlbumCard) {
            Library.expandedAlbumCard.classList.remove('expanded');
        }
        Library.expandedAlbum = null;
        Library.expandedAlbumData = null;
        Library.expandedAlbumCard = null;
        Library.expansionTracks = [];
        Library.expansionSelectedIds = [];
        Library.expansionLastSelectedIndex = -1;

        // Hide "Add to Playlist" button
        var container = document.getElementById('add-to-playlist-container');
        if (container) {
            container.classList.add('hidden');
        }
    },

    /**
     * Render the album expansion panel
     */
    renderAlbumExpansion: function(albumData, tracks, albumCard) {
        // Create expansion panel
        var panel = document.createElement('div');
        panel.className = 'album-expansion';

        // Close button
        var closeBtn = document.createElement('button');
        closeBtn.className = 'album-expansion-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            Library.collapseAlbum();
        });

        // Content container
        var content = document.createElement('div');
        content.className = 'album-expansion-content';

        // Header with album title and artist
        var header = document.createElement('div');
        header.className = 'album-expansion-header';

        var title = document.createElement('div');
        title.className = 'album-expansion-title';
        var albumTitle = albumData.album || 'Unknown Album';

        // Add format tag if setting enabled and all tracks are same format
        var formats = (albumData.formats || '').split(',').filter(Boolean);
        var isHomogeneous = formats.length === 1;
        if (WebPod.showFormatTags && isHomogeneous && formats[0]) {
            var formatTag = document.createElement('span');
            formatTag.className = 'format-tag';
            formatTag.textContent = formats[0].toUpperCase();
            title.textContent = albumTitle;
            title.appendChild(formatTag);
        } else {
            title.textContent = albumTitle;
        }

        var artist = document.createElement('div');
        artist.className = 'album-expansion-artist';
        artist.textContent = albumData.artist || 'Unknown Artist';
        if (albumData.year) {
            artist.textContent += ' (' + albumData.year + ')';
        }

        header.appendChild(title);
        header.appendChild(artist);

        // Track list container
        var trackList = document.createElement('div');
        trackList.className = 'album-expansion-tracks';

        // Group tracks by disc number
        var discGroups = {};
        tracks.forEach(function(track, index) {
            var discNum = track.cd_nr || 1;
            if (!discGroups[discNum]) {
                discGroups[discNum] = [];
            }
            discGroups[discNum].push({ track: track, globalIndex: index });
        });

        var discNumbers = Object.keys(discGroups).map(Number).sort(function(a, b) { return a - b; });
        var hasMultipleDiscs = discNumbers.length > 1 || (discNumbers.length === 1 && discNumbers[0] > 1);

        // Check if tracks have mixed formats (for format tag display)
        var trackFormats = tracks.map(function(t) { return t.format; }).filter(Boolean);
        var uniqueFormats = trackFormats.filter(function(f, i, arr) { return arr.indexOf(f) === i; });
        var showTrackFormats = WebPod.showFormatTags && uniqueFormats.length > 1;

        // Render each disc section
        discNumbers.forEach(function(discNum) {
            var discTracks = discGroups[discNum];

            // Add disc header if multiple discs
            if (hasMultipleDiscs) {
                var discHeader = document.createElement('div');
                discHeader.className = 'album-expansion-disc-header';
                discHeader.textContent = 'Disc ' + discNum;
                trackList.appendChild(discHeader);
            }

            // Create track grid for this disc
            var discGrid = document.createElement('div');
            discGrid.className = 'album-expansion-disc-tracks';
            var rowCount = Math.ceil(discTracks.length / 2);
            discGrid.style.gridTemplateRows = 'repeat(' + rowCount + ', auto)';

            discTracks.forEach(function(item, discIndex) {
                var track = item.track;
                var globalIndex = item.globalIndex;

                var row = document.createElement('div');
                row.className = 'album-expansion-track';
                row.draggable = true;
                row.dataset.trackId = track.id;
                row.dataset.index = globalIndex;

                var nr = document.createElement('span');
                nr.className = 'expansion-track-nr';
                nr.textContent = track.track_nr || (discIndex + 1);

                var titleSpan = document.createElement('span');
                titleSpan.className = 'expansion-track-title';
                var trackTitle = track.title || 'Unknown';
                if (showTrackFormats && track.format) {
                    var formatSpan = document.createElement('span');
                    formatSpan.className = 'format-tag';
                    formatSpan.textContent = track.format.toUpperCase();
                    titleSpan.textContent = trackTitle;
                    titleSpan.appendChild(formatSpan);
                } else {
                    titleSpan.textContent = trackTitle;
                }

                var duration = document.createElement('span');
                duration.className = 'expansion-track-duration';
                duration.textContent = WebPod.formatDuration(track.duration_ms);

                row.appendChild(nr);
                row.appendChild(titleSpan);
                row.appendChild(duration);

                // Click handler for selection
                row.addEventListener('click', function(e) {
                    e.stopPropagation();
                    Library.handleExpansionTrackClick(e, track.id, globalIndex);
                });

                // Drag handler
                row.addEventListener('dragstart', function(e) {
                    if (Library.expansionSelectedIds.indexOf(track.id) === -1) {
                        Library.expansionSelectedIds = [track.id];
                        Library.updateExpansionSelection();
                    }
                    var dragData = JSON.stringify({
                        type: 'tracks',
                        track_ids: Library.expansionSelectedIds.slice()
                    });
                    e.dataTransfer.setData('text/plain', dragData);
                    e.dataTransfer.effectAllowed = 'copy';
                });

                discGrid.appendChild(row);
            });

            trackList.appendChild(discGrid);
        });

        content.appendChild(header);
        content.appendChild(trackList);

        // Album art
        var artContainer = document.createElement('div');
        artContainer.className = 'album-expansion-art';

        var artImg = document.createElement('img');
        if (albumData.artwork_hash) {
            artImg.src = '/api/artwork/' + albumData.artwork_hash;
        } else {
            artImg.src = PLACEHOLDER_IMG;
        }
        artImg.alt = albumData.album || 'Album art';
        artImg.onerror = function() {
            this.src = PLACEHOLDER_IMG;
        };

        artContainer.appendChild(artImg);

        // Assemble panel
        panel.appendChild(closeBtn);
        panel.appendChild(content);
        panel.appendChild(artContainer);

        // Calculate grid position to insert after the last album in this row
        var grid = document.getElementById('albums-grid');
        var cards = Array.from(grid.querySelectorAll('.album-card'));
        var cardIndex = cards.indexOf(albumCard);

        // Get number of columns from computed grid style
        var gridStyle = window.getComputedStyle(grid);
        var columnsStr = gridStyle.getPropertyValue('grid-template-columns');
        var columns = columnsStr.split(' ').length;

        // Find last album in this row
        var rowStart = Math.floor(cardIndex / columns) * columns;
        var rowEnd = Math.min(rowStart + columns - 1, cards.length - 1);
        var lastCardInRow = cards[rowEnd];

        // Insert after last card in row
        lastCardInRow.insertAdjacentElement('afterend', panel);

        // Mark card as expanded
        albumCard.classList.add('expanded');
        Library.expandedAlbumCard = albumCard;
    },

    /**
     * Handle click on expansion track row with multi-select
     */
    handleExpansionTrackClick: function(e, trackId, index) {
        if (e.shiftKey && Library.expansionLastSelectedIndex >= 0) {
            // Range select
            var start = Math.min(Library.expansionLastSelectedIndex, index);
            var end = Math.max(Library.expansionLastSelectedIndex, index);
            if (!e.ctrlKey && !e.metaKey) {
                Library.expansionSelectedIds = [];
            }
            for (var i = start; i <= end; i++) {
                var id = Library.expansionTracks[i].id;
                if (Library.expansionSelectedIds.indexOf(id) === -1) {
                    Library.expansionSelectedIds.push(id);
                }
            }
        } else if (e.ctrlKey || e.metaKey) {
            // Toggle single
            var idx = Library.expansionSelectedIds.indexOf(trackId);
            if (idx >= 0) {
                Library.expansionSelectedIds.splice(idx, 1);
            } else {
                Library.expansionSelectedIds.push(trackId);
            }
        } else {
            // Single select
            Library.expansionSelectedIds = [trackId];
        }
        Library.expansionLastSelectedIndex = index;
        Library.updateExpansionSelection();
    },

    /**
     * Update visual selection state on expansion track rows
     */
    updateExpansionSelection: function() {
        var rows = document.querySelectorAll('.album-expansion-track');
        rows.forEach(function(row) {
            var id = parseInt(row.dataset.trackId, 10);
            if (Library.expansionSelectedIds.indexOf(id) >= 0) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        });

        // Show/hide "Add to Playlist" button based on selection
        var container = document.getElementById('add-to-playlist-container');
        if (container) {
            if (Library.expansionSelectedIds.length > 0 && IPod.connected) {
                container.classList.remove('hidden');
            } else {
                container.classList.add('hidden');
            }
        }
    },

    /**
     * Update existing expansion panel content (for same-row album switching)
     */
    updateExpansionContent: function(albumData, tracks, albumCard) {
        var panel = document.querySelector('.album-expansion');
        if (!panel) {
            // Fallback: create new panel if somehow missing
            Library.renderAlbumExpansion(albumData, tracks, albumCard);
            return;
        }

        // Update title and artist
        var title = panel.querySelector('.album-expansion-title');
        var artist = panel.querySelector('.album-expansion-artist');
        var albumTitle = albumData.album || 'Unknown Album';

        // Add format tag if setting enabled and all tracks are same format
        var formats = (albumData.formats || '').split(',').filter(Boolean);
        var isHomogeneous = formats.length === 1;
        title.innerHTML = '';
        if (WebPod.showFormatTags && isHomogeneous && formats[0]) {
            title.textContent = albumTitle;
            var formatTag = document.createElement('span');
            formatTag.className = 'format-tag';
            formatTag.textContent = formats[0].toUpperCase();
            title.appendChild(formatTag);
        } else {
            title.textContent = albumTitle;
        }

        artist.textContent = albumData.artist || 'Unknown Artist';
        if (albumData.year) {
            artist.textContent += ' (' + albumData.year + ')';
        }

        // Update album art
        var artImg = panel.querySelector('.album-expansion-art img');
        if (albumData.artwork_hash) {
            artImg.src = '/api/artwork/' + albumData.artwork_hash;
        } else {
            artImg.src = PLACEHOLDER_IMG;
        }

        // Rebuild track list
        var trackList = panel.querySelector('.album-expansion-tracks');
        trackList.innerHTML = '';

        // Group tracks by disc number
        var discGroups = {};
        tracks.forEach(function(track, index) {
            var discNum = track.cd_nr || 1;
            if (!discGroups[discNum]) {
                discGroups[discNum] = [];
            }
            discGroups[discNum].push({ track: track, globalIndex: index });
        });

        var discNumbers = Object.keys(discGroups).map(Number).sort(function(a, b) { return a - b; });
        var hasMultipleDiscs = discNumbers.length > 1 || (discNumbers.length === 1 && discNumbers[0] > 1);

        // Check if tracks have mixed formats (for format tag display)
        var trackFormats = tracks.map(function(t) { return t.format; }).filter(Boolean);
        var uniqueFormats = trackFormats.filter(function(f, i, arr) { return arr.indexOf(f) === i; });
        var showTrackFormats = WebPod.showFormatTags && uniqueFormats.length > 1;

        // Render each disc section
        discNumbers.forEach(function(discNum) {
            var discTracks = discGroups[discNum];

            // Add disc header if multiple discs
            if (hasMultipleDiscs) {
                var discHeader = document.createElement('div');
                discHeader.className = 'album-expansion-disc-header';
                discHeader.textContent = 'Disc ' + discNum;
                trackList.appendChild(discHeader);
            }

            // Create track grid for this disc
            var discGrid = document.createElement('div');
            discGrid.className = 'album-expansion-disc-tracks';
            var rowCount = Math.ceil(discTracks.length / 2);
            discGrid.style.gridTemplateRows = 'repeat(' + rowCount + ', auto)';

            discTracks.forEach(function(item, discIndex) {
                var track = item.track;
                var globalIndex = item.globalIndex;

                var row = document.createElement('div');
                row.className = 'album-expansion-track';
                row.draggable = true;
                row.dataset.trackId = track.id;
                row.dataset.index = globalIndex;

                var nr = document.createElement('span');
                nr.className = 'expansion-track-nr';
                nr.textContent = track.track_nr || (discIndex + 1);

                var titleSpan = document.createElement('span');
                titleSpan.className = 'expansion-track-title';
                var trackTitle = track.title || 'Unknown';
                if (showTrackFormats && track.format) {
                    var formatSpan = document.createElement('span');
                    formatSpan.className = 'format-tag';
                    formatSpan.textContent = track.format.toUpperCase();
                    titleSpan.textContent = trackTitle;
                    titleSpan.appendChild(formatSpan);
                } else {
                    titleSpan.textContent = trackTitle;
                }

                var duration = document.createElement('span');
                duration.className = 'expansion-track-duration';
                duration.textContent = WebPod.formatDuration(track.duration_ms);

                row.appendChild(nr);
                row.appendChild(titleSpan);
                row.appendChild(duration);

                row.addEventListener('click', function(e) {
                    e.stopPropagation();
                    Library.handleExpansionTrackClick(e, track.id, globalIndex);
                });

                row.addEventListener('dragstart', function(e) {
                    if (Library.expansionSelectedIds.indexOf(track.id) === -1) {
                        Library.expansionSelectedIds = [track.id];
                        Library.updateExpansionSelection();
                    }
                    var dragData = JSON.stringify({
                        type: 'tracks',
                        track_ids: Library.expansionSelectedIds.slice()
                    });
                    e.dataTransfer.setData('text/plain', dragData);
                    e.dataTransfer.effectAllowed = 'copy';
                });

                discGrid.appendChild(row);
            });

            trackList.appendChild(discGrid);
        });

        // Update expanded card highlight
        albumCard.classList.add('expanded');
        Library.expandedAlbumCard = albumCard;
    },

    /**
     * Load and display tracks for an album inline (iTunes 11 style)
     */
    loadAlbumTracks: function(albumName, albumData, albumCard) {
        // If same album clicked, toggle collapse
        if (Library.expandedAlbum === albumName) {
            Library.collapseAlbum();
            return;
        }

        // Check if we're switching albums within the same row
        var sameRow = false;
        if (Library.expandedAlbumCard) {
            var grid = document.getElementById('albums-grid');
            var cards = Array.from(grid.querySelectorAll('.album-card'));
            var gridStyle = window.getComputedStyle(grid);
            var columns = gridStyle.getPropertyValue('grid-template-columns').split(' ').length;

            var oldIndex = cards.indexOf(Library.expandedAlbumCard);
            var newIndex = cards.indexOf(albumCard);
            var oldRow = Math.floor(oldIndex / columns);
            var newRow = Math.floor(newIndex / columns);
            sameRow = (oldRow === newRow);
        }

        // If different row, collapse first
        if (!sameRow) {
            Library.collapseAlbum();
        }

        // Fetch tracks for this album
        var url = '/api/library/tracks?per_page=500&album=' + encodeURIComponent(albumName);
        WebPod.api(url).then(function(data) {
            var tracks = data.tracks || [];
            if (tracks.length === 0) {
                WebPod.toast('No tracks found for this album', 'warning');
                return;
            }

            // Update state
            if (Library.expandedAlbumCard) {
                Library.expandedAlbumCard.classList.remove('expanded');
            }
            Library.expandedAlbum = albumName;
            Library.expandedAlbumData = albumData;
            Library.expansionTracks = tracks;
            Library.expansionSelectedIds = [];
            Library.expansionLastSelectedIndex = -1;

            if (sameRow) {
                // Update existing panel content in place
                Library.updateExpansionContent(albumData, tracks, albumCard);
            } else {
                // Create new panel
                Library.renderAlbumExpansion(albumData, tracks, albumCard);
            }
        });
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
     * Initialize infinite scroll for tracks view
     */
    initTracksScroll: function() {
        var tracksView = document.getElementById('tracks-view');
        if (!tracksView) return;

        tracksView.addEventListener('scroll', function() {
            // Only load more if we're in tracks view
            if (WebPod.currentView !== 'tracks') return;

            // Load more when within 200px of the bottom
            var scrollBottom = tracksView.scrollHeight - tracksView.scrollTop - tracksView.clientHeight;
            if (scrollBottom < 200) {
                Library.loadMoreTracks();
            }
        });
    },

    /**
     * Initialize library module
     */
    init: function() {
        Library.initScan();
        Library.initTracksScroll();
    }
};

document.addEventListener('DOMContentLoaded', Library.init);
