/**
 * WebPod - Core Application
 * Global namespace, utilities, initialization
 */
var WebPod = {
    socket: null,
    currentView: 'albums',
    libraryPath: null,
    searchTimeout: null,
    skipSearchHandler: false,  // Flag to skip search when setting input programmatically
    theme: 'dark',
    selectedFormats: ['all'],  // Default to all formats
    lastSearchQuery: '',  // Track last search to avoid duplicate calls
    currentSearchQuery: null,  // Track current in-flight search query to avoid race conditions

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
     * Apply the current theme to the document
     */
    applyTheme: function() {
        var theme = WebPod.theme;
        if (theme === 'auto') {
            var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    },

    /**
     * Initialize system theme change listener for auto mode
     */
    initThemeListener: function() {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
            if (WebPod.theme === 'auto') {
                WebPod.applyTheme();
            }
        });
    },

    /**
     * Extract dominant color from an image for colorful album backgrounds
     */
    extractDominantColor: function(img, callback) {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        var size = 50;  // Sample at small size for performance
        canvas.width = size;
        canvas.height = size;

        try {
            ctx.drawImage(img, 0, 0, size, size);
            var data = ctx.getImageData(0, 0, size, size).data;

            // Simple average color
            var r = 0, g = 0, b = 0, count = 0;
            for (var i = 0; i < data.length; i += 4) {
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
                count++;
            }
            r = Math.floor(r / count);
            g = Math.floor(g / count);
            b = Math.floor(b / count);

            callback({ r: r, g: g, b: b });
        } catch (e) {
            callback(null);  // CORS or other error
        }
    },

    /**
     * Switch between content views
     * @param {string} view - The view to switch to
     * @param {boolean} skipLoad - If true, skip auto-loading data (for filtered loads)
     */
    switchView: function(view, skipLoad) {
        WebPod.currentView = view;
        var views = ['albums', 'tracks', 'podcasts', 'search', 'ipod-tracks'];
        var buttons = {
            'albums': document.getElementById('view-albums'),
            'tracks': document.getElementById('view-tracks'),
            'podcasts': document.getElementById('view-podcasts'),
            'search': document.getElementById('view-search'),
            'ipod-tracks': document.getElementById('view-ipod-tracks')
        };

        // Collapse any album expansion when switching views
        if (view !== 'albums' && Library.expandedAlbum) {
            Library.collapseAlbum();
        }

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

        if (!skipLoad) {
            if (view === 'albums') {
                Library.loadAlbums();
            } else if (view === 'tracks') {
                Library.loadTracks();
            } else if (view === 'podcasts') {
                Podcasts.loadSeries();
            } else if (view === 'search') {
                // If there's a current search query, perform search
                var query = document.getElementById('search-input').value.trim();
                if (query) {
                    WebPod.performSearch(query);
                } else {
                    WebPod.showSearchEmptyState();
                }
            } else if (view === 'ipod-tracks') {
                IPod.loadTracks();
            }
        }
    },

    /**
     * Initialize search with debounce
     */
    initSearch: function() {
        var searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', function() {
            // Skip if flag is set (programmatic value change from loadAlbumTracks)
            if (WebPod.skipSearchHandler) {
                WebPod.skipSearchHandler = false;
                return;
            }
            clearTimeout(WebPod.searchTimeout);
            WebPod.searchTimeout = setTimeout(function() {
                var query = searchInput.value.trim();

                // If user types anything, switch to search view and search
                if (query) {
                    WebPod.switchView('search');
                    // Reset format filter to "all" for new search
                    WebPod.resetFormatFilter();
                    WebPod.performSearch(query);
                } else {
                    // Empty search - show empty state in search view
                    if (WebPod.currentView === 'search') {
                        WebPod.showSearchEmptyState();
                    }
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
     * Initialize format filter dropdown (inside search view)
     */
    initFormatFilter: function() {
        var filterBtn = document.getElementById('format-filter-btn');
        var dropdown = document.getElementById('format-filter-dropdown');
        var label = document.getElementById('format-filter-label');

        // Fetch available formats from the API and populate dropdown
        WebPod.api('/api/library/formats').then(function(data) {
            var formats = data.formats || [];
            var optionsContainer = dropdown.querySelector('.format-filter-options');

            // Clear existing checkboxes (except the template ones in HTML)
            optionsContainer.innerHTML = '';

            // Add "All Formats" checkbox
            var allLabel = document.createElement('label');
            allLabel.className = 'format-checkbox';
            var allCheckbox = document.createElement('input');
            allCheckbox.type = 'checkbox';
            allCheckbox.value = 'all';
            allCheckbox.checked = true;
            allCheckbox.setAttribute('data-format-all', '');
            var allSpan = document.createElement('span');
            allSpan.textContent = 'All Formats';
            allLabel.appendChild(allCheckbox);
            allLabel.appendChild(allSpan);
            optionsContainer.appendChild(allLabel);

            // Add divider
            var divider = document.createElement('div');
            divider.className = 'dropdown-divider';
            optionsContainer.appendChild(divider);

            // Add checkboxes for each available format
            formats.forEach(function(format) {
                var formatLabel = document.createElement('label');
                formatLabel.className = 'format-checkbox';
                var formatCheckbox = document.createElement('input');
                formatCheckbox.type = 'checkbox';
                formatCheckbox.value = format;
                formatCheckbox.checked = true;
                var formatSpan = document.createElement('span');
                formatSpan.textContent = format.toUpperCase();
                formatLabel.appendChild(formatCheckbox);
                formatLabel.appendChild(formatSpan);
                optionsContainer.appendChild(formatLabel);
            });

            // Now set up event handlers
            var checkboxes = optionsContainer.querySelectorAll('input[type="checkbox"]');
            var allCheckbox = optionsContainer.querySelector('[data-format-all]');

            // Toggle dropdown
            filterBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                dropdown.classList.toggle('hidden');
            });

            // Close on outside click
            document.addEventListener('click', function() {
                dropdown.classList.add('hidden');
            });

            dropdown.addEventListener('click', function(e) {
                e.stopPropagation();
            });

            // Handle checkbox changes
            checkboxes.forEach(function(checkbox) {
                checkbox.addEventListener('change', function() {
                    if (checkbox === allCheckbox) {
                        if (checkbox.checked) {
                            checkboxes.forEach(function(cb) { cb.checked = true; });
                            WebPod.selectedFormats = ['all'];
                        }
                    } else {
                        // SOFT-LOCK FIX: Prevent unchecking the last format
                        var checkedIndividuals = Array.from(checkboxes).filter(function(cb) {
                            return cb !== allCheckbox && cb.checked;
                        });

                        // If user is trying to uncheck the last format, prevent it
                        if (checkedIndividuals.length === 0) {
                            checkbox.checked = true;
                            return;
                        }

                        // Uncheck "All" when any individual is unchecked
                        if (!checkbox.checked) {
                            allCheckbox.checked = false;
                        }

                        // Check "All" if all individuals are checked
                        var allIndividualsChecked = Array.from(checkboxes).every(function(cb) {
                            return cb === allCheckbox || cb.checked;
                        });
                        if (allIndividualsChecked) {
                            allCheckbox.checked = true;
                        }
                    }

                    // Update selected formats
                    if (allCheckbox.checked) {
                        WebPod.selectedFormats = ['all'];
                        label.textContent = 'All Formats';
                    } else {
                        WebPod.selectedFormats = [];
                        checkboxes.forEach(function(cb) {
                            if (cb !== allCheckbox && cb.checked) {
                                WebPod.selectedFormats.push(cb.value);
                            }
                        });

                        if (WebPod.selectedFormats.length === 1) {
                            label.textContent = WebPod.selectedFormats[0].toUpperCase();
                        } else {
                            label.textContent = WebPod.selectedFormats.length + ' formats';
                        }
                    }

                    // Trigger search refresh with new filters
                    if (WebPod.lastSearchQuery) {
                        WebPod.performSearch(WebPod.lastSearchQuery);
                    }
                });
            });
        }).catch(function(err) {
            console.error('Failed to load available formats:', err);
        });
    },

    /**
     * Reset format filter to "All Formats" for new searches
     */
    resetFormatFilter: function() {
        var allCheckbox = document.querySelector('[data-format-all]');
        var checkboxes = document.querySelectorAll('#format-filter-dropdown input[type="checkbox"]');
        if (allCheckbox) {
            checkboxes.forEach(function(cb) { cb.checked = true; });
            allCheckbox.checked = true;
            WebPod.selectedFormats = ['all'];
            document.getElementById('format-filter-label').textContent = 'All Formats';
        }
    },

    /**
     * Perform unified search across albums, tracks, and podcasts
     */
    performSearch: function(query, showAll) {
        WebPod.lastSearchQuery = query;

        // Create unique query identifier to handle race conditions
        var queryId = query + '|' + WebPod.selectedFormats.join(',') + '|' + (showAll ? 'all' : 'limited');
        WebPod.currentSearchQuery = queryId;

        var url = '/api/search?q=' + encodeURIComponent(query);

        // Add format filters ONLY if not "all" (default shows everything)
        if (WebPod.selectedFormats[0] !== 'all') {
            WebPod.selectedFormats.forEach(function(fmt) {
                url += '&formats=' + encodeURIComponent(fmt);
            });
        }

        // Add show_all parameter if requested
        if (showAll) {
            url += '&show_all=true';
        }

        WebPod.api(url).then(function(data) {
            // Only render if this is still the current query (avoid race conditions)
            if (WebPod.currentSearchQuery === queryId) {
                WebPod.renderSearchResults(data);
            }
        }).catch(function(err) {
            console.error('Search error:', err);
            // Only show error toast if this is still the current query
            if (WebPod.currentSearchQuery === queryId) {
                WebPod.toast('Search failed', 'error');
            }
        });
    },

    /**
     * Render search results in the search view
     */
    renderSearchResults: function(data) {
        var emptyState = document.getElementById('search-empty-state');
        var results = document.getElementById('search-results');

        emptyState.classList.add('hidden');
        results.classList.remove('hidden');

        // Render Albums
        var albumsSection = document.getElementById('search-albums-section');
        var albumsCount = document.getElementById('search-albums-count');
        var albumsGrid = document.getElementById('search-albums-grid');
        var showMoreAlbums = document.getElementById('show-more-albums');
        var albumsRemaining = document.getElementById('albums-remaining');

        albumsCount.textContent = data.albums_total || data.albums.length;
        if (data.albums.length > 0) {
            albumsSection.style.display = 'block';
            albumsGrid.innerHTML = '';
            data.albums.forEach(function(album) {
                var card = Library.createAlbumCard(album, true);  // forSearch = true
                albumsGrid.appendChild(card);
            });

            // Show "Show more" button if there are more results
            if (data.albums_total && data.albums.length < data.albums_total) {
                showMoreAlbums.classList.remove('hidden');
                albumsRemaining.textContent = data.albums_total;
            } else {
                showMoreAlbums.classList.add('hidden');
            }
        } else {
            albumsSection.style.display = 'none';
        }

        // Render Tracks
        var tracksSection = document.getElementById('search-tracks-section');
        var tracksCount = document.getElementById('search-tracks-count');
        var tracksTbody = document.getElementById('search-tracks-tbody');
        var showMoreTracks = document.getElementById('show-more-tracks');
        var tracksRemaining = document.getElementById('tracks-remaining');

        tracksCount.textContent = data.tracks_total || data.tracks.length;
        if (data.tracks.length > 0) {
            tracksSection.style.display = 'block';
            tracksTbody.innerHTML = '';
            data.tracks.forEach(function(track) {
                var row = Library.createTrackRow(track, true);  // forSearch = true
                tracksTbody.appendChild(row);
            });

            // Show "Show more" button if there are more results
            if (data.tracks_total && data.tracks.length < data.tracks_total) {
                showMoreTracks.classList.remove('hidden');
                tracksRemaining.textContent = data.tracks_total;
            } else {
                showMoreTracks.classList.add('hidden');
            }
        } else {
            tracksSection.style.display = 'none';
        }

        // Render Podcasts
        var podcastsSection = document.getElementById('search-podcasts-section');
        var podcastsCount = document.getElementById('search-podcasts-count');
        var podcastsGrid = document.getElementById('search-podcasts-grid');
        var showMorePodcasts = document.getElementById('show-more-podcasts');
        var podcastsRemaining = document.getElementById('podcasts-remaining');

        podcastsCount.textContent = data.podcasts_total || data.podcasts.length;
        if (data.podcasts.length > 0) {
            podcastsSection.style.display = 'block';
            podcastsGrid.innerHTML = '';
            data.podcasts.forEach(function(series) {
                var card = Podcasts.createSeriesCard(series);
                podcastsGrid.appendChild(card);
            });

            // Show "Show more" button if there are more results
            if (data.podcasts_total && data.podcasts.length < data.podcasts_total) {
                showMorePodcasts.classList.remove('hidden');
                podcastsRemaining.textContent = data.podcasts_total;
            } else {
                showMorePodcasts.classList.add('hidden');
            }
        } else {
            podcastsSection.style.display = 'none';
        }

        // If no results at all, show empty state
        if (data.albums.length === 0 && data.tracks.length === 0 && data.podcasts.length === 0) {
            WebPod.showSearchEmptyState();
        }
    },

    /**
     * Show empty state in search view
     */
    showSearchEmptyState: function() {
        var emptyState = document.getElementById('search-empty-state');
        var results = document.getElementById('search-results');
        emptyState.classList.remove('hidden');
        results.classList.add('hidden');
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
            WebPod.exportPath = data.export_path || '';
            WebPod.showFormatTags = data.show_format_tags !== false;  // Default to true
            WebPod.colorfulAlbums = data.colorful_albums !== false;  // Default to true
            WebPod.allowFilesWithoutMetadata = data.allow_files_without_metadata === true;  // Default to false (unchecked)
            WebPod.theme = data.theme || 'auto';
            WebPod.applyTheme();
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
        var exportInput = document.getElementById('export-path-input');
        var musicScanBtn = document.getElementById('music-scan-btn');
        var podcastScanBtn = document.getElementById('podcast-scan-btn');
        var exportBtn = document.getElementById('export-btn');
        var formatTagsCheckbox = document.getElementById('show-format-tags');
        var colorfulAlbumsCheckbox = document.getElementById('colorful-albums');
        var allowNoMetadataCheckbox = document.getElementById('allow-files-without-metadata');
        var themeSelect = document.getElementById('theme-select');

        // Open settings dialog
        settingsBtn.addEventListener('click', function() {
            musicInput.value = WebPod.musicPath || '';
            podcastInput.value = WebPod.podcastPath || '';
            exportInput.value = WebPod.exportPath || '';
            formatTagsCheckbox.checked = WebPod.showFormatTags || false;
            colorfulAlbumsCheckbox.checked = WebPod.colorfulAlbums !== false;  // Default to true
            allowNoMetadataCheckbox.checked = WebPod.allowFilesWithoutMetadata === true;  // Default to false (unchecked)
            themeSelect.value = WebPod.theme || 'auto';
            musicScanBtn.disabled = !WebPod.musicPath;
            podcastScanBtn.disabled = !WebPod.podcastPath;
            // Export button enabled only if iPod is connected
            exportBtn.disabled = !IPod.connected;
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

        // Export button
        exportBtn.addEventListener('click', function() {
            if (!IPod.connected) {
                WebPod.toast('No iPod connected', 'error');
                return;
            }

            // Save export path first
            var path = exportInput.value.trim();
            if (path) {
                WebPod.api('/api/settings', {
                    method: 'POST',
                    body: { export_path: path }
                }).then(function() {
                    WebPod.exportPath = path;
                });
            }

            exportBtn.disabled = true;
            exportBtn.textContent = 'Exporting...';

            WebPod.api('/api/ipod/export', { method: 'POST' }).then(function(data) {
                WebPod.toast('Export started to ' + data.destination, 'info');
            }).catch(function() {
                exportBtn.disabled = false;
                exportBtn.textContent = 'Export All Music from iPod';
            });
        });

        // Save settings and auto-scan
        saveBtn.addEventListener('click', function() {
            var musicPath = musicInput.value.trim();
            var podcastPath = podcastInput.value.trim();
            var exportPath = exportInput.value.trim();
            var showFormatTags = formatTagsCheckbox.checked;
            var colorfulAlbums = colorfulAlbumsCheckbox.checked;
            var allowNoMetadata = allowNoMetadataCheckbox.checked;
            var theme = themeSelect.value;

            WebPod.api('/api/settings', {
                method: 'POST',
                body: {
                    music_path: musicPath,
                    podcast_path: podcastPath,
                    export_path: exportPath,
                    show_format_tags: showFormatTags,
                    colorful_albums: colorfulAlbums,
                    allow_files_without_metadata: allowNoMetadata,
                    theme: theme
                }
            }).then(function() {
                WebPod.musicPath = musicPath;
                WebPod.podcastPath = podcastPath;
                WebPod.exportPath = exportPath;
                WebPod.showFormatTags = showFormatTags;
                WebPod.colorfulAlbums = colorfulAlbums;
                WebPod.allowFilesWithoutMetadata = allowNoMetadata;
                WebPod.theme = theme;
                WebPod.applyTheme();
                WebPod.loadSettings();
                dialog.classList.add('hidden');
                WebPod.toast('Settings saved', 'success');
                // Reload current view to apply format tag changes
                if (WebPod.currentView === 'albums') {
                    Library.loadAlbums();
                } else if (WebPod.currentView === 'tracks') {
                    Library.loadTracks();
                }

                // Auto-scan music library if path is set
                if (musicPath) {
                    musicScanBtn.disabled = true;
                    musicScanBtn.textContent = 'Scanning...';
                    WebPod.api('/api/library/scan', { method: 'POST' }).catch(function() {
                        musicScanBtn.disabled = false;
                        musicScanBtn.textContent = 'Scan Music';
                    });
                }

                // Auto-scan podcast library if path is set
                if (podcastPath) {
                    podcastScanBtn.disabled = true;
                    podcastScanBtn.textContent = 'Scanning...';
                    WebPod.api('/api/library/scan-podcasts', { method: 'POST' }).catch(function() {
                        podcastScanBtn.disabled = false;
                        podcastScanBtn.textContent = 'Scan Podcasts';
                    });
                }
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

        // Export progress events
        WebPod.socket.on('export_progress', function(data) {
            var status = document.getElementById('export-status');
            if (status) {
                status.textContent = data.exported + '/' + data.total + ' - ' + data.track;
            }
        });

        WebPod.socket.on('export_complete', function(data) {
            var exportBtn = document.getElementById('export-btn');
            exportBtn.disabled = !IPod.connected;
            exportBtn.textContent = 'Export All Music from iPod';
            document.getElementById('export-status').textContent = '';
            var msg = 'Export complete: ' + data.exported + ' exported';
            if (data.skipped > 0) msg += ', ' + data.skipped + ' skipped';
            if (data.errors > 0) msg += ', ' + data.errors + ' errors';
            WebPod.toast(msg, 'success');
        });

        WebPod.socket.on('export_error', function(data) {
            var exportBtn = document.getElementById('export-btn');
            exportBtn.disabled = !IPod.connected;
            exportBtn.textContent = 'Export All Music from iPod';
            document.getElementById('export-status').textContent = '';
            WebPod.toast('Export error: ' + data.message, 'error');
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
        WebPod.initFormatFilter();
        WebPod.initThemeListener();

        // Add search tab click handler
        document.getElementById('view-search').addEventListener('click', function() {
            WebPod.switchView('search');
        });

        // Add "Show more" button handlers
        document.getElementById('show-more-albums').addEventListener('click', function() {
            if (WebPod.lastSearchQuery) {
                WebPod.performSearch(WebPod.lastSearchQuery, true);
            }
        });

        document.getElementById('show-more-tracks').addEventListener('click', function() {
            if (WebPod.lastSearchQuery) {
                WebPod.performSearch(WebPod.lastSearchQuery, true);
            }
        });

        document.getElementById('show-more-podcasts').addEventListener('click', function() {
            if (WebPod.lastSearchQuery) {
                WebPod.performSearch(WebPod.lastSearchQuery, true);
            }
        });

        // Default view
        WebPod.switchView('albums');
    }
};

document.addEventListener('DOMContentLoaded', WebPod.init);
