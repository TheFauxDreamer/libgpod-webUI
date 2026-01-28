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
        var views = ['albums', 'tracks', 'ipod-tracks'];
        var buttons = {
            'albums': document.getElementById('view-albums'),
            'tracks': document.getElementById('view-tracks'),
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
                    buttons[v].classList.add('selected');
                } else {
                    buttons[v].classList.remove('selected');
                }
            }
        });

        if (view === 'albums') {
            Library.loadAlbums();
        } else if (view === 'tracks') {
            Library.loadTracks();
        } else if (view === 'ipod-tracks') {
            IPod.loadTracks();
        }
    },

    /**
     * Initialize path dialog
     */
    initPathDialog: function() {
        var dialog = document.getElementById('path-dialog');
        var input = document.getElementById('path-input');
        var setBtn = document.getElementById('set-path-btn');
        var cancelBtn = document.getElementById('path-cancel');
        var confirmBtn = document.getElementById('path-confirm');

        setBtn.addEventListener('click', function() {
            if (WebPod.libraryPath) {
                input.value = WebPod.libraryPath;
            }
            dialog.classList.remove('hidden');
            input.focus();
        });

        cancelBtn.addEventListener('click', function() {
            dialog.classList.add('hidden');
        });

        confirmBtn.addEventListener('click', function() {
            var path = input.value.trim();
            if (!path) {
                WebPod.toast('Please enter a path', 'warning');
                return;
            }
            WebPod.api('/api/library/set-path', {
                method: 'POST',
                body: { path: path }
            }).then(function(data) {
                WebPod.libraryPath = path;
                document.getElementById('library-path-display').textContent = path;
                document.getElementById('scan-btn').disabled = false;
                dialog.classList.add('hidden');
                WebPod.toast('Library path set', 'success');
            });
        });
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
        document.getElementById('view-ipod-tracks').addEventListener('click', function() {
            WebPod.switchView('ipod-tracks');
        });
    },

    /**
     * Load initial library path
     */
    loadLibraryPath: function() {
        WebPod.api('/api/library/path').then(function(data) {
            if (data.path) {
                WebPod.libraryPath = data.path;
                document.getElementById('library-path-display').textContent = data.path;
                document.getElementById('scan-btn').disabled = false;
            }
        }).catch(function() {
            // No path set yet
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
        WebPod.loadLibraryPath();
        IPod.detect();

        // Set up UI
        WebPod.initViewToggles();
        WebPod.initPathDialog();
        WebPod.initSearch();
        WebPod.initSort();

        // Default view
        WebPod.switchView('albums');
    }
};

document.addEventListener('DOMContentLoaded', WebPod.init);
