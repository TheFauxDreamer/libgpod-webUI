/**
 * WebPod - Audio Player Module
 * In-browser playback with queue, seekbar, and controls
 */
var Player = {
    audio: null,
    queue: [],
    queueIndex: -1,
    isPlaying: false,
    currentTrackId: null,
    _skipTimeout: null,

    init: function() {
        Player.audio = document.getElementById('player-audio');

        // Audio event listeners
        Player.audio.addEventListener('timeupdate', Player.updateProgress);
        Player.audio.addEventListener('loadedmetadata', Player.onMetadataLoaded);
        Player.audio.addEventListener('ended', Player.onEnded);
        Player.audio.addEventListener('play', function() {
            Player.isPlaying = true;
            document.getElementById('player-play').innerHTML = '&#9208;';
        });
        Player.audio.addEventListener('pause', function() {
            Player.isPlaying = false;
            document.getElementById('player-play').innerHTML = '&#9654;';
        });
        Player.audio.addEventListener('error', function() {
            // Ignore errors with no MediaError (stale events from aborted loads)
            if (!Player.audio.error) return;

            var errorTrackId = Player.currentTrackId;
            WebPod.toast('Playback error', 'error');

            if (Player.queueIndex < Player.queue.length - 1) {
                Player._skipTimeout = setTimeout(function() {
                    // Only skip if still on the track that errored
                    if (Player.currentTrackId === errorTrackId) {
                        Player.next();
                    }
                }, 500);
            }
        });

        // Control buttons
        document.getElementById('player-play').addEventListener('click', Player.togglePlay);
        document.getElementById('player-prev').addEventListener('click', Player.prev);
        document.getElementById('player-next').addEventListener('click', Player.next);

        // Seekbar click
        document.getElementById('player-seekbar').addEventListener('click', Player.seek);

        // Volume
        document.getElementById('player-volume').addEventListener('input', function() {
            Player.audio.volume = this.value / 100;
        });

        // Keyboard: space to play/pause (only when no input is focused)
        document.addEventListener('keydown', function(e) {
            if (e.code === 'Space' && Player.currentTrackId !== null) {
                var tag = document.activeElement.tagName.toLowerCase();
                if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
                    e.preventDefault();
                    Player.togglePlay();
                }
            }
        });
    },

    /**
     * Start playing a track with a queue context
     * @param {object} track - Track object with id, title, artist, artwork_hash, duration_ms
     * @param {array} queue - Array of track objects for next/prev navigation
     * @param {number} queueIndex - Index of the track in the queue
     */
    playTrack: function(track, queue, queueIndex) {
        Player.queue = queue || [track];
        Player.queueIndex = (queueIndex !== undefined) ? queueIndex : 0;
        Player.loadAndPlay(track);
    },

    /**
     * Load a track into the audio element and start playback
     */
    loadAndPlay: function(track) {
        // Cancel any pending error-skip timeout
        if (Player._skipTimeout) {
            clearTimeout(Player._skipTimeout);
            Player._skipTimeout = null;
        }

        Player.currentTrackId = track.id;

        // Pause before changing src to avoid abort-related error events
        Player.audio.pause();
        Player.audio.src = '/api/library/stream/' + track.id;

        // Catch play() Promise to prevent AbortError from cascading
        var playPromise = Player.audio.play();
        if (playPromise) {
            playPromise.catch(function(e) {
                // AbortError is expected when src changes during load -- ignore it
                if (e.name !== 'AbortError') {
                    console.error('Play failed:', e);
                }
            });
        }

        // Update player bar UI
        var bar = document.getElementById('player-bar');
        bar.classList.remove('hidden');

        // Add padding to main layout so content isn't hidden behind player
        document.getElementById('main-layout').classList.add('player-active');

        // Track info
        document.getElementById('player-title').textContent = track.title || 'Unknown';
        document.getElementById('player-artist').textContent = track.artist || 'Unknown Artist';

        // Artwork
        var artImg = document.getElementById('player-artwork');
        if (track.artwork_hash) {
            artImg.src = '/api/artwork/' + track.artwork_hash;
            artImg.style.display = 'block';
        } else {
            artImg.src = PLACEHOLDER_IMG;
            artImg.style.display = 'block';
        }

        // Reset progress
        document.getElementById('player-seekbar-fill').style.width = '0%';
        document.getElementById('player-current-time').textContent = '0:00';
        document.getElementById('player-total-time').textContent =
            WebPod.formatDuration(track.duration_ms);

        // Highlight the playing track in the DOM
        Player.highlightPlaying();
    },

    togglePlay: function() {
        if (!Player.audio.src) return;
        if (Player.isPlaying) {
            Player.audio.pause();
        } else {
            Player.audio.play();
        }
    },

    next: function() {
        if (Player.queue.length === 0) return;
        if (Player.queueIndex < Player.queue.length - 1) {
            Player.queueIndex++;
            Player.loadAndPlay(Player.queue[Player.queueIndex]);
        }
    },

    prev: function() {
        if (Player.queue.length === 0) return;
        // If more than 3 seconds in, restart current track
        if (Player.audio.currentTime > 3) {
            Player.audio.currentTime = 0;
            return;
        }
        if (Player.queueIndex > 0) {
            Player.queueIndex--;
            Player.loadAndPlay(Player.queue[Player.queueIndex]);
        } else {
            Player.audio.currentTime = 0;
        }
    },

    onEnded: function() {
        if (Player.queueIndex < Player.queue.length - 1) {
            Player.next();
        } else {
            // End of queue - reset play button
            Player.isPlaying = false;
            document.getElementById('player-play').innerHTML = '&#9654;';
        }
    },

    onMetadataLoaded: function() {
        if (Player.audio.duration && isFinite(Player.audio.duration)) {
            document.getElementById('player-total-time').textContent =
                Player.formatTime(Player.audio.duration);
        }
    },

    updateProgress: function() {
        if (!Player.audio.duration || !isFinite(Player.audio.duration)) return;
        var pct = (Player.audio.currentTime / Player.audio.duration) * 100;
        document.getElementById('player-seekbar-fill').style.width = pct + '%';
        document.getElementById('player-current-time').textContent =
            Player.formatTime(Player.audio.currentTime);
    },

    seek: function(e) {
        if (!Player.audio.duration || !isFinite(Player.audio.duration)) return;
        var bar = document.getElementById('player-seekbar');
        var rect = bar.getBoundingClientRect();
        var pct = (e.clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        Player.audio.currentTime = pct * Player.audio.duration;
    },

    /**
     * Format seconds to "m:ss"
     */
    formatTime: function(seconds) {
        if (!seconds || !isFinite(seconds)) return '0:00';
        var mins = Math.floor(seconds / 60);
        var secs = Math.floor(seconds % 60);
        return mins + ':' + (secs < 10 ? '0' : '') + secs;
    },

    /**
     * Highlight the currently playing track in the DOM
     */
    highlightPlaying: function() {
        // Remove all existing highlights
        var playing = document.querySelectorAll('.playing');
        for (var i = 0; i < playing.length; i++) {
            playing[i].classList.remove('playing');
        }

        if (Player.currentTrackId === null) return;

        // Highlight matching rows in tracks view, album expansion, podcast episodes
        var rows = document.querySelectorAll(
            '[data-track-id="' + Player.currentTrackId + '"], ' +
            '[data-trackId="' + Player.currentTrackId + '"]'
        );
        for (var j = 0; j < rows.length; j++) {
            rows[j].classList.add('playing');
        }
    }
};

document.addEventListener('DOMContentLoaded', Player.init);
