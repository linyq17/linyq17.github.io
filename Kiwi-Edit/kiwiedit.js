// ======================== Gallery Tab Switching =====================
document.addEventListener('DOMContentLoaded', function() {
    initGalleryTabs();
    initVideoComparisons();
    initVideoCarousels();
});

function initGalleryTabs() {
    // Initialize all tab groups on the page
    var tabGroups = document.querySelectorAll('.gallery-tabs');
    tabGroups.forEach(function(tabGroup) {
        var groupId = tabGroup.getAttribute('data-gallery');
        var tabs = tabGroup.querySelectorAll('.gallery-tab');
        var contents = document.querySelectorAll('.gallery-content[data-gallery="' + groupId + '"]');

        tabs.forEach(function(tab) {
            tab.addEventListener('click', function() {
                var target = this.getAttribute('data-target');

                // Deactivate all tabs in this group
                tabs.forEach(function(t) { t.classList.remove('active'); });
                // Activate clicked tab
                this.classList.add('active');

                // Hide all contents in this group
                contents.forEach(function(c) { c.classList.remove('active'); });
                // Show target content
                var targetContent = document.querySelector('.gallery-content[data-gallery="' + groupId + '"][data-id="' + target + '"]');
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
    });
}

function initVideoComparisons() {
    if (!window.customElements) {
        return;
    }

    var convertPairs = function() {
        var pairs = document.querySelectorAll('.video-pair');

        pairs.forEach(function(pair) {
            var columns = pair.children;
            if (!columns || columns.length < 2) {
                return;
            }

            var firstBlock = columns[0];
            var secondBlock = columns[1];
            var firstMedia = firstBlock.querySelector('video, img');
            var secondMedia = secondBlock.querySelector('video, img');

            if (!firstMedia || !secondMedia) {
                return;
            }

            var firstLabelNode = firstBlock.querySelector('.pair-label');
            var secondLabelNode = secondBlock.querySelector('.pair-label');
            var firstLabel = firstLabelNode ? firstLabelNode.textContent.trim() : 'Input';
            var secondLabel = secondLabelNode ? secondLabelNode.textContent.trim() : 'Output';

            prepareMedia(firstMedia);
            prepareMedia(secondMedia);

            var slider = document.createElement('img-comparison-slider');
            slider.className = 'slider-container video-comparison';

            var before = document.createElement('figure');
            before.setAttribute('slot', 'first');
            before.className = 'before';
            before.appendChild(firstMedia);

            var after = document.createElement('figure');
            after.setAttribute('slot', 'second');
            after.className = 'after';
            after.appendChild(secondMedia);

            var wrapper = document.createElement('div');
            wrapper.className = 'video-comparison-wrap';

            var leftLegend = document.createElement('span');
            leftLegend.className = 'comparison-legend left';
            leftLegend.textContent = firstLabel;

            var rightLegend = document.createElement('span');
            rightLegend.className = 'comparison-legend right';
            rightLegend.textContent = secondLabel;

            slider.appendChild(before);
            slider.appendChild(after);
            wrapper.appendChild(slider);
            wrapper.appendChild(leftLegend);
            wrapper.appendChild(rightLegend);
            pair.replaceWith(wrapper);

            syncComparisonPair(firstMedia, secondMedia);
        });

        var grids = document.querySelectorAll('.video-grid');
        grids.forEach(function(grid) {
            updateEdgeSpacers(grid);
            var index = parseInt(grid.dataset.carouselIndex || '0', 10);
            if (Number.isNaN(index)) {
                index = 0;
            }
            scrollToVideoIndex(grid, index, false);
        });
    };

    if (window.customElements.get('img-comparison-slider')) {
        convertPairs();
        return;
    }

    window.customElements.whenDefined('img-comparison-slider').then(function() {
        convertPairs();
    });
}

function prepareMedia(media) {
    if (media.tagName !== 'VIDEO') {
        return;
    }

    media.setAttribute('playsinline', '');
    media.setAttribute('preload', 'auto');
    media.muted = true;
    media.autoplay = true;
    media.loop = true;
    media.playsInline = true;
}

function syncComparisonPair(firstMedia, secondMedia) {
    if (firstMedia.tagName !== 'VIDEO' || secondMedia.tagName !== 'VIDEO') {
        return;
    }

    var leader = firstMedia;
    var follower = secondMedia;
    var isBuffering = false;
    var isStarting = false;

    function bothReadyForSmoothPlay() {
        return leader.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&
            follower.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
    }

    function playVideoSafely(video) {
        var p = video.play();
        if (p && typeof p.catch === 'function') {
            return p.catch(function() {});
        }
        return Promise.resolve();
    }

    function pauseBoth() {
        if (!leader.paused) {
            leader.pause();
        }
        if (!follower.paused) {
            follower.pause();
        }
    }

    function markBuffering() {
        if (isBuffering) {
            return;
        }
        isBuffering = true;
        pauseBoth();
    }

    function startSynchronizedPlayback(forceSeek) {
        if (isStarting || !bothReadyForSmoothPlay()) {
            return;
        }
        isStarting = true;

        var targetTime = leader.currentTime;
        if (forceSeek) {
            hardAlign(targetTime);
        }
        follower.playbackRate = leader.playbackRate;

        Promise.all([playVideoSafely(leader), playVideoSafely(follower)]).finally(function() {
            isStarting = false;
            isBuffering = false;
        });
    }

    function hardAlign(targetTime) {
        var clamped = targetTime;
        if (clamped < 0) {
            clamped = 0;
        } else if (Number.isFinite(follower.duration)) {
            clamped = Math.min(clamped, Math.max(0, follower.duration - 0.001));
        }
        try {
            follower.currentTime = clamped;
        } catch (e) {
            // Ignore occasional seek errors before metadata is ready.
        }
    }

    function alignNow(forceSeek) {
        if (isStarting) {
            return;
        }

        if (isBuffering) {
            startSynchronizedPlayback(true);
            return;
        }

        if (!bothReadyForSmoothPlay()) {
            markBuffering();
            return;
        }

        if (leader.paused) {
            if (!follower.paused) {
                follower.pause();
            }
            follower.playbackRate = leader.playbackRate;
            return;
        }

        if (follower.paused) {
            startSynchronizedPlayback(true);
            return;
        }

        follower.playbackRate = leader.playbackRate;
        var targetTime = leader.currentTime;
        var drift = targetTime - follower.currentTime;
        var absDrift = Math.abs(drift);

        // Direct time lock (no keyframe-style correction).
        if (forceSeek || absDrift > 0.08) {
            hardAlign(targetTime);
        }
    }

    ['loadedmetadata', 'play', 'pause', 'seeking', 'seeked', 'ratechange', 'ended'].forEach(function(evt) {
        leader.addEventListener(evt, function() {
            alignNow(true);
        });
    });

    ['waiting', 'stalled', 'suspend'].forEach(function(evt) {
        leader.addEventListener(evt, markBuffering);
        follower.addEventListener(evt, markBuffering);
    });

    ['canplay', 'canplaythrough', 'playing'].forEach(function(evt) {
        leader.addEventListener(evt, function() {
            if (isBuffering) {
                startSynchronizedPlayback(true);
            }
        });
        follower.addEventListener(evt, function() {
            if (isBuffering) {
                startSynchronizedPlayback(true);
            }
        });
    });

    var timer = setInterval(function() {
        if (!leader.isConnected || !follower.isConnected) {
            clearInterval(timer);
            return;
        }
        alignNow(false);
    }, 120);

    if (bothReadyForSmoothPlay()) {
        startSynchronizedPlayback(true);
    } else {
        markBuffering();
    }
}

function initVideoCarousels() {
    var grids = document.querySelectorAll('.video-grid');

    grids.forEach(function(grid) {
        if (grid.dataset.carouselInit === 'true') {
            return;
        }

        grid.dataset.carouselInit = 'true';
        var itemCount = grid.querySelectorAll('.video-item').length;

        var row = document.createElement('div');
        row.className = 'video-row';
        grid.parentNode.insertBefore(row, grid);
        row.appendChild(grid);

        var prevBtn = document.createElement('button');
        prevBtn.className = 'video-nav prev';
        prevBtn.type = 'button';
        prevBtn.setAttribute('aria-label', 'Previous videos');
        prevBtn.innerHTML = '&#10094;';

        var nextBtn = document.createElement('button');
        nextBtn.className = 'video-nav next';
        nextBtn.type = 'button';
        nextBtn.setAttribute('aria-label', 'Next videos');
        nextBtn.innerHTML = '&#10095;';

        prevBtn.addEventListener('click', function() {
            scrollVideoGrid(grid, -1);
        });

        nextBtn.addEventListener('click', function() {
            scrollVideoGrid(grid, 1);
        });

        if (itemCount > 1) {
            row.appendChild(prevBtn);
            row.appendChild(nextBtn);
        }

        grid.dataset.carouselIndex = '0';
        attachCarouselSync(grid);
        updateEdgeSpacers(grid);
        scrollToVideoIndex(grid, 0, false);
        setTimeout(function() {
            updateEdgeSpacers(grid);
            scrollToVideoIndex(grid, 0, false);
        }, 80);
    });
}

function scrollVideoGrid(grid, direction) {
    var items = grid.querySelectorAll('.video-item');
    var total = items.length;
    if (!total) {
        return;
    }

    syncCarouselIndex(grid);
    var index = parseInt(grid.dataset.carouselIndex || '0', 10);
    if (Number.isNaN(index)) {
        index = 0;
    }

    index = (index + direction + total) % total;
    grid.dataset.carouselIndex = String(index);
    scrollToVideoIndex(grid, index, true);
}

function scrollToVideoIndex(grid, index, smooth) {
    var items = grid.querySelectorAll('.video-item');
    if (!items.length || index < 0 || index >= items.length) {
        return;
    }

    var item = items[index];
    var targetLeft = item.offsetLeft - (grid.clientWidth - item.clientWidth) / 2;
    var maxScroll = Math.max(0, grid.scrollWidth - grid.clientWidth);
    var clampedLeft = Math.min(maxScroll, Math.max(0, targetLeft));
    grid.scrollTo({
        left: clampedLeft,
        behavior: smooth ? 'smooth' : 'auto'
    });
}

function attachCarouselSync(grid) {
    var timer = null;

    grid.addEventListener('scroll', function() {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(function() {
            syncCarouselIndex(grid);
        }, 120);
    });

    window.addEventListener('resize', function() {
        updateEdgeSpacers(grid);
        var index = parseInt(grid.dataset.carouselIndex || '0', 10);
        if (Number.isNaN(index)) {
            index = 0;
        }
        scrollToVideoIndex(grid, index, false);
    });
}

function syncCarouselIndex(grid) {
    var items = grid.querySelectorAll('.video-item');
    if (!items.length) {
        return;
    }

    var viewportCenter = grid.scrollLeft + grid.clientWidth / 2;
    var nearestIndex = 0;
    var nearestDistance = Infinity;

    items.forEach(function(item, idx) {
        var center = item.offsetLeft + item.clientWidth / 2;
        var distance = Math.abs(center - viewportCenter);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = idx;
        }
    });

    grid.dataset.carouselIndex = String(nearestIndex);
}

function updateEdgeSpacers(grid) {
    var items = grid.querySelectorAll('.video-item');
    if (!items.length) {
        return;
    }

    var startSpacer = getOrCreateEdgeSpacer(grid, 'start');
    var endSpacer = getOrCreateEdgeSpacer(grid, 'end');

    var styles = window.getComputedStyle(grid);
    var gap = parseFloat(styles.gap || styles.columnGap || '0');
    if (Number.isNaN(gap)) {
        gap = 0;
    }

    var firstWidth = items[0].getBoundingClientRect().width;
    var lastWidth = items[items.length - 1].getBoundingClientRect().width;
    var startWidth = Math.max(0, (grid.clientWidth - firstWidth) / 2 - gap);
    var endWidth = Math.max(0, (grid.clientWidth - lastWidth) / 2 - gap);

    startSpacer.style.flex = '0 0 ' + startWidth + 'px';
    endSpacer.style.flex = '0 0 ' + endWidth + 'px';
}

function getOrCreateEdgeSpacer(grid, side) {
    var spacer = grid.querySelector('.video-edge-spacer.' + side);
    if (spacer) {
        return spacer;
    }

    spacer = document.createElement('div');
    spacer.className = 'video-edge-spacer ' + side;
    spacer.setAttribute('aria-hidden', 'true');
    if (side === 'start') {
        grid.insertBefore(spacer, grid.firstChild);
    } else {
        grid.appendChild(spacer);
    }
    return spacer;
}
