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

        // Browse buttons
        document.getElementById('music-browse-btn').addEventListener('click', function() {
            FolderBrowser.open(musicInput);
        });
        document.getElementById('podcast-browse-btn').addEventListener('click', function() {
            FolderBrowser.open(podcastInput);
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
        FolderBrowser.init();

        // Default view
        WebPod.switchView('albums');
    }
};

/**
 * Folder Browser module
 */
var FolderBrowser = {
    currentPath: null,
    targetInput: null,

    /**
     * Open the folder browser dialog
     */
    open: function(targetInput) {
        FolderBrowser.targetInput = targetInput;

        // Use current input value as starting path, or let API default to home
        var startPath = targetInput.value.trim() || '';
        FolderBrowser.loadDirectory(startPath);
        document.getElementById('folder-browser-dialog').classList.remove('hidden');
    },

    /**
     * Close the folder browser dialog
     */
    close: function() {
        document.getElementById('folder-browser-dialog').classList.add('hidden');
        FolderBrowser.targetInput = null;
    },

    /**
     * Load and display directory contents
     */
    loadDirectory: function(path) {
        var folderList = document.getElementById('folder-list');
        var loading = document.getElementById('folder-loading');
        var error = document.getElementById('folder-error');
        var empty = document.getElementById('folder-empty');

        // Show loading state
        folderList.innerHTML = '';
        loading.classList.remove('hidden');
        error.classList.add('hidden');
        empty.classList.add('hidden');

        // Build URL with optional path parameter
        var url = '/api/browse';
        if (path) {
            url += '?path=' + encodeURIComponent(path);
        }

        WebPod.api(url)
            .then(function(data) {
                loading.classList.add('hidden');
                FolderBrowser.currentPath = data.current_path;

                // Update path display
                document.getElementById('folder-path-input').value = data.current_path;

                // Update up button state
                var upBtn = document.getElementById('folder-up-btn');
                upBtn.disabled = !data.parent_path;
                upBtn.dataset.parentPath = data.parent_path || '';

                // Populate quick access
                FolderBrowser.renderQuickAccess(data.quick_access);

                // Show error if any
                if (data.error) {
                    error.textContent = data.error;
                    error.classList.remove('hidden');
                }

                // Render folder list
                if (data.directories && data.directories.length > 0) {
                    FolderBrowser.renderFolderList(data.directories);
                } else if (!data.error) {
                    empty.classList.remove('hidden');
                }
            })
            .catch(function(err) {
                loading.classList.add('hidden');
                error.textContent = err.message || 'Failed to load directory';
                error.classList.remove('hidden');
            });
    },

    /**
     * Render the quick access sidebar
     */
    renderQuickAccess: function(paths) {
        var list = document.getElementById('folder-quick-access');
        list.innerHTML = '';

        if (!paths) return;

        paths.forEach(function(item) {
            var li = document.createElement('li');
            li.textContent = item.name;
            li.title = item.path;
            li.addEventListener('click', function() {
                FolderBrowser.loadDirectory(item.path);
            });
            list.appendChild(li);
        });
    },

    /**
     * Render the folder list
     */
    renderFolderList: function(directories) {
        var container = document.getElementById('folder-list');
        container.innerHTML = '';

        directories.forEach(function(dir) {
            var item = document.createElement('div');
            item.className = 'folder-item';
            item.dataset.path = dir.path;

            var icon = document.createElement('span');
            icon.className = 'folder-icon';
            icon.textContent = '\uD83D\uDCC1';  // Folder emoji

            var name = document.createElement('span');
            name.className = 'folder-name';
            name.textContent = dir.name;
            name.title = dir.path;

            item.appendChild(icon);
            item.appendChild(name);

            // Double-click to navigate into folder
            item.addEventListener('dblclick', function() {
                FolderBrowser.loadDirectory(dir.path);
            });

            // Single click to select
            item.addEventListener('click', function() {
                container.querySelectorAll('.folder-item.selected').forEach(function(el) {
                    el.classList.remove('selected');
                });
                item.classList.add('selected');
            });

            container.appendChild(item);
        });
    },

    /**
     * Navigate to parent directory
     */
    goUp: function() {
        var upBtn = document.getElementById('folder-up-btn');
        var parentPath = upBtn.dataset.parentPath;
        if (parentPath) {
            FolderBrowser.loadDirectory(parentPath);
        }
    },

    /**
     * Select the current folder and close dialog
     */
    selectFolder: function() {
        if (FolderBrowser.currentPath && FolderBrowser.targetInput) {
            FolderBrowser.targetInput.value = FolderBrowser.currentPath;

            // Trigger input event so other handlers can react
            var event = new Event('input', { bubbles: true });
            FolderBrowser.targetInput.dispatchEvent(event);
        }
        FolderBrowser.close();
    },

    /**
     * Initialize folder browser event listeners
     */
    init: function() {
        // Up button
        document.getElementById('folder-up-btn').addEventListener('click', FolderBrowser.goUp);

        // Cancel button
        document.getElementById('folder-cancel-btn').addEventListener('click', FolderBrowser.close);

        // Select button
        document.getElementById('folder-select-btn').addEventListener('click', FolderBrowser.selectFolder);

        // Close on overlay click
        var dialog = document.getElementById('folder-browser-dialog');
        dialog.addEventListener('click', function(e) {
            if (e.target === dialog) {
                FolderBrowser.close();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && !dialog.classList.contains('hidden')) {
                FolderBrowser.close();
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', WebPod.init);
