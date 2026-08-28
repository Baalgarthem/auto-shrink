import { SCALE_DECIMAL_FACTOR, SCALE_SYNCHRONIZATION_EPSILON } from '../config/constants.js';
/**
   * Mantiene una única representación normalizada de la escala para que la pintura,
   * el hit-testing nativo y el estado del motor utilicen exactamente el mismo valor.
   */
  export const PointerPrecisionService = (function () {
    const MEDIA_POINTER_EVENT_TYPES = Object.freeze([
      'pointerdown', 'pointermove', 'pointerup', 'pointerover', 'pointerout', 'pointercancel',
      'mousedown', 'mousemove', 'mouseup', 'mouseover', 'mouseout', 'click'
    ]);
    const MEDIA_PLAYER_SELECTOR = [
      'video', 'audio', '.html5-video-player', '.video-js', '.vjs-player',
      '.jwplayer', '.plyr', '.mejs__container', '.shaka-video-container',
      '#html5_video_wrapper', '#video-player-bg', '#xv-player', '.video-bg-pic',
      '#player', '#main-container', '.player-container', '.video-wrapper',
      '.mgp_container', '.mhp1', '[id*="player" i]', '[class*="player" i]',
      '[class*="video-player"]', '[class*="videoPlayer"]',
      '[class*="media-player"]', '[class*="mediaPlayer"]',
      '[class*="watch-video"]', '[data-video-player]', '[data-player-id]',
      '[data-testid*="video-player"]'
    ].join(',');
    const MEDIA_CONTROL_SELECTOR = [
      '[class*="seek" i]', '[class*="progress" i]', '[class*="timeline" i]',
      '[class*="seekBar" i]', '[class*="progressBar" i]', '[class*="slider" i]',
      '.mgp_seekBar', '.mgp_progressBar', '.mhp1_seekBar', '.mhp1_progressBar',
      '.noUi-target', '.noUi-base', '[role="slider"]'
    ].join(',');
    const MEDIA_TIMELINE_SELECTOR = [
      '.ytp-progress-bar-container', '.vjs-progress-holder', '.jw-slider-time',
      '.plyr__progress', '.mejs__time-rail', '.shaka-seek-bar-container',
      '.mgp_seekBar', '.mgp_progressBar', '.mhp1_seekBar', '.mhp1_progressBar',
      '.noUi-target', '.noUi-base', '.progress-bar',
      '[class*="seek-bar" i]', '[class*="seekbar" i]', '[class*="seekBar" i]',
      '[class*="progress-bar" i]', '[class*="progressBar" i]',
      '[class*="timeline" i]', '[class*="slider" i]', '[role="slider"]'
    ].join(',');
    const MEDIA_PLAYER_CONTAINER_SELECTOR = [
      '.html5-video-player', '.video-js', '.vjs-player', '.jwplayer', '.plyr',
      '.mejs__container', '.shaka-video-container',
      '#html5_video_wrapper', '#video-player-bg', '#xv-player',
      '#player', '#main-container', '.player-container', '.video-wrapper',
      '.mgp_container', '.mhp1', '[id*="player" i]', '[class*="player" i]',
      '[class*="video-player"]', '[class*="videoPlayer"]',
      '[class*="media-player"]', '[class*="mediaPlayer"]',
      '[class*="watch-video"]', '[data-video-player]', '[data-testid*="video-player"]'
    ].join(',');
    const MEDIA_TOOLTIP_SELECTOR = [
      '.ytp-tooltip', '.vjs-mouse-display', '.vjs-time-tooltip',
      '.jw-slider-time .jw-tooltip', '.jw-tooltip-time', '.plyr__tooltip',
      '.mejs__time-float', '.shaka-current-time',
      '.mgp_tooltip', '.mgp_preview', '.mhp1_tooltip', '.mhp1_preview',
      '.noUi-tooltip', '.time-tooltip', '.video-pic', '.thumb',
      '.duration', '.time', '.timestamp', '.time-tag',
      '[class*="time-tooltip" i]', '[class*="seek-tooltip" i]',
      '[class*="progress-tooltip" i]', '[class*="preview-time" i]',
      '[class*="tooltip" i]', '[class*="duration" i]', '[class*="time-tag" i]'
    ].join(',');
    const MEDIA_PORTAL_TOOLTIP_SELECTOR = [
      '.ytp-tooltip', '.vjs-mouse-display', '.vjs-time-tooltip',
      '.jw-tooltip-time', '.plyr__tooltip', '.mejs__time-float',
      '.mgp_tooltip', '.mgp_preview', '.mhp1_tooltip', '.mhp1_preview',
      '.noUi-tooltip', '[class*="time-tooltip" i]', '[class*="seek-tooltip" i]',
      '[class*="progress-tooltip" i]', '[class*="preview-time" i]', '[class*="tooltip" i]'
    ].join(',');

    let isNativeZoomSupportedCache = null;
    let hasLoggedUnsupportedZoom = false;
    let isMediaPointerPrecisionEnabled = true;
    let isPointerCorrectionInitialized = false;
    let activeScaleFactor = 1;
    let mediaTargetCache = new WeakMap();
    let correctionModeCache = new WeakMap();
    let hoverCoordinateModeCache = new WeakMap();
    let mediaTooltipCandidateCache = new WeakMap();
    let tooltipAnalysisFrameRequestId = null;
    let pendingTooltipPointerX = 0;
    let pendingTooltipPointerY = 0;
    let pendingTooltipPlayerRoot = null;
    let pendingTooltipTimelineControl = null;
    let definePageEventProperty = Object.defineProperty;

    try {
      if (typeof unsafeWindow !== 'undefined' && unsafeWindow.Object && typeof unsafeWindow.Object.defineProperty === 'function') {
        definePageEventProperty = unsafeWindow.Object.defineProperty;
      }
    } catch (e) { }

    function isNativeZoomSupported(rootElement) {
      if (isNativeZoomSupportedCache !== null) return isNativeZoomSupportedCache;
      try {
        const styleDeclaration = rootElement && rootElement.style
          ? rootElement.style
          : document.createElement('div').style;
        const hasStyleProperty = 'zoom' in styleDeclaration;
        const passesFeatureQuery = typeof CSS === 'undefined' || typeof CSS.supports !== 'function' || CSS.supports('zoom', '1');
        isNativeZoomSupportedCache = hasStyleProperty && passesFeatureQuery;
      } catch (e) {
        isNativeZoomSupportedCache = false;
      }
      return isNativeZoomSupportedCache;
    }

    function normalizeScale(scaleFactor) {
      if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return 1;
      return Math.round(scaleFactor * SCALE_DECIMAL_FACTOR) / SCALE_DECIMAL_FACTOR;
    }

    function formatScale(normalizedScaleFactor) {
      return normalizedScaleFactor.toFixed(6);
    }

    function readInlineScale(rootElement) {
      if (!rootElement || !rootElement.style) return NaN;
      return parseFloat(rootElement.style.getPropertyValue('zoom'));
    }

    function isScaleSynchronized(rootElement, expectedScaleFactor) {
      const currentScaleFactor = readInlineScale(rootElement);
      return Number.isFinite(currentScaleFactor) &&
        Math.abs(currentScaleFactor - expectedScaleFactor) <= SCALE_SYNCHRONIZATION_EPSILON &&
        rootElement.style.getPropertyPriority('zoom') === 'important';
    }

    function applyNativeScale(rootElement, normalizedScaleFactor, zoomScaleString) {
      if (!rootElement || !rootElement.style) return false;
      if (!isNativeZoomSupported(rootElement)) {
        if (!hasLoggedUnsupportedZoom) {
          hasLoggedUnsupportedZoom = true;
          console.warn('[Auto-Shrink] El navegador no admite CSS zoom nativo; se conserva escala 1:1 para no desalinear el puntero.');
        }
        return false;
      }

      if (rootElement.style.getPropertyValue('--auto-shrink-scale') !== zoomScaleString) {
        rootElement.style.setProperty('--auto-shrink-scale', zoomScaleString);
      }
      if (!isScaleSynchronized(rootElement, normalizedScaleFactor)) {
        rootElement.style.setProperty('zoom', zoomScaleString, 'important');
      }
      activeScaleFactor = normalizedScaleFactor;
      if (Math.abs(activeScaleFactor - 1) <= SCALE_SYNCHRONIZATION_EPSILON) {
        hoverCoordinateModeCache = new WeakMap();
      }
      return true;
    }

    function setMediaPointerPrecisionEnabled(isEnabled) {
      isMediaPointerPrecisionEnabled = !!isEnabled;
      if (!isMediaPointerPrecisionEnabled) hoverCoordinateModeCache = new WeakMap();
    }

    function isMediaInteractionTarget(targetElement) {
      if (!targetElement || targetElement.nodeType !== Node.ELEMENT_NODE || typeof targetElement.closest !== 'function') return false;
      if (mediaTargetCache.has(targetElement)) return mediaTargetCache.get(targetElement);

      let isMediaTarget = false;
      try {
        isMediaTarget = !!targetElement.closest(MEDIA_PLAYER_SELECTOR);
        if (!isMediaTarget && targetElement.closest(MEDIA_CONTROL_SELECTOR)) {
          let ancestor = targetElement;
          for (let depth = 0; ancestor && depth < 8; depth++, ancestor = ancestor.parentElement) {
            if (ancestor.querySelector && ancestor.querySelector('video, audio')) {
              isMediaTarget = true;
              break;
            }
          }
        }
      } catch (e) { }

      mediaTargetCache.set(targetElement, isMediaTarget);
      return isMediaTarget;
    }

    function detectOffsetCorrectionMode(targetElement, pointerEvent) {
      const cachedMode = correctionModeCache.get(targetElement);
      if (cachedMode && Math.abs(cachedMode.scaleFactor - activeScaleFactor) <= SCALE_SYNCHRONIZATION_EPSILON) {
        return cachedMode.shouldCorrect;
      }

      try {
        const layoutWidth = targetElement.offsetWidth;
        if (!layoutWidth) return false;
        const rect = targetElement.getBoundingClientRect();
        if (!rect.width) return false;

        const measuredScaleFactor = rect.width / layoutWidth;
        const permittedScaleDeviation = Math.max(0.02, activeScaleFactor * 0.08);
        if (Math.abs(measuredScaleFactor - activeScaleFactor) > permittedScaleDeviation) return false;

        const visualOffsetX = pointerEvent.clientX - rect.left;
        const logicalOffsetX = visualOffsetX / activeScaleFactor;
        const coordinateSeparation = Math.abs(logicalOffsetX - visualOffsetX);
        if (coordinateSeparation < 0.75) return false;

        const nativeOffsetX = pointerEvent.offsetX;
        const distanceToVisualCoordinates = Math.abs(nativeOffsetX - visualOffsetX);
        const distanceToLogicalCoordinates = Math.abs(nativeOffsetX - logicalOffsetX);
        const shouldCorrect = distanceToVisualCoordinates + 0.25 < distanceToLogicalCoordinates;

        correctionModeCache.set(targetElement, {
          scaleFactor: activeScaleFactor,
          shouldCorrect
        });
        return shouldCorrect;
      } catch (e) {
        return false;
      }
    }

    function defineCorrectedEventCoordinate(pointerEvent, propertyName, correctedValue) {
      if (!Number.isFinite(correctedValue)) return;
      try {
        definePageEventProperty(pointerEvent, propertyName, {
          configurable: true,
          enumerable: true,
          value: correctedValue
        });
      } catch (e) { }
    }

    function findMediaPlayerRoot(targetElement) {
      try {
        const knownContainer = targetElement.closest(MEDIA_PLAYER_CONTAINER_SELECTOR);
        if (knownContainer) return knownContainer;

        const nativeMediaElement = targetElement.closest('video, audio');
        if (nativeMediaElement) return nativeMediaElement.parentElement || nativeMediaElement;

        let ancestor = targetElement;
        for (let depth = 0; ancestor && depth < 8; depth++, ancestor = ancestor.parentElement) {
          if (ancestor.querySelector && ancestor.querySelector('video, audio')) return ancestor;
        }
      } catch (e) { }
      return null;
    }

    function isVisibleTimeTooltip(candidateElement, playerRect) {
      try {
        const rect = candidateElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        if (rect.bottom < playerRect.top - 240 || rect.top > playerRect.bottom + 240) return false;

        const computedStyle = getComputedStyle(candidateElement);
        if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden' || parseFloat(computedStyle.opacity) === 0) return false;

        const text = candidateElement.textContent || '';
        return /\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/.test(text);
      } catch (e) {
        return false;
      }
    }

    function findBestMediaTooltip(playerRoot, playerRect) {
      const cachedCandidate = mediaTooltipCandidateCache.get(playerRoot);
      if (cachedCandidate && cachedCandidate.isConnected && isVisibleTimeTooltip(cachedCandidate, playerRect)) {
        return cachedCandidate;
      }

      let bestCandidate = null;
      let bestScore = Infinity;
      let localCandidates = [];
      try {
        localCandidates = playerRoot.querySelectorAll(MEDIA_TOOLTIP_SELECTOR);
      } catch (e) { }

      for (const candidate of localCandidates) {
        if (!isVisibleTimeTooltip(candidate, playerRect)) continue;
        const rect = candidate.getBoundingClientRect();
        const verticalDistance = Math.abs((rect.top + rect.bottom) / 2 - pendingTooltipPointerY);
        const isKnownPositioningContainer = candidate.matches(
          '.ytp-tooltip, .vjs-mouse-display, .jw-tooltip, .plyr__tooltip, .mejs__time-float, .shaka-current-time'
        );
        const score = verticalDistance + (isKnownPositioningContainer ? 0 : 100);
        if (score < bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }

      if (!bestCandidate) {
        let portalCandidates = [];
        try {
          portalCandidates = document.querySelectorAll(MEDIA_PORTAL_TOOLTIP_SELECTOR);
        } catch (e) { }
        for (const candidate of portalCandidates) {
          if (!isVisibleTimeTooltip(candidate, playerRect)) continue;
          const rect = candidate.getBoundingClientRect();
          const score = Math.abs((rect.top + rect.bottom) / 2 - pendingTooltipPointerY);
          if (score < bestScore) {
            bestScore = score;
            bestCandidate = candidate;
          }
        }
      }

      if (bestCandidate) mediaTooltipCandidateCache.set(playerRoot, bestCandidate);
      return bestCandidate;
    }

    function findMediaTimelineControl(targetElement, playerRoot) {
      try {
        const directControl = targetElement.closest(MEDIA_TIMELINE_SELECTOR);
        if (directControl && directControl.offsetWidth > 0) return directControl;
        const knownControl = playerRoot.querySelector(MEDIA_TIMELINE_SELECTOR);
        if (knownControl && knownControl.offsetWidth > 0) return knownControl;
      } catch (e) { }
      return null;
    }

    function getTimelineEffectiveZoom(timelineControl, timelineRect) {
      try {
        const currentCssZoom = Number(timelineControl.currentCSSZoom);
        if (Number.isFinite(currentCssZoom) && currentCssZoom > 0) return currentCssZoom;
      } catch (e) { }

      const layoutWidth = timelineControl.offsetWidth;
      if (timelineRect && timelineRect.width > 0 && layoutWidth > 0) {
        return timelineRect.width / layoutWidth;
      }
      return activeScaleFactor;
    }

    function parseTimeTextToSeconds(text) {
      const match = String(text || '').match(/-?\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/);
      if (!match) return NaN;
      const isNegative = match[0].startsWith('-');
      const parts = match[0].replace('-', '').split(':').map(Number);
      let seconds = 0;
      for (const part of parts) seconds = seconds * 60 + part;
      return isNegative ? -seconds : seconds;
    }

    function getMediaDurationSeconds(playerRoot) {
      try {
        const mediaElement = playerRoot.matches('video, audio')
          ? playerRoot
          : playerRoot.querySelector('video, audio');
        if (mediaElement && Number.isFinite(mediaElement.duration) && mediaElement.duration > 0) {
          return mediaElement.duration;
        }

        const timeMatches = String(playerRoot.textContent || '').match(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/g) || [];
        let longestTime = 0;
        for (const timeText of timeMatches) {
          const seconds = parseTimeTextToSeconds(timeText);
          if (Number.isFinite(seconds)) longestTime = Math.max(longestTime, seconds);
        }
        return longestTime || NaN;
      } catch (e) {
        return NaN;
      }
    }

    function analyzePendingMediaTooltip() {
      tooltipAnalysisFrameRequestId = null;
      const playerRoot = pendingTooltipPlayerRoot;
      const timelineControl = pendingTooltipTimelineControl;
      if (!playerRoot || !timelineControl || !playerRoot.isConnected || !timelineControl.isConnected) return;

      try {
        const playerRect = playerRoot.getBoundingClientRect();
        const timelineRect = timelineControl.getBoundingClientRect();
        if (!timelineRect.width || !timelineControl.offsetWidth) return;
        const effectiveZoom = getTimelineEffectiveZoom(timelineControl, timelineRect);
        const existingCorrectionMode = hoverCoordinateModeCache.get(timelineControl);
        if (existingCorrectionMode &&
            Math.abs(existingCorrectionMode.scaleFactor - effectiveZoom) <= SCALE_SYNCHRONIZATION_EPSILON) return;
        const tooltipElement = findBestMediaTooltip(playerRoot, playerRect);
        if (!tooltipElement) return;

        const visualRatio = Math.max(0, Math.min(1, (pendingTooltipPointerX - timelineRect.left) / timelineRect.width));
        const uncorrectedLayoutRatio = Math.max(0, Math.min(1, (pendingTooltipPointerX - timelineRect.left) / timelineControl.offsetWidth));
        let shouldCorrectClientCoordinates = false;
        let hasReliableDiagnosis = false;

        const tooltipTimeSeconds = parseTimeTextToSeconds(tooltipElement.textContent);
        const durationSeconds = getMediaDurationSeconds(playerRoot);
        if (Number.isFinite(tooltipTimeSeconds) && Number.isFinite(durationSeconds) && durationSeconds > 0) {
          const absoluteTooltipSeconds = Math.abs(tooltipTimeSeconds);
          const tooltipRatio = Math.max(0, Math.min(1,
            tooltipTimeSeconds < 0
              ? 1 - absoluteTooltipSeconds / durationSeconds
              : absoluteTooltipSeconds / durationSeconds
          ));
          const distanceToVisualRatio = Math.abs(tooltipRatio - visualRatio);
          const distanceToUncorrectedRatio = Math.abs(tooltipRatio - uncorrectedLayoutRatio);
          if (Math.abs(distanceToVisualRatio - distanceToUncorrectedRatio) > 0.025) {
            shouldCorrectClientCoordinates = distanceToUncorrectedRatio < distanceToVisualRatio;
            hasReliableDiagnosis = true;
          }
        }

        if (!hasReliableDiagnosis) {
          const tooltipRect = tooltipElement.getBoundingClientRect();
          const tooltipCenterX = (tooltipRect.left + tooltipRect.right) / 2;
          const predictedUncorrectedCenterX = timelineRect.left +
            (pendingTooltipPointerX - timelineRect.left) * effectiveZoom;
          const distanceToPointer = Math.abs(tooltipCenterX - pendingTooltipPointerX);
          const distanceToUncorrectedPosition = Math.abs(tooltipCenterX - predictedUncorrectedCenterX);
          if (Math.abs(distanceToPointer - distanceToUncorrectedPosition) > 4) {
            shouldCorrectClientCoordinates = distanceToUncorrectedPosition < distanceToPointer;
            hasReliableDiagnosis = true;
          }
        }

        if (hasReliableDiagnosis) {
          hoverCoordinateModeCache.set(timelineControl, {
            scaleFactor: effectiveZoom,
            shouldCorrect: shouldCorrectClientCoordinates
          });
        }
      } catch (e) { }
    }

    function scheduleMediaTooltipAnalysis(pointerEvent, playerRoot, timelineControl, nativeClientX) {
      pendingTooltipPointerX = nativeClientX;
      pendingTooltipPointerY = pointerEvent.clientY;
      pendingTooltipPlayerRoot = playerRoot;
      pendingTooltipTimelineControl = timelineControl;
      if (tooltipAnalysisFrameRequestId === null) {
        tooltipAnalysisFrameRequestId = requestAnimationFrame(analyzePendingMediaTooltip);
      }
    }

    function isMediaHoverEvent(eventType) {
      return eventType === 'pointermove' || eventType === 'mousemove' ||
        eventType === 'pointerover' || eventType === 'mouseover';
    }

    function applyHoverClientCoordinateCorrection(pointerEvent, timelineControl, nativeClientX) {
      const correctionMode = hoverCoordinateModeCache.get(timelineControl);
      if (!correctionMode || !correctionMode.shouldCorrect) return;

      try {
        const rect = timelineControl.getBoundingClientRect();
        if (!rect.width || !timelineControl.offsetWidth) return;
        const effectiveZoom = getTimelineEffectiveZoom(timelineControl, rect);
        if (Math.abs(correctionMode.scaleFactor - effectiveZoom) > SCALE_SYNCHRONIZATION_EPSILON) {
          correctionMode.scaleFactor = effectiveZoom;
        }
        const correctedClientX = rect.left +
          (nativeClientX - rect.left) / effectiveZoom;
        const correctionDeltaX = correctedClientX - nativeClientX;
        const nativePageX = pointerEvent.pageX;
        defineCorrectedEventCoordinate(pointerEvent, 'clientX', correctedClientX);
        defineCorrectedEventCoordinate(pointerEvent, 'x', correctedClientX);
        defineCorrectedEventCoordinate(pointerEvent, 'pageX', nativePageX + correctionDeltaX);
      } catch (e) { }
    }

    function correctMediaPointerEvent(pointerEvent) {
      if (!isMediaPointerPrecisionEnabled || Math.abs(activeScaleFactor - 1) <= SCALE_SYNCHRONIZATION_EPSILON) return;
      const targetElement = pointerEvent.target;
      if (!isMediaInteractionTarget(targetElement)) return;
      const nativeClientX = pointerEvent.clientX;

      if (detectOffsetCorrectionMode(targetElement, pointerEvent)) {
        const inverseScaleFactor = 1 / activeScaleFactor;
        defineCorrectedEventCoordinate(pointerEvent, 'offsetX', pointerEvent.offsetX * inverseScaleFactor);
        defineCorrectedEventCoordinate(pointerEvent, 'offsetY', pointerEvent.offsetY * inverseScaleFactor);
        defineCorrectedEventCoordinate(pointerEvent, 'movementX', pointerEvent.movementX * inverseScaleFactor);
        defineCorrectedEventCoordinate(pointerEvent, 'movementY', pointerEvent.movementY * inverseScaleFactor);
      }

      if (isMediaHoverEvent(pointerEvent.type)) {
        const playerRoot = findMediaPlayerRoot(targetElement);
        if (!playerRoot) return;
        const timelineControl = findMediaTimelineControl(targetElement, playerRoot);
        if (!timelineControl) return;
        applyHoverClientCoordinateCorrection(pointerEvent, timelineControl, nativeClientX);
        scheduleMediaTooltipAnalysis(pointerEvent, playerRoot, timelineControl, nativeClientX);
      }
    }

    function initializePointerCorrection() {
      if (isPointerCorrectionInitialized) return;
      isPointerCorrectionInitialized = true;
      for (const eventType of MEDIA_POINTER_EVENT_TYPES) {
        window.addEventListener(eventType, correctMediaPointerEvent, { capture: true, passive: true });
      }
    }

    function destroy() {
      if (tooltipAnalysisFrameRequestId !== null) {
        cancelAnimationFrame(tooltipAnalysisFrameRequestId);
        tooltipAnalysisFrameRequestId = null;
      }
      if (isPointerCorrectionInitialized) {
        for (const eventType of MEDIA_POINTER_EVENT_TYPES) {
          window.removeEventListener(eventType, correctMediaPointerEvent, true);
        }
      }
      isPointerCorrectionInitialized = false;
      activeScaleFactor = 1;
      mediaTargetCache = new WeakMap();
      correctionModeCache = new WeakMap();
      hoverCoordinateModeCache = new WeakMap();
      mediaTooltipCandidateCache = new WeakMap();
      pendingTooltipPlayerRoot = null;
      pendingTooltipTimelineControl = null;
    }

    return {
      normalizeScale,
      formatScale,
      readInlineScale,
      isScaleSynchronized,
      applyNativeScale,
      setMediaPointerPrecisionEnabled,
      initializePointerCorrection,
      destroy
    };
  })();