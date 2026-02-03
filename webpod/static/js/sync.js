/**
 * WebPod - Sync & Progress
 * Manages sync operations and SocketIO progress events
 */
var Sync = {
    syncing: false,
    scanning: false,
    exporting: false,

    /**
     * Start a sync operation
     */
    start: function() {
        if (Sync.syncing) {
            WebPod.toast('Sync already in progress', 'warning');
            return;
        }
        if (!IPod.connected) {
            WebPod.toast('No iPod connected', 'warning');
            return;
        }

        Sync.syncing = true;
        Sync.showProgress('Syncing...', 0);

        var syncBtn = document.getElementById('sync-btn');
        syncBtn.disabled = true;
        syncBtn.classList.remove('btn-pulse');

        WebPod.api('/api/ipod/sync', { method: 'POST' })
            .then(function() {
                WebPod.toast('Sync started', 'info');
            })
            .catch(function() {
                Sync.syncing = false;
                Sync.hideProgress();
                syncBtn.disabled = false;
            });
    },

    /**
     * Show the progress bar
     */
    showProgress: function(text, percent) {
        var container = document.getElementById('progress-container');
        var bar = document.getElementById('progress-bar');
        var fill = document.getElementById('progress-fill');
        var progressText = document.getElementById('progress-text');

        container.classList.remove('hidden');
        if (fill) fill.style.width = (percent || 0) + '%';
        if (progressText) progressText.textContent = text || '';
    },

    /**
     * Hide the progress bar
     */
    hideProgress: function() {
        var container = document.getElementById('progress-container');
        container.classList.add('hidden');
    },

    /**
     * Initialize SocketIO event listeners and sync button
     */
    init: function() {
        // Sync button
        document.getElementById('sync-btn').addEventListener('click', function() {
            Sync.start();
        });

        // Wait for socket to be available, then bind events
        var bindEvents = function() {
            if (!WebPod.socket) {
                setTimeout(bindEvents, 100);
                return;
            }

            // Sync progress
            WebPod.socket.on('sync_progress', function(data) {
                var copied = data.copied || 0;
                var total = data.total || 1;
                var percent = Math.round((copied / total) * 100);
                var track = data.track || '';
                var text = 'Syncing: ' + copied + '/' + total;
                if (track) text += ' - ' + track;
                Sync.showProgress(text, percent);
            });

            // Sync complete
            WebPod.socket.on('sync_complete', function(data) {
                Sync.syncing = false;
                Sync.hideProgress();

                if (data.success) {
                    WebPod.toast('Sync complete', 'success');
                } else {
                    WebPod.toast('Sync failed: ' + (data.error || 'unknown error'), 'error');
                }

                var syncBtn = document.getElementById('sync-btn');
                syncBtn.disabled = !IPod.connected;

                // Refresh iPod tracks and playlists
                if (IPod.connected) {
                    IPod.loadTracks();
                    IPod.loadPlaylists();
                }
            });

            // Scan progress
            WebPod.socket.on('scan_progress', function(data) {
                Sync.scanning = true;
                var scanned = data.scanned || 0;
                var total = data.total || 1;
                var percent = Math.round((scanned / total) * 100);
                var file = data.current_file || '';
                var text = 'Scanning: ' + scanned + '/' + total;
                if (file) {
                    // Show just the filename, not full path
                    var parts = file.split('/');
                    text += ' - ' + parts[parts.length - 1];
                }
                Sync.showProgress(text, percent);
            });

            // Scan complete
            WebPod.socket.on('scan_complete', function(data) {
                Sync.scanning = false;
                Sync.hideProgress();

                var total = data.total_tracks || 0;
                WebPod.toast('Scan complete: ' + total + ' tracks found', 'success');

                // Re-enable scan button
                var scanBtn = document.getElementById('scan-btn');
                scanBtn.disabled = false;
                scanBtn.textContent = 'Scan Library';

                // Refresh the current library view
                if (WebPod.currentView === 'albums') {
                    Library.loadAlbums();
                } else if (WebPod.currentView === 'tracks') {
                    Library.loadTracks();
                }
            });

            // Export progress
            WebPod.socket.on('export_progress', function(data) {
                Sync.exporting = true;
                var exported = data.exported || 0;
                var total = data.total || 1;
                var percent = Math.round((exported / total) * 100);
                var track = data.track || '';
                var text = 'Exporting: ' + exported + '/' + total;
                if (track) text += ' - ' + track;
                Sync.showProgress(text, percent);
            });

            // Export complete
            WebPod.socket.on('export_complete', function(data) {
                Sync.exporting = false;
                Sync.hideProgress();

                var msg = 'Export complete: ' + data.exported + ' tracks exported';
                if (data.skipped > 0) msg += ', ' + data.skipped + ' skipped';
                if (data.errors > 0) msg += ', ' + data.errors + ' errors';
                WebPod.toast(msg, 'success');
            });

            // Export error
            WebPod.socket.on('export_error', function(data) {
                Sync.exporting = false;
                Sync.hideProgress();
                WebPod.toast('Export error: ' + data.message, 'error');
            });
        };

        bindEvents();
    }
};

document.addEventListener('DOMContentLoaded', Sync.init);
