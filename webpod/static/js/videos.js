/**
 * WebPod - Videos Panel
 * Video browsing and selection
 */

var Videos = {
    selectedVideoIds: [],
    lastSelectedIndex: -1,
    allVideos: [],
    currentPage: 1,
    totalVideos: 0,

    /**
     * Create a video card element
     */
    createVideoCard: function(video, index) {
        var card = document.createElement('div');
        card.className = 'album-card video-card';
        card.draggable = true;
        card.dataset.videoId = video.id;
        card.dataset.index = index;

        var img = document.createElement('img');
        if (video.artwork_hash) {
            img.src = '/api/artwork/' + video.artwork_hash;
        } else {
            img.src = PLACEHOLDER_IMG;
        }
        img.alt = video.title || 'Unknown Video';
        img.onerror = function() {
            this.src = PLACEHOLDER_IMG;
        };

        var info = document.createElement('div');
        info.className = 'album-card-info';

        var title = document.createElement('div');
        title.className = 'album-card-title';
        title.textContent = video.title || 'Unknown Video';

        var details = document.createElement('div');
        details.className = 'album-card-count';
        var duration = WebPod.formatDuration(video.duration_ms);
        var format = video.format ? video.format.toUpperCase() : '';
        details.textContent = duration + (format ? ' - ' + format : '');

        info.appendChild(title);
        info.appendChild(details);
        card.appendChild(img);
        card.appendChild(info);

        // Click to select
        card.addEventListener('click', function(e) {
            Videos.handleVideoClick(e, video.id, index);
        });

        // Drag support
        card.addEventListener('dragstart', function(e) {
            if (Videos.selectedVideoIds.indexOf(video.id) === -1) {
                Videos.selectedVideoIds = [video.id];
                Videos.updateVideoSelection();
            }
            var dragData = JSON.stringify({
                type: 'tracks',
                track_ids: Videos.selectedVideoIds.slice()
            });
            e.dataTransfer.setData('text/plain', dragData);
            e.dataTransfer.effectAllowed = 'copy';
        });

        return card;
    },

    /**
     * Load and render video cards
     */
    loadVideos: function(search) {
        var url = '/api/videos';
        if (search) {
            url += '?search=' + encodeURIComponent(search);
        }
        WebPod.api(url).then(function(data) {
            var grid = document.getElementById('videos-grid');
            var empty = document.getElementById('empty-state');
            var videos = data.videos || [];
            Videos.allVideos = videos;
            Videos.totalVideos = data.total || videos.length;
            Videos.selectedVideoIds = [];
            Videos.lastSelectedIndex = -1;

            if (videos.length === 0) {
                grid.innerHTML = '<p class="no-content">No videos found. Set your video library path in Settings and scan.</p>';
                return;
            }
            if (empty) empty.classList.add('hidden');

            grid.innerHTML = '';
            videos.forEach(function(video, index) {
                var card = Videos.createVideoCard(video, index);
                grid.appendChild(card);
            });
        });
    },

    /**
     * Handle video card click with multi-select
     */
    handleVideoClick: function(e, videoId, index) {
        if (e.shiftKey && Videos.lastSelectedIndex >= 0) {
            var start = Math.min(Videos.lastSelectedIndex, index);
            var end = Math.max(Videos.lastSelectedIndex, index);
            if (!e.ctrlKey && !e.metaKey) {
                Videos.selectedVideoIds = [];
            }
            for (var i = start; i <= end; i++) {
                var id = Videos.allVideos[i].id;
                if (Videos.selectedVideoIds.indexOf(id) === -1) {
                    Videos.selectedVideoIds.push(id);
                }
            }
        } else if (e.ctrlKey || e.metaKey) {
            var idx = Videos.selectedVideoIds.indexOf(videoId);
            if (idx >= 0) {
                Videos.selectedVideoIds.splice(idx, 1);
            } else {
                Videos.selectedVideoIds.push(videoId);
            }
        } else {
            Videos.selectedVideoIds = [videoId];
        }
        Videos.lastSelectedIndex = index;
        Videos.updateVideoSelection();
    },

    /**
     * Update visual selection state on video cards
     */
    updateVideoSelection: function() {
        var cards = document.querySelectorAll('#videos-grid .video-card');
        cards.forEach(function(card) {
            var id = parseInt(card.dataset.videoId, 10);
            if (Videos.selectedVideoIds.indexOf(id) >= 0) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });

        // Show/hide "Add to Playlist" button based on selection
        var container = document.getElementById('add-to-playlist-container');
        if (container) {
            if (Videos.selectedVideoIds.length > 0 && IPod.connected) {
                container.classList.remove('hidden');
            } else {
                container.classList.add('hidden');
            }
        }
    },

    /**
     * Get currently selected video IDs (for Add to Playlist / sync)
     */
    getSelectedIds: function() {
        return Videos.selectedVideoIds.slice();
    },

    /**
     * Initialize videos module
     */
    init: function() {
        // Nothing special to initialize for now
    }
};

document.addEventListener('DOMContentLoaded', Videos.init);
