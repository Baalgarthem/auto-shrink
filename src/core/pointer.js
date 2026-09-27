import { SCALE_SYNCHRONIZATION_EPSILON, SCALE_DECIMAL_FACTOR } from '../config/constants.js';

/**
 * Servicio de precisión de puntero y coordenadas multimedia con inyección de dependencias.
 */
export class PointerPrecisionService {
  /**
   * @param {Object} [dependencies]
   * @param {Window} [dependencies.windowProvider] - Objeto window global.
   * @param {Document} [dependencies.documentProvider] - Objeto document global.
   * @param {Object} [dependencies.unsafeWindowProvider] - Contexto de ventana de la página para Object.defineProperty.
   */
  constructor(dependencies = {}) {
    this.windowProvider = dependencies.windowProvider || (typeof window !== 'undefined' ? window : null);
    this.documentProvider = dependencies.documentProvider || (typeof document !== 'undefined' ? document : null);
    this.unsafeWindowProvider = dependencies.unsafeWindowProvider || (typeof unsafeWindow !== 'undefined' ? unsafeWindow : null);

    this.MEDIA_POINTER_EVENT_TYPES = Object.freeze([
      'pointerdown', 'pointermove', 'pointerup', 'pointerover', 'pointerout', 'pointercancel',
      'mousedown', 'mousemove', 'mouseup', 'mouseover', 'mouseout', 'click'
    ]);

    this.MEDIA_PLAYER_SELECTOR = [
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

    this.MEDIA_CONTROL_SELECTOR = [
      '[class*="seek" i]', '[class*="progress" i]', '[class*="timeline" i]',
      '[class*="seekBar" i]', '[class*="progressBar" i]', '[class*="slider" i]',
      '.mgp_seekBar', '.mgp_progressBar', '.mhp1_seekBar', '.mhp1_progressBar',
      '.noUi-target', '.noUi-base', '[role="slider"]'
    ].join(',');

    this.MEDIA_TIMELINE_SELECTOR = [
      '.ytp-progress-bar-container', '.vjs-progress-holder', '.jw-slider-time',
      '.plyr__progress', '.mejs__time-rail', '.shaka-seek-bar-container',
      '.mgp_seekBar', '.mgp_progressBar', '.mhp1_seekBar', '.mhp1_progressBar',
      '.noUi-target', '.noUi-base', '.progress-bar',
      '[class*="seek-bar" i]', '[class*="seekbar" i]', '[class*="seekBar" i]',
      '[class*="progress-bar" i]', '[class*="progressBar" i]',
      '[class*="timeline" i]', '[class*="slider" i]', '[role="slider"]'
    ].join(',');

    this.MEDIA_PLAYER_CONTAINER_SELECTOR = [
      '.html5-video-player', '.video-js', '.vjs-player', '.jwplayer', '.plyr',
      '.mejs__container', '.shaka-video-container',
      '#html5_video_wrapper', '#video-player-bg', '#xv-player',
      '#player', '#main-container', '.player-container', '.video-wrapper',
      '.mgp_container', '.mhp1', '[id*="player" i]', '[class*="player" i]',
      '[class*="video-player"]', '[class*="videoPlayer"]',
      '[class*="media-player"]', '[class*="mediaPlayer"]',
      '[class*="watch-video"]', '[data-video-player]', '[data-testid*="video-player"]'
    ].join(',');

    this.MEDIA_TOOLTIP_SELECTOR = [
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

    this.MEDIA_PORTAL_TOOLTIP_SELECTOR = [
      '.ytp-tooltip', '.vjs-mouse-display', '.vjs-time-tooltip',
      '.jw-tooltip-time', '.plyr__tooltip', '.mejs__time-float',
      '.mgp_tooltip', '.mgp_preview', '.mhp1_tooltip', '.mhp1_preview',
      '.noUi-tooltip', '[class*="time-tooltip" i]', '[class*="seek-tooltip" i]',
      '[class*="progress-tooltip" i]', '[class*="preview-time" i]', '[class*="tooltip" i]'
    ].join(',');

    this.isNativeZoomSupportedCache = null;
    this.hasLoggedUnsupportedZoom = false;
    this.isMediaPointerPrecisionEnabled = true;
    this.isPointerCorrectionInitialized = false;
    this.activeScaleFactor = 1;
    this.mediaTargetCache = new WeakMap();
    this.correctionModeCache = new WeakMap();
    this.hoverCoordinateModeCache = new WeakMap();
    this.mediaTooltipCandidateCache = new WeakMap();
    this.tooltipAnalysisFrameRequestId = null;
    this.pendingTooltipPointerX = 0;
    this.pendingTooltipPointerY = 0;
    this.pendingTooltipPlayerRoot = null;
    this.pendingTooltipTimelineControl = null;

    this.definePageEventProperty = Object.defineProperty;
    try {
      if (this.unsafeWindowProvider && this.unsafeWindowProvider.Object && typeof this.unsafeWindowProvider.Object.defineProperty === 'function') {
        this.definePageEventProperty = this.unsafeWindowProvider.Object.defineProperty;
      }
    } catch (e) { }

    this.boundCorrectMediaPointerEvent = this.correctMediaPointerEvent.bind(this);
    this.boundAnalyzePendingMediaTooltip = this.analyzePendingMediaTooltip.bind(this);
  }

  isNativeZoomSupported(rootElement) {
    if (this.isNativeZoomSupportedCache !== null) return this.isNativeZoomSupportedCache;
    try {
      const doc = this.documentProvider;
      const styleDeclaration = rootElement && rootElement.style
        ? rootElement.style
        : (doc ? doc.createElement('div').style : {});
      const hasStyleProperty = 'zoom' in styleDeclaration;
      const passesFeatureQuery = typeof CSS === 'undefined' || typeof CSS.supports !== 'function' || CSS.supports('zoom', '1');
      this.isNativeZoomSupportedCache = hasStyleProperty && passesFeatureQuery;
    } catch (e) {
      this.isNativeZoomSupportedCache = false;
    }
    return this.isNativeZoomSupportedCache;
  }

  normalizeScale(scaleFactor) {
    if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return 1;
    return Math.round(scaleFactor * SCALE_DECIMAL_FACTOR) / SCALE_DECIMAL_FACTOR;
  }

  formatScale(normalizedScaleFactor) {
    return normalizedScaleFactor.toFixed(6);
  }

  readInlineScale(rootElement) {
    if (!rootElement || !rootElement.style) return NaN;
    return parseFloat(rootElement.style.getPropertyValue('zoom'));
  }

  isScaleSynchronized(rootElement, expectedScaleFactor) {
    const currentScaleFactor = this.readInlineScale(rootElement);
    return Number.isFinite(currentScaleFactor) &&
      Math.abs(currentScaleFactor - expectedScaleFactor) <= SCALE_SYNCHRONIZATION_EPSILON &&
      rootElement.style.getPropertyPriority('zoom') === 'important';
  }

  applyNativeScale(rootElement, normalizedScaleFactor, zoomScaleString) {
    if (!rootElement || !rootElement.style) return false;
    if (!this.isNativeZoomSupported(rootElement)) {
      if (!this.hasLoggedUnsupportedZoom) {
        this.hasLoggedUnsupportedZoom = true;
        console.warn('[Auto-Shrink] El navegador no admite CSS zoom nativo; se conserva escala 1:1 para no desalinear el puntero.');
      }
      return false;
    }

    if (rootElement.style.getPropertyValue('--auto-shrink-scale') !== zoomScaleString) {
      rootElement.style.setProperty('--auto-shrink-scale', zoomScaleString);
    }
    if (!this.isScaleSynchronized(rootElement, normalizedScaleFactor)) {
      rootElement.style.setProperty('zoom', zoomScaleString, 'important');
    }
    this.activeScaleFactor = normalizedScaleFactor;
    if (Math.abs(this.activeScaleFactor - 1) <= SCALE_SYNCHRONIZATION_EPSILON) {
      this.hoverCoordinateModeCache = new WeakMap();
    }
    return true;
  }

  setMediaPointerPrecisionEnabled(isEnabled) {
    this.isMediaPointerPrecisionEnabled = !!isEnabled;
    if (!this.isMediaPointerPrecisionEnabled) this.hoverCoordinateModeCache = new WeakMap();
  }

  isMediaInteractionTarget(targetElement) {
    if (!targetElement || targetElement.nodeType !== Node.ELEMENT_NODE || typeof targetElement.closest !== 'function') return false;
    if (this.mediaTargetCache.has(targetElement)) return this.mediaTargetCache.get(targetElement);

    let isMediaTarget = false;
    try {
      isMediaTarget = !!targetElement.closest(this.MEDIA_PLAYER_SELECTOR);
      if (!isMediaTarget && targetElement.closest(this.MEDIA_CONTROL_SELECTOR)) {
        let ancestor = targetElement;
        for (let depth = 0; ancestor && depth < 8; depth++, ancestor = ancestor.parentElement) {
          if (ancestor.querySelector && ancestor.querySelector('video, audio')) {
            isMediaTarget = true;
            break;
          }
        }
      }
    } catch (e) { }

    this.mediaTargetCache.set(targetElement, isMediaTarget);
    return isMediaTarget;
  }

  detectOffsetCorrectionMode(targetElement, pointerEvent) {
    const cachedMode = this.correctionModeCache.get(targetElement);
    if (cachedMode && Math.abs(cachedMode.scaleFactor - this.activeScaleFactor) <= SCALE_SYNCHRONIZATION_EPSILON) {
      return cachedMode.shouldCorrect;
    }

    try {
      const layoutWidth = targetElement.offsetWidth;
      if (!layoutWidth) return false;
      const rect = targetElement.getBoundingClientRect();
      if (!rect.width) return false;

      const measuredScaleFactor = rect.width / layoutWidth;
      const permittedScaleDeviation = Math.max(0.02, this.activeScaleFactor * 0.08);
      if (Math.abs(measuredScaleFactor - this.activeScaleFactor) > permittedScaleDeviation) return false;

      const visualOffsetX = pointerEvent.clientX - rect.left;
      const logicalOffsetX = visualOffsetX / this.activeScaleFactor;
      const coordinateSeparation = Math.abs(logicalOffsetX - visualOffsetX);
      if (coordinateSeparation < 0.75) return false;

      const nativeOffsetX = pointerEvent.offsetX;
      const distanceToVisualCoordinates = Math.abs(nativeOffsetX - visualOffsetX);
      const distanceToLogicalCoordinates = Math.abs(nativeOffsetX - logicalOffsetX);
      const shouldCorrect = distanceToVisualCoordinates + 0.25 < distanceToLogicalCoordinates;

      this.correctionModeCache.set(targetElement, {
        scaleFactor: this.activeScaleFactor,
        shouldCorrect
      });
      return shouldCorrect;
    } catch (e) {
      return false;
    }
  }

  defineCorrectedEventCoordinate(pointerEvent, propertyName, correctedValue) {
    if (!Number.isFinite(correctedValue)) return;
    try {
      this.definePageEventProperty(pointerEvent, propertyName, {
        configurable: true,
        enumerable: true,
        value: correctedValue
      });
    } catch (e) { }
  }

  findMediaPlayerRoot(targetElement) {
    try {
      const knownContainer = targetElement.closest(this.MEDIA_PLAYER_CONTAINER_SELECTOR);
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

  isVisibleTimeTooltip(candidateElement, playerRect) {
    try {
      const rect = candidateElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      if (rect.bottom < playerRect.top - 240 || rect.top > playerRect.bottom + 240) return false;

      const win = this.windowProvider;
      const computedStyle = win ? win.getComputedStyle(candidateElement) : candidateElement.style;
      if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden' || parseFloat(computedStyle.opacity) === 0) return false;

      const text = candidateElement.textContent || '';
      return /\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/.test(text);
    } catch (e) {
      return false;
    }
  }

  findBestMediaTooltip(playerRoot, playerRect) {
    const cachedCandidate = this.mediaTooltipCandidateCache.get(playerRoot);
    if (cachedCandidate && cachedCandidate.isConnected && this.isVisibleTimeTooltip(cachedCandidate, playerRect)) {
      return cachedCandidate;
    }

    let bestCandidate = null;
    let bestScore = Infinity;
    let localCandidates = [];
    try {
      localCandidates = playerRoot.querySelectorAll(this.MEDIA_TOOLTIP_SELECTOR);
    } catch (e) { }

    for (const candidate of localCandidates) {
      if (!this.isVisibleTimeTooltip(candidate, playerRect)) continue;
      const rect = candidate.getBoundingClientRect();
      const verticalDistance = Math.abs((rect.top + rect.bottom) / 2 - this.pendingTooltipPointerY);
      const isKnownPositioningContainer = candidate.matches(
        '.ytp-tooltip, .vjs-mouse-display, .jw-tooltip, .plyr__tooltip, .mejs__time-float, .shaka-current-time'
      );
      const score = verticalDistance + (isKnownPositioningContainer ? 0 : 100);
      if (score < bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    if (!bestCandidate && this.documentProvider) {
      let portalCandidates = [];
      try {
        portalCandidates = this.documentProvider.querySelectorAll(this.MEDIA_PORTAL_TOOLTIP_SELECTOR);
      } catch (e) { }
      for (const candidate of portalCandidates) {
        if (!this.isVisibleTimeTooltip(candidate, playerRect)) continue;
        const rect = candidate.getBoundingClientRect();
        const score = Math.abs((rect.top + rect.bottom) / 2 - this.pendingTooltipPointerY);
        if (score < bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }
    }

    if (bestCandidate) this.mediaTooltipCandidateCache.set(playerRoot, bestCandidate);
    return bestCandidate;
  }

  findMediaTimelineControl(targetElement, playerRoot) {
    try {
      const directControl = targetElement.closest(this.MEDIA_TIMELINE_SELECTOR);
      if (directControl && directControl.offsetWidth > 0) return directControl;
      const knownControl = playerRoot.querySelector(this.MEDIA_TIMELINE_SELECTOR);
      if (knownControl && knownControl.offsetWidth > 0) return knownControl;
    } catch (e) { }
    return null;
  }

  getTimelineEffectiveZoom(timelineControl, timelineRect) {
    try {
      const currentCssZoom = Number(timelineControl.currentCSSZoom);
      if (Number.isFinite(currentCssZoom) && currentCssZoom > 0) return currentCssZoom;
    } catch (e) { }

    const layoutWidth = timelineControl.offsetWidth;
    if (timelineRect && timelineRect.width > 0 && layoutWidth > 0) {
      return timelineRect.width / layoutWidth;
    }
    return this.activeScaleFactor;
  }

  parseTimeTextToSeconds(text) {
    const match = String(text || '').match(/-?\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/);
    if (!match) return NaN;
    const isNegative = match[0].startsWith('-');
    const parts = match[0].replace('-', '').split(':').map(Number);
    let seconds = 0;
    for (const part of parts) seconds = seconds * 60 + part;
    return isNegative ? -seconds : seconds;
  }

  getMediaDurationSeconds(playerRoot) {
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
        const seconds = this.parseTimeTextToSeconds(timeText);
        if (Number.isFinite(seconds)) longestTime = Math.max(longestTime, seconds);
      }
      return longestTime || NaN;
    } catch (e) {
      return NaN;
    }
  }

  analyzePendingMediaTooltip() {
    this.tooltipAnalysisFrameRequestId = null;
    const playerRoot = this.pendingTooltipPlayerRoot;
    const timelineControl = this.pendingTooltipTimelineControl;
    if (!playerRoot || !timelineControl || !playerRoot.isConnected || !timelineControl.isConnected) return;

    try {
      const playerRect = playerRoot.getBoundingClientRect();
      const timelineRect = timelineControl.getBoundingClientRect();
      if (!timelineRect.width || !timelineControl.offsetWidth) return;
      const effectiveZoom = this.getTimelineEffectiveZoom(timelineControl, timelineRect);
      const existingCorrectionMode = this.hoverCoordinateModeCache.get(timelineControl);
      if (existingCorrectionMode &&
          Math.abs(existingCorrectionMode.scaleFactor - effectiveZoom) <= SCALE_SYNCHRONIZATION_EPSILON) return;
      const tooltipElement = this.findBestMediaTooltip(playerRoot, playerRect);
      if (!tooltipElement) return;

      const visualRatio = Math.max(0, Math.min(1, (this.pendingTooltipPointerX - timelineRect.left) / timelineRect.width));
      const uncorrectedLayoutRatio = Math.max(0, Math.min(1, (this.pendingTooltipPointerX - timelineRect.left) / timelineControl.offsetWidth));
      let shouldCorrectClientCoordinates = false;
      let hasReliableDiagnosis = false;

      const tooltipTimeSeconds = this.parseTimeTextToSeconds(tooltipElement.textContent);
      const durationSeconds = this.getMediaDurationSeconds(playerRoot);
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
          (this.pendingTooltipPointerX - timelineRect.left) * effectiveZoom;
        const distanceToPointer = Math.abs(tooltipCenterX - this.pendingTooltipPointerX);
        const distanceToUncorrectedPosition = Math.abs(tooltipCenterX - predictedUncorrectedCenterX);
        if (Math.abs(distanceToPointer - distanceToUncorrectedPosition) > 4) {
          shouldCorrectClientCoordinates = distanceToUncorrectedPosition < distanceToPointer;
          hasReliableDiagnosis = true;
        }
      }

      if (hasReliableDiagnosis) {
        this.hoverCoordinateModeCache.set(timelineControl, {
          scaleFactor: effectiveZoom,
          shouldCorrect: shouldCorrectClientCoordinates
        });
      }
    } catch (e) { }
  }

  scheduleMediaTooltipAnalysis(pointerEvent, playerRoot, timelineControl, nativeClientX) {
    this.pendingTooltipPointerX = nativeClientX;
    this.pendingTooltipPointerY = pointerEvent.clientY;
    this.pendingTooltipPlayerRoot = playerRoot;
    this.pendingTooltipTimelineControl = timelineControl;
    if (this.tooltipAnalysisFrameRequestId === null && this.windowProvider) {
      this.tooltipAnalysisFrameRequestId = this.windowProvider.requestAnimationFrame(this.boundAnalyzePendingMediaTooltip);
    }
  }

  isMediaHoverEvent(eventType) {
    return eventType === 'pointermove' || eventType === 'mousemove' ||
      eventType === 'pointerover' || eventType === 'mouseover';
  }

  applyHoverClientCoordinateCorrection(pointerEvent, timelineControl, nativeClientX) {
    const correctionMode = this.hoverCoordinateModeCache.get(timelineControl);
    if (!correctionMode || !correctionMode.shouldCorrect) return;

    try {
      const rect = timelineControl.getBoundingClientRect();
      if (!rect.width || !timelineControl.offsetWidth) return;
      const effectiveZoom = this.getTimelineEffectiveZoom(timelineControl, rect);
      if (Math.abs(correctionMode.scaleFactor - effectiveZoom) > SCALE_SYNCHRONIZATION_EPSILON) {
        correctionMode.scaleFactor = effectiveZoom;
      }
      const correctedClientX = rect.left +
        (nativeClientX - rect.left) / effectiveZoom;
      const correctionDeltaX = correctedClientX - nativeClientX;
      const nativePageX = pointerEvent.pageX;
      this.defineCorrectedEventCoordinate(pointerEvent, 'clientX', correctedClientX);
      this.defineCorrectedEventCoordinate(pointerEvent, 'x', correctedClientX);
      this.defineCorrectedEventCoordinate(pointerEvent, 'pageX', nativePageX + correctionDeltaX);
    } catch (e) { }
  }

  correctMediaPointerEvent(pointerEvent) {
    if (!this.isMediaPointerPrecisionEnabled || Math.abs(this.activeScaleFactor - 1) <= SCALE_SYNCHRONIZATION_EPSILON) return;
    const targetElement = pointerEvent.target;
    if (!this.isMediaInteractionTarget(targetElement)) return;
    const nativeClientX = pointerEvent.clientX;

    if (this.detectOffsetCorrectionMode(targetElement, pointerEvent)) {
      const inverseScaleFactor = 1 / this.activeScaleFactor;
      this.defineCorrectedEventCoordinate(pointerEvent, 'offsetX', pointerEvent.offsetX * inverseScaleFactor);
      this.defineCorrectedEventCoordinate(pointerEvent, 'offsetY', pointerEvent.offsetY * inverseScaleFactor);
      this.defineCorrectedEventCoordinate(pointerEvent, 'movementX', pointerEvent.movementX * inverseScaleFactor);
      this.defineCorrectedEventCoordinate(pointerEvent, 'movementY', pointerEvent.movementY * inverseScaleFactor);
    }

    if (this.isMediaHoverEvent(pointerEvent.type)) {
      const playerRoot = this.findMediaPlayerRoot(targetElement);
      if (!playerRoot) return;
      const timelineControl = this.findMediaTimelineControl(targetElement, playerRoot);
      if (!timelineControl) return;
      this.applyHoverClientCoordinateCorrection(pointerEvent, timelineControl, nativeClientX);
      this.scheduleMediaTooltipAnalysis(pointerEvent, playerRoot, timelineControl, nativeClientX);
    }
  }

  initializePointerCorrection() {
    if (this.isPointerCorrectionInitialized || !this.windowProvider) return;
    this.isPointerCorrectionInitialized = true;
    for (const eventType of this.MEDIA_POINTER_EVENT_TYPES) {
      this.windowProvider.addEventListener(eventType, this.boundCorrectMediaPointerEvent, { capture: true, passive: true });
    }
  }

  destroy() {
    if (this.tooltipAnalysisFrameRequestId !== null && this.windowProvider) {
      this.windowProvider.cancelAnimationFrame(this.tooltipAnalysisFrameRequestId);
      this.tooltipAnalysisFrameRequestId = null;
    }
    if (this.isPointerCorrectionInitialized && this.windowProvider) {
      for (const eventType of this.MEDIA_POINTER_EVENT_TYPES) {
        this.windowProvider.removeEventListener(eventType, this.boundCorrectMediaPointerEvent, true);
      }
    }
    this.isPointerCorrectionInitialized = false;
    this.activeScaleFactor = 1;
    this.mediaTargetCache = new WeakMap();
    this.correctionModeCache = new WeakMap();
    this.hoverCoordinateModeCache = new WeakMap();
    this.mediaTooltipCandidateCache = new WeakMap();
    this.pendingTooltipPlayerRoot = null;
    this.pendingTooltipTimelineControl = null;
  }
}