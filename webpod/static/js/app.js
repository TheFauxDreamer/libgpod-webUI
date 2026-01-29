/**
 * WebPod - Core Application
 * Global namespace, utilities, initialization
 */
var WebPod = {
    socket: null,
    currentView: 'albums',
    libraryPath: null,
    searchTimeout: null,

    /**
     * Show a toast notification
     */
    toast: function(message, type) {
        type = type || 'info';
        var el = document.getElementById('toast');
        el.textContent = message;
        el.className = 'toast-' + type;
        el.classList.remove('hidden');
        clearTimeout(WebPod._toastTimer);
        WebPod._toastTimer = setTimeout(function() {
            el.classList.add('hidden');
        }, 3000);
    },

    /**
     * Format milliseconds to "m:ss"
     */
    formatDuration: function(ms) {
        if (!ms || ms <= 0) return '0:00';
        var totalSeconds = Math.floor(ms / 1000);
        var minutes = Math.floor(totalSeconds / 60);
        var seconds = totalSeconds % 60;
        return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    },

    /**
     * Fetch wrapper that returns JSON and shows toast on error
     */
    api: function(url, options) {
        options = options || {};
        if (options.body && typeof options.body === 'object') {
            options.headers = options.headers || {};
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }
        return fetch(url, options)
            .then(function(response) {
                if (!response.ok) {
                    return response.json().then(function(data) {
                        throw new Error(data.error || 'Request failed');
                    }).catch(function(e) {
                        if (e.message) throw e;
                        throw new Error('Request failed with status ' + response.status);
                    });
                }
                return response.json();
            })
            .catch(function(err) {
                WebPod.toast(err.message, 'error');
                throw err;
            });
    },

    /**
     * Switch between content views
     */
    switchView: function(view) {
        WebPod.currentView = view;
        var views = ['albums', 'tracks', 'podcasts', 'ipod-tracks'];
        var buttons = {
            'albums': document.getElementById('view-albums'),
            'tracks': document.getElementById('view-tracks'),
            'podcasts': document.getElementById('view-podcasts'),
            'ipod-tracks': document.getElementById('view-ipod-tracks')
        };
        views.forEach(function(v) {
            var el = document.getElementById(v + '-view');
            if (el) {
                if (v === view) {
                    el.classList.remove('hidden');
                } else {
                    el.classList.add('hidden');
                }
            }
            if (buttons[v]) {
                if (v === view) {
                    buttons[v].classList.add('active');
                } else {
                    buttons[v].classList.remove('active');
                }
            }
        });

        if (view === 'albums') {
            Library.loadAlbums();
        } else if (view === 'tracks') {
            Library.loadTracks();
        } else if (view === 'podcasts') {
            Podcasts.loadSeries();
        } else if (view === 'ipod-tracks') {
            IPod.loadTracks();
        }
    },

    /**
     * Initialize search with debounce
     */
    initSearch: function() {
        var searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', function() {
            clearTimeout(WebPod.searchTimeout);
            WebPod.searchTimeout = setTimeout(function() {
                var query = searchInput.value.trim();
                if (WebPod.currentView === 'albums') {
                    Library.loadAlbums(query);
                } else if (WebPod.currentView === 'tracks') {
                    Library.loadTracks(query);
                }
            }, 300);
        });
    },

    /**
     * Initialize sort dropdown
     */
    initSort: function() {
        var sortSelect = document.getElementById('sort-select');
        sortSelect.addEventListener('change', function() {
            if (WebPod.currentView === 'tracks') {
                Library.loadTracks(
                    document.getElementById('search-input').value.trim(),
                    sortSelect.value
                );
            } else if (WebPod.currentView === 'albums') {
                Library.loadAlbums(document.getElementById('search-input').value.trim());
            }
        });
    },

    /**
     * Initialize view toggle buttons
     */
    initViewToggles: function() {
        document.getElementById('view-albums').addEventListener('click', function() {
            WebPod.switchView('albums');
        });
        document.getElementById('view-tracks').addEventListener('click', function() {
            WebPod.switchView('tracks');
        });
        document.getElementById('view-podcasts').addEventListener('click', function() {
            WebPod.switchView('podcasts');
        });
        document.getElementById('view-ipod-tracks').addEventListener('click', function() {
            WebPod.switchView('ipod-tracks');
        });
    },

    /**
     * Load initial library path (legacy)
     */
    loadLibraryPath: function() {
        WebPod.api('/api/library/path').then(function(data) {
            if (data.path) {
                WebPod.libraryPath = data.path;
                var display = document.getElementById('library-path-display');
                if (display) display.textContent = data.path;
                var scanBtn = document.getElementById('scan-btn');
                if (scanBtn) scanBtn.disabled = false;
            }
        }).catch(function() {
            // No path set yet
        });
    },

    /**
     * Load and update settings status indicators
     */
    loadSettings: function() {
        WebPod.api('/api/settings').then(function(data) {
            // Update music status
            var musicStatus = document.getElementById('music-status');
            if (musicStatus) {
                var musicDot = musicStatus.querySelector('.status-dot');
                var musicText = musicStatus.querySelector('.status-text');
                if (data.music_set) {
                    musicDot.classList.remove('not-set');
                    musicDot.classList.add('set');
                    musicText.textContent = data.music_count + ' tracks';
                } else {
                    musicDot.classList.remove('set');
                    musicDot.classList.add('not-set');
                    musicText.textContent = 'Music library not set';
                }
            }

            // Update podcast status
            var podcastStatus = document.getElementById('podcast-status');
            if (podcastStatus) {
                var podcastDot = podcastStatus.querySelector('.status-dot');
                var podcastText = podcastStatus.querySelector('.status-text');
                if (data.podcast_set) {
                    podcastDot.classList.remove('not-set');
                    podcastDot.classList.add('set');
                    podcastText.textContent = data.podcast_count + ' episodes';
                } else {
                    podcastDot.classList.remove('set');
                    podcastDot.classList.add('not-set');
                    podcastText.textContent = 'Podcast library not set';
                }
            }

            // Store paths for settings dialog
            WebPod.musicPath = data.music_path || '';
            WebPod.podcastPath = data.podcast_path || '';
        }).catch(function() {
            // Settings not available
        });
    },

    /**
     * Initialize settings modal
     */
    initSettingsModal: function() {
        var settingsBtn = document.getElementById('settings-btn');
        var dialog = document.getElementById('settings-dialog');
        var saveBtn = document.getElementById('settings-save');
        var closeBtn = document.getElementById('settings-close');
        var musicInput = document.getElementById('music-path-input');
        var podcastInput = document.getElementById('podcast-path-input');
        var musicScanBtn = document.getElementById('music-scan-btn');
        var podcastScanBtn = document.getElementById('podcast-scan-btn');

        // Open settings dialog
        settingsBtn.addEventListener('click', function() {
            musicInput.value = WebPod.musicPath || '';
            podcastInput.value = WebPod.podcastPath || '';
            musicScanBtn.disabled = !WebPod.musicPath;
            podcastScanBtn.disabled = !WebPod.podcastPath;
            dialog.classList.remove('hidden');
        });

        // Enable/disable scan buttons based on path input
        musicInput.addEventListener('input', function() {
            musicScanBtn.disabled = !musicInput.value.trim();
        });
        podcastInput.addEventListener('input', function() {
            podcastScanBtn.disabled = !podcastInput.value.trim();
        });

        // Music scan button
        musicScanBtn.addEventListener('click', function() {
            // Save path first, then scan
            var path = musicInput.value.trim();
            if (!path) return;

            musicScanBtn.disabled = true;
            musicScanBtn.textContent = 'Scanning...';

            WebPod.api('/api/settings', {
                method: 'POST',
                body: { music_path: path }
            }).then(function() {
                WebPod.musicPath = path;
                return WebPod.api('/api/library/scan', { method: 'POST' });
            }).then(function() {
                WebPod.toast('Music scan started', 'info');
            }).catch(function() {
                musicScanBtn.disabled = false;
                musicScanBtn.textContent = 'Scan Music';
            });
        });

        // Podcast scan button
        podcastScanBtn.addEventListener('click', function() {
            var path = podcastInput.value.trim();
            if (!path) return;

            podcastScanBtn.disabled = true;
            podcastScanBtn.textContent = 'Scanning...';

            WebPod.api('/api/settings', {
                method: 'POST',
                body: { podcast_path: path }
            }).then(function() {
                WebPod.podcastPath = path;
                return WebPod.api('/api/library/scan-podcasts', { method: 'POST' });
            }).then(function() {
                WebPod.toast('Podcast scan started', 'info');
            }).catch(function() {
                podcastScanBtn.disabled = false;
                podcastScanBtn.textContent = 'Scan Podcasts';
            });
        });

        // Save settings
        saveBtn.addEventListener('click', function() {
            var musicPath = musicInput.value.trim();
            var podcastPath = podcastInput.value.trim();

            WebPod.api('/api/settings', {
                method: 'POST',
                body: {
                    music_path: musicPath,
                    podcast_path: podcastPath
                }
            }).then(function() {
                WebPod.musicPath = musicPath;
                WebPod.podcastPath = podcastPath;
                WebPod.loadSettings();
                dialog.classList.add('hidden');
                WebPod.toast('Settings saved', 'success');
            });
        });

        // Close dialog
        closeBtn.addEventListener('click', function() {
            dialog.classList.add('hidden');
        });

        // Close on overlay click
        dialog.addEventListener('click', function(e) {
            if (e.target === dialog) {
                dialog.classList.add('hidden');
            }
        });

        // Listen for scan progress events
        WebPod.socket.on('scan_progress', function(data) {
            var status = document.getElementById('music-scan-status');
            if (status) {
                status.textContent = data.scanned + '/' + data.total + ' - ' + data.current_file;
            }
        });

        WebPod.socket.on('scan_complete', function(data) {
            var musicScanBtn = document.getElementById('music-scan-btn');
            musicScanBtn.disabled = false;
            musicScanBtn.textContent = 'Scan Music';
            document.getElementById('music-scan-status').textContent = '';
            WebPod.loadSettings();
            WebPod.toast('Music scan complete: ' + data.total_tracks + ' tracks', 'success');
            if (WebPod.currentView === 'albums') {
                Library.loadAlbums();
            } else if (WebPod.currentView === 'tracks') {
                Library.loadTracks();
            }
        });

        WebPod.socket.on('podcast_scan_progress', function(data) {
            var status = document.getElementById('podcast-scan-status');
            if (status) {
                status.textContent = data.scanned + '/' + data.total + ' - ' + data.current_file;
            }
        });

        WebPod.socket.on('podcast_scan_complete', function(data) {
            var podcastScanBtn = document.getElementById('podcast-scan-btn');
            podcastScanBtn.disabled = false;
            podcastScanBtn.textContent = 'Scan Podcasts';
            document.getElementById('podcast-scan-status').textContent = '';
            WebPod.loadSettings();
            WebPod.toast('Podcast scan complete: ' + data.total_episodes + ' episodes', 'success');
            if (WebPod.currentView === 'podcasts') {
                Podcasts.loadSeries();
            }
        });
    },

    /**
     * Main initialization
     */
    init: function() {
        // Initialize SocketIO
        WebPod.socket = io();

        WebPod.socket.on('connect', function() {
            console.log('WebPod: SocketIO connected');
        });

        WebPod.socket.on('disconnect', function() {
            console.log('WebPod: SocketIO disconnected');
        });

        // Load initial state
        WebPod.loadSettings();
        IPod.detect();

        // Set up UI
        WebPod.initViewToggles();
        WebPod.initSettingsModal();
        WebPod.initSearch();
        WebPod.initSort();

        // Default view
        WebPod.switchView('albums');
    }
};

document.addEventListener('DOMContentLoaded', WebPod.init);
