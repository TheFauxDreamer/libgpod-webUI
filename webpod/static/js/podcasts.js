/**
 * WebPod - Podcasts Panel
 * Podcast series and episode browsing
 */

var Podcasts = {
    selectedEpisodeIds: [],
    lastSelectedIndex: -1,
    allEpisodes: [],
    currentSeries: null,

    /**
     * Create a podcast series card element
     */
    createSeriesCard: function(series) {
        var card = document.createElement('div');
        card.className = 'album-card podcast-card';
        card.draggable = true;

        var img = document.createElement('img');
        if (series.artwork_hash) {
            img.src = '/api/artwork/' + series.artwork_hash;
        } else {
            img.src = PLACEHOLDER_IMG;
        }
        img.alt = series.series_name || 'Unknown Podcast';
        img.onerror = function() {
            this.src = PLACEHOLDER_IMG;
        };

        var info = document.createElement('div');
        info.className = 'album-card-info';

        var title = document.createElement('div');
        title.className = 'album-card-title';
        title.textContent = series.series_name || 'Unknown Podcast';

        var count = document.createElement('div');
        count.className = 'album-card-count';
        count.textContent = (series.episode_count || 0) + ' episodes';

        info.appendChild(title);
        info.appendChild(count);
        card.appendChild(img);
        card.appendChild(info);

        // Click to show episodes
        card.addEventListener('click', function() {
            Podcasts.loadEpisodes(series.series_name);
        });

        // Drag support - drag entire series
        card.addEventListener('dragstart', function(e) {
            var dragData = JSON.stringify({
                type: 'podcast_series',
                series_name: series.series_name
            });
            e.dataTransfer.setData('text/plain', dragData);
            e.dataTransfer.effectAllowed = 'copy';
        });

        return card;
    },

    /**
     * Load and render podcast series cards
     */
    loadSeries: function() {
        WebPod.api('/api/podcasts/series').then(function(data) {
            var grid = document.getElementById('podcast-series-grid');
            var episodesPanel = document.getElementById('podcast-episodes');
            var empty = document.getElementById('empty-state');
            var series = data.series || [];

            // Show series grid, hide episodes panel
            grid.classList.remove('hidden');
            episodesPanel.classList.add('hidden');
            Podcasts.currentSeries = null;

            if (series.length === 0) {
                grid.innerHTML = '<p class="no-content">No podcasts found. Set your podcast library path in Settings and scan.</p>';
                return;
            }
            if (empty) empty.classList.add('hidden');

            grid.innerHTML = '';
            series.forEach(function(s) {
                var card = Podcasts.createSeriesCard(s);
                grid.appendChild(card);
            });
        });
    },

    /**
     * Load episodes for a podcast series
     */
    loadEpisodes: function(seriesName) {
        Podcasts.currentSeries = seriesName;
        var grid = document.getElementById('podcast-series-grid');
        var episodesPanel = document.getElementById('podcast-episodes');
        var titleEl = document.getElementById('podcast-series-title');

        grid.classList.add('hidden');
        episodesPanel.classList.remove('hidden');
        titleEl.textContent = seriesName;

        WebPod.api('/api/podcasts/episodes/' + encodeURIComponent(seriesName))
            .then(function(data) {
                var tbody = document.getElementById('podcast-episodes-tbody');
                var episodes = data.episodes || [];
                Podcasts.allEpisodes = episodes;
                Podcasts.selectedEpisodeIds = [];
                Podcasts.lastSelectedIndex = -1;

                tbody.innerHTML = '';
                episodes.forEach(function(ep, index) {
                    var tr = document.createElement('tr');
                    tr.draggable = true;
                    tr.dataset.trackId = ep.id;
                    tr.dataset.index = index;

                    var tdNr = document.createElement('td');
                    tdNr.textContent = ep.track_nr || (index + 1);

                    var tdTitle = document.createElement('td');
                    tdTitle.textContent = ep.title || 'Unknown Episode';

                    var tdYear = document.createElement('td');
                    tdYear.textContent = ep.year || '';

                    var tdDuration = document.createElement('td');
                    tdDuration.textContent = WebPod.formatDuration(ep.duration_ms);

                    tr.appendChild(tdNr);
                    tr.appendChild(tdTitle);
                    tr.appendChild(tdYear);
                    tr.appendChild(tdDuration);

                    // Click to select with shift/ctrl support
                    tr.addEventListener('click', function(e) {
                        Podcasts.handleEpisodeClick(e, ep.id, index);
                    });

                    // Double-click to play
                    tr.addEventListener('dblclick', function(e) {
                        e.preventDefault();
                        Player.playTrack(ep, Podcasts.allEpisodes, index);
                    });

                    // Drag support
                    tr.addEventListener('dragstart', function(e) {
                        if (Podcasts.selectedEpisodeIds.indexOf(ep.id) === -1) {
                            Podcasts.selectedEpisodeIds = [ep.id];
                            Podcasts.updateEpisodeSelection();
                        }
                        var dragData = JSON.stringify({
                            type: 'tracks',
                            track_ids: Podcasts.selectedEpisodeIds.slice()
                        });
                        e.dataTransfer.setData('text/plain', dragData);
                        e.dataTransfer.effectAllowed = 'copy';
                    });

                    tbody.appendChild(tr);
                });
            });
    },

    /**
     * Handle episode row click with multi-select
     */
    handleEpisodeClick: function(e, episodeId, index) {
        if (e.shiftKey && Podcasts.lastSelectedIndex >= 0) {
            var start = Math.min(Podcasts.lastSelectedIndex, index);
            var end = Math.max(Podcasts.lastSelectedIndex, index);
            if (!e.ctrlKey && !e.metaKey) {
                Podcasts.selectedEpisodeIds = [];
            }
            for (var i = start; i <= end; i++) {
                var id = Podcasts.allEpisodes[i].id;
                if (Podcasts.selectedEpisodeIds.indexOf(id) === -1) {
                    Podcasts.selectedEpisodeIds.push(id);
                }
            }
        } else if (e.ctrlKey || e.metaKey) {
            var idx = Podcasts.selectedEpisodeIds.indexOf(episodeId);
            if (idx >= 0) {
                Podcasts.selectedEpisodeIds.splice(idx, 1);
            } else {
                Podcasts.selectedEpisodeIds.push(episodeId);
            }
        } else {
            Podcasts.selectedEpisodeIds = [episodeId];
        }
        Podcasts.lastSelectedIndex = index;
        Podcasts.updateEpisodeSelection();
    },

    /**
     * Update visual selection state on episode rows
     */
    updateEpisodeSelection: function() {
        var rows = document.querySelectorAll('#podcast-episodes-tbody tr');
        rows.forEach(function(row) {
            var id = parseInt(row.dataset.trackId, 10);
            if (Podcasts.selectedEpisodeIds.indexOf(id) >= 0) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        });

        // Show/hide "Add to Playlist" button based on selection
        var container = document.getElementById('add-to-playlist-container');
        if (container) {
            if (Podcasts.selectedEpisodeIds.length > 0 && IPod.connected) {
                container.classList.remove('hidden');
            } else {
                container.classList.add('hidden');
            }
        }
    },

    /**
     * Go back to series view
     */
    backToSeries: function() {
        Podcasts.loadSeries();
    },

    /**
     * Get currently selected track IDs (for Add to Playlist)
     */
    getSelectedIds: function() {
        return Podcasts.selectedEpisodeIds.slice();
    },

    /**
     * Initialize podcast module
     */
    init: function() {
        var backBtn = document.getElementById('podcast-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                Podcasts.backToSeries();
            });
        }
    }
};

document.addEventListener('DOMContentLoaded', Podcasts.init);
