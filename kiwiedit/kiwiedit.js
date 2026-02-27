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
    var anchorInterval = 1.0;
    var lastAnchorBucket = -1;
    var visualOffset = 0;

    estimateVisualOffsetFromSequence(leader, follower).then(function(offset) {
        if (typeof offset === 'number' && Number.isFinite(offset)) {
            visualOffset = offset;
            alignNow(true);
        }
    });

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
        if (leader.paused) {
            if (!follower.paused) {
                follower.pause();
            }
            follower.playbackRate = leader.playbackRate;
            return;
        }

        if (follower.paused) {
            var p = follower.play();
            if (p && typeof p.catch === 'function') {
                p.catch(function() {});
            }
        }

        follower.playbackRate = leader.playbackRate;
        var targetTime = leader.currentTime + visualOffset;
        var drift = targetTime - follower.currentTime;
        var absDrift = Math.abs(drift);
        var currentBucket = Math.floor((leader.currentTime || 0) / anchorInterval);

        // Only do hard seek when drift is clearly visible.
        if (forceSeek || absDrift > 0.12) {
            hardAlign(targetTime);
            lastAnchorBucket = currentBucket;
            return;
        }

        // Keyframe-like reset: once per anchor interval, realign if drift accumulates.
        if (currentBucket !== lastAnchorBucket) {
            lastAnchorBucket = currentBucket;
            if (absDrift > 0.03) {
                hardAlign(targetTime);
            }
        }
    }

    ['loadedmetadata', 'play', 'pause', 'seeking', 'seeked', 'ratechange', 'ended'].forEach(function(evt) {
        leader.addEventListener(evt, function() {
            alignNow(true);
        });
    });

    var timer = setInterval(function() {
        if (!leader.isConnected || !follower.isConnected) {
            clearInterval(timer);
            return;
        }
        alignNow(false);
    }, 120);

    alignNow(true);
}

function estimateVisualOffsetFromSequence(firstVideo, secondVideo) {
    var firstSrc = firstVideo.currentSrc || firstVideo.src;
    var secondSrc = secondVideo.currentSrc || secondVideo.src;
    if (!firstSrc || !secondSrc) {
        return Promise.resolve(null);
    }

    if (!isSameOriginVideo(firstSrc) || !isSameOriginVideo(secondSrc)) {
        return Promise.resolve(null);
    }

    var firstProbe = createProbeVideo(firstSrc);
    var secondProbe = createProbeVideo(secondSrc);

    return Promise.all([waitMetadata(firstProbe), waitMetadata(secondProbe)])
        .then(function() {
            var duration = Math.min(firstProbe.duration || 0, secondProbe.duration || 0);
            if (!duration || duration < 0.8) {
                return null;
            }

            var samples = 6;
            return Promise.all([
                sampleVideoSequence(firstProbe, duration, samples),
                sampleVideoSequence(secondProbe, duration, samples)
            ]).then(function(result) {
                var firstSig = result[0];
                var secondSig = result[1];
                if (!firstSig.length || !secondSig.length) {
                    return null;
                }

                var maxShift = 2;
                var bestShift = 0;
                var bestScore = Number.POSITIVE_INFINITY;
                for (var shift = -maxShift; shift <= maxShift; shift++) {
                    var score = compareShiftedSignatures(firstSig, secondSig, shift);
                    if (score < bestScore) {
                        bestScore = score;
                        bestShift = shift;
                    }
                }

                var step = duration / (samples + 1);
                return bestShift * step;
            });
        })
        .catch(function() {
            return null;
        })
        .finally(function() {
            firstProbe.remove();
            secondProbe.remove();
        });
}

function createProbeVideo(src) {
    var video = document.createElement('video');
    video.src = src;
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    video.style.position = 'absolute';
    video.style.left = '-99999px';
    video.style.top = '-99999px';
    video.style.width = '1px';
    video.style.height = '1px';
    document.body.appendChild(video);
    return video;
}

function waitMetadata(video) {
    if (video.readyState >= 1) {
        return Promise.resolve();
    }
    return new Promise(function(resolve, reject) {
        var onLoad = function() {
            cleanup();
            resolve();
        };
        var onError = function() {
            cleanup();
            reject(new Error('metadata load failed'));
        };
        var cleanup = function() {
            video.removeEventListener('loadedmetadata', onLoad);
            video.removeEventListener('error', onError);
        };
        video.addEventListener('loadedmetadata', onLoad, { once: true });
        video.addEventListener('error', onError, { once: true });
        video.load();
    });
}

function sampleVideoSequence(video, duration, samples) {
    var canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 18;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
        return Promise.resolve([]);
    }

    var times = [];
    for (var i = 1; i <= samples; i++) {
        times.push((duration * i) / (samples + 1));
    }

    var signatures = [];
    var chain = Promise.resolve();
    times.forEach(function(time) {
        chain = chain.then(function() {
            return seekVideo(video, time).then(function() {
                try {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                    signatures.push(makeFrameSignature(data));
                } catch (e) {
                    signatures.push(null);
                }
            });
        });
    });

    return chain.then(function() {
        return signatures.filter(function(sig) { return !!sig; });
    });
}

function seekVideo(video, time) {
    return new Promise(function(resolve) {
        var onSeek = function() {
            cleanup();
            resolve();
        };
        var onErr = function() {
            cleanup();
            resolve();
        };
        var cleanup = function() {
            video.removeEventListener('seeked', onSeek);
            video.removeEventListener('error', onErr);
        };
        video.addEventListener('seeked', onSeek, { once: true });
        video.addEventListener('error', onErr, { once: true });
        try {
            video.currentTime = Math.max(0, time);
        } catch (e) {
            cleanup();
            resolve();
        }
    });
}

function makeFrameSignature(pixels) {
    var bins = new Array(8).fill(0);
    var total = 0;
    for (var i = 0; i < pixels.length; i += 4) {
        var gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
        var bin = Math.min(7, Math.floor(gray / 32));
        bins[bin] += 1;
        total += 1;
    }
    if (!total) {
        return null;
    }
    for (var j = 0; j < bins.length; j++) {
        bins[j] = bins[j] / total;
    }
    return bins;
}

function compareShiftedSignatures(firstSig, secondSig, shift) {
    var sum = 0;
    var count = 0;
    for (var i = 0; i < firstSig.length; i++) {
        var j = i + shift;
        if (j < 0 || j >= secondSig.length) {
            continue;
        }
        var a = firstSig[i];
        var b = secondSig[j];
        for (var k = 0; k < a.length; k++) {
            sum += Math.abs(a[k] - b[k]);
        }
        count += 1;
    }
    if (!count) {
        return Number.POSITIVE_INFINITY;
    }
    return sum / count;
}

function isSameOriginVideo(src) {
    try {
        var url = new URL(src, window.location.href);
        return url.origin === window.location.origin;
    } catch (e) {
        return false;
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
