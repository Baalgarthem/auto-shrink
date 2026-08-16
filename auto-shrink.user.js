// ==UserScript==
// @name         Auto-Shrink
// @namespace    https://github.com/Baalgarthem/auto-shrink
// @icon         https://github.com/Baalgarthem/auto-shrink/raw/refs/heads/principal/media/main_icon.ico
// @version      5.5.1
// @description  Ajusta automáticamente el zoom al ancho disponible y corrige las coordenadas del puntero en controles multimedia escalados.
// @author       Baalgarthem
// @match        *://*/*
// @noframes
// @updateURL    https://raw.githubusercontent.com/Baalgarthem/auto-shrink/principal/auto-shrink.user.js
// @downloadURL  https://raw.githubusercontent.com/Baalgarthem/auto-shrink/principal/auto-shrink.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

/**
 * Auto-Shrink Userscript v5.5.1 - Escalado automático y coordenadas adaptativas de hover
 * ------------------------------------------------------------------------------------------
 * Estructura dividida en 6 servicios modulares especializados:
 * 1. ConfigurationService: Configuración saneada y sincronización real entre pestañas.
 * 2. ViewportMetricsService: Medición del viewport y cálculo proporcional de la escala.
 * 3. PointerPrecisionService: Escala nativa única para pintura, hit-testing y estado interno.
 * 4. BrowserEnvironmentService: Detección del motor y del estado de pantalla completa.
 * 5. ZoomExecutionEngine: Aplicación idempotente, histéresis y agrupación mediante rAF.
 * 6. UserInterfaceController: Ventana modal emergente con insignias de estado en tiempo real.
 */
(function initializeAutoShrinkScriptScope() {
  'use strict';

  // Guardián de seguridad: Evitar ejecución dentro de iFrames anidados o restringidos
  try {
    if (window.top !== window.self) return;
  } catch (crossOriginSecurityException) {
    return;
  }

  // ============================================================================
  // CONSTANTES Y CONFIGURACIÓN ESTRUCTURADA INMUTABLE
  // ============================================================================

  /**
   * Modos de escalado soportados por el sistema.
   * @readonly
   * @enum {string}
   */
  const SCALING_MODES = Object.freeze({
    CONTINUOUS: 'continuous',
    THRESHOLDS: 'thresholds'
  });

  /**
   * Valores de configuración por defecto inmutables.
   * @readonly
   * @type {Object}
   */
  const DEFAULT_CONFIGURATION = Object.freeze({
    scalingMode: SCALING_MODES.CONTINUOUS,
    referenceBaseWidthSetting: 'auto',
    minimumZoomScaleLimit: 0.20,
    maximumZoomScaleLimit: 1.00,
    thresholdZoomLevelUnder80Percent: 0.85,
    thresholdZoomLevelUnder60Percent: 0.70,
    thresholdZoomLevelUnder40Percent: 0.55,
    thresholdZoomLevelUnder20Percent: 0.35,
    isMediaPointerPrecisionEnabled: true,
    isResetInFullscreenEnabled: true,
    isSplitViewAdaptationEnabled: true
  });
  const CONFIGURATION_KEYS = Object.freeze(Object.keys(DEFAULT_CONFIGURATION));

  const CONFIGURATION_MODAL_OVERLAY_ID = 'auto-shrink-configuration-modal-overlay-v2';
  const MODAL_STYLE_ID = 'auto-shrink-modal-styles-v5';
  const SCALE_UPDATE_HYSTERESIS = 0.0025;
  const SCALE_SYNCHRONIZATION_EPSILON = 0.000001;
  const SCALE_DECIMAL_FACTOR = 1000000;
  const BREAKPOINT_HYSTERESIS = 0.01;

  // ============================================================================
  // 1. SERVICIO DE CONFIGURACIÓN Y SANEAMIENTO (ConfigurationService)
  // ============================================================================

  /**
   * Servicio encargado de administrar el almacenamiento, caché en memoria sin asignaciones
   * y sincronización en tiempo real entre pestañas múltiples.
   */
  const ConfigurationService = (function () {
    const activeCache = Object.assign({}, DEFAULT_CONFIGURATION);
    const valueChangeListenerIds = [];
    let sanitizedSnapshotCache = null;

    /**
     * Carga todas las opciones almacenadas en la extensión hacia la caché en memoria.
     */
    function loadAll() {
      try {
        if (typeof GM_getValue !== 'function') return;
        for (const key of CONFIGURATION_KEYS) {
          const storedValue = GM_getValue(key, DEFAULT_CONFIGURATION[key]);
          if (storedValue !== undefined && storedValue !== null) {
            activeCache[key] = storedValue;
          }
        }
        sanitizedSnapshotCache = null; // Invalidar caché de instantánea
      } catch (e) {
        console.warn('[Auto-Shrink] Error cargando caché de configuración:', e);
      }
    }

    /**
     * Obtiene el valor de una clave de configuración.
     * @param {string} key - Clave a consultar.
     * @returns {*} Valor de la clave o valor por defecto.
     */
    function get(key) {
      return activeCache[key] !== undefined ? activeCache[key] : DEFAULT_CONFIGURATION[key];
    }

    /**
     * Retorna una instantánea validada, de tipos seguros e inmutable de la configuración activa.
     * Reutiliza la instantánea en caché para cero asignaciones de objetos en bucle caliente.
     * @returns {Object} Configuración saneada inmutable.
     */
    function getSanitizedConfig() {
      if (sanitizedSnapshotCache !== null) return sanitizedSnapshotCache;

      const minLimit = sanitizeNumeric(get('minimumZoomScaleLimit'), 0.20, 0.05, 1.00);
      const rawMax = sanitizeNumeric(get('maximumZoomScaleLimit'), 1.00, 0.50, 2.00);
      const maxLimit = Math.max(minLimit, rawMax);

      const threshold80 = sanitizeNumeric(get('thresholdZoomLevelUnder80Percent'), 0.85, minLimit, maxLimit);
      const threshold60 = Math.min(threshold80, sanitizeNumeric(get('thresholdZoomLevelUnder60Percent'), 0.70, minLimit, maxLimit));
      const threshold40 = Math.min(threshold60, sanitizeNumeric(get('thresholdZoomLevelUnder40Percent'), 0.55, minLimit, maxLimit));
      const threshold20 = Math.min(threshold40, sanitizeNumeric(get('thresholdZoomLevelUnder20Percent'), 0.35, minLimit, maxLimit));

      sanitizedSnapshotCache = Object.freeze({
        scalingMode: get('scalingMode') === SCALING_MODES.THRESHOLDS ? SCALING_MODES.THRESHOLDS : SCALING_MODES.CONTINUOUS,
        referenceBaseWidthSetting: sanitizeReferenceBaseWidth(get('referenceBaseWidthSetting')),
        minimumZoomScaleLimit: minLimit,
        maximumZoomScaleLimit: maxLimit,
        thresholdZoomLevelUnder80Percent: threshold80,
        thresholdZoomLevelUnder60Percent: threshold60,
        thresholdZoomLevelUnder40Percent: threshold40,
        thresholdZoomLevelUnder20Percent: threshold20,
        isMediaPointerPrecisionEnabled: !!get('isMediaPointerPrecisionEnabled'),
        isResetInFullscreenEnabled: !!get('isResetInFullscreenEnabled'),
        isSplitViewAdaptationEnabled: !!get('isSplitViewAdaptationEnabled')
      });

      return sanitizedSnapshotCache;
    }

    /**
     * Establece el valor de una clave de configuración y actualiza el almacenamiento persistente.
     * @param {string} key - Clave a modificar.
     * @param {*} value - Nuevo valor.
     */
    function set(key, value) {
      try {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_CONFIGURATION, key) || Object.is(activeCache[key], value)) return false;
        activeCache[key] = value;
        sanitizedSnapshotCache = null; // Invalidar instantánea
        if (typeof GM_setValue === 'function') {
          GM_setValue(key, value);
        }
        return true;
      } catch (e) {
        console.warn(`[Auto-Shrink] Error guardando clave "${key}":`, e);
        return false;
      }
    }

    function setMany(values) {
      let hasChanges = false;
      for (const key of CONFIGURATION_KEYS) {
        if (Object.prototype.hasOwnProperty.call(values, key)) {
          hasChanges = set(key, values[key]) || hasChanges;
        }
      }
      return hasChanges;
    }

    /**
     * Restablece todas las opciones de configuración a sus valores por defecto.
     */
    function resetAll() {
      return setMany(DEFAULT_CONFIGURATION);
    }

    /**
     * Valida y restringe un valor numérico dentro de límites predefinidos.
     * @param {*} value - Valor de entrada.
     * @param {number} fallbackValue - Valor de respaldo en caso de ser inválido.
     * @param {number} minBound - Límite inferior.
     * @param {number} maxBound - Límite superior.
     * @returns {number} Valor saneado.
     */
    function sanitizeNumeric(value, fallbackValue, minBound, maxBound) {
      const parsed = parseFloat(value);
      if (!Number.isFinite(parsed)) return fallbackValue;
      return Math.max(minBound, Math.min(maxBound, parsed));
    }

    function sanitizeReferenceBaseWidth(value) {
      if (value === 'auto') return 'auto';
      const parsed = parseInt(value, 10);
      return Number.isFinite(parsed) ? Math.max(320, Math.min(10000, parsed)) : 'auto';
    }

    function initializeSynchronization() {
      loadAll();
      if (typeof GM_addValueChangeListener !== 'function') return;

      for (const key of CONFIGURATION_KEYS) {
        try {
          const listenerId = GM_addValueChangeListener(key, (_name, _oldValue, newValue, isRemote) => {
            if (!isRemote) return;
            activeCache[key] = newValue === undefined ? DEFAULT_CONFIGURATION[key] : newValue;
            sanitizedSnapshotCache = null;
            ZoomExecutionEngine.scheduleFrameExecution(true);
          });
          valueChangeListenerIds.push(listenerId);
        } catch (e) { }
      }
    }

    function destroy() {
      if (typeof GM_removeValueChangeListener !== 'function') return;
      for (const listenerId of valueChangeListenerIds) {
        try {
          GM_removeValueChangeListener(listenerId);
        } catch (e) { }
      }
      valueChangeListenerIds.length = 0;
    }

    initializeSynchronization();

    return {
      getSanitizedConfig,
      setMany,
      resetAll,
      sanitizeNumeric,
      destroy
    };
  })();

  // ============================================================================
  // 2. SERVICIO DE MÉTRICAS DEL VIEWPORT (ViewportMetricsService)
  // ============================================================================

  /**
   * Servicio encargado de calcular métricas estables del viewport y la pantalla de referencia.
   */
  const ViewportMetricsService = (function () {
    const THRESHOLD_BOUNDARIES = Object.freeze([0.20, 0.40, 0.60, 0.80]);
    let activeThresholdBand = -1;

    /**
     * Detecta si el usuario está realizando un gesto de pinch-zoom táctil nativo.
     * @returns {boolean} True si hay un pinch-zoom activo.
     */
    function isPinchZoomActive() {
      try {
        if (window.visualViewport && typeof window.visualViewport.scale === 'number') {
          return Math.abs(window.visualViewport.scale - 1.0) > 0.05;
        }
      } catch (e) { }
      return false;
    }

    /**
     * Calcula el ancho base de la pantalla en píxeles considerando la densidad DPI.
     * @param {number} [currentViewportWidthPx] - Ancho actual del viewport.
     * @returns {number} Ancho base de referencia en píxeles.
     */
    function getScreenWidth() {
      try {
        if (window.screen) {
          const availableWidth = Number(window.screen.availWidth);
          const totalWidth = Number(window.screen.width);
          if (Number.isFinite(availableWidth) && availableWidth > 0) return availableWidth;
          if (Number.isFinite(totalWidth) && totalWidth > 0) return totalWidth;
        }
      } catch (e) { }
      return 0;
    }

    function calculateReferenceBaseWidth(currentViewportWidthPx, referenceBaseWidthSetting, screenWidthPx) {
      try {
        const setting = referenceBaseWidthSetting;
        if (typeof setting === 'number' && setting > 0) return setting;
        const screenWidth = screenWidthPx || getScreenWidth();
        return screenWidth > 0 ? Math.max(currentViewportWidthPx || 0, screenWidth) : (currentViewportWidthPx || 1920);
      } catch (e) {
        return 1920;
      }
    }

    /**
     * Computa el factor de escala aplicando el modo activo y respetando límites efectivos.
     * @param {number} currentViewportWidthPx - Ancho actual del viewport.
     * @param {number} referenceBaseWidthPx - Ancho base de referencia.
     * @param {Object} config - Configuración saneada activa.
     * @returns {number} Factor de zoom restringido dentro de límites.
     */
    function computeZoomScaleFactor(currentViewportWidthPx, referenceBaseWidthPx, config) {
      const ratio = currentViewportWidthPx / referenceBaseWidthPx;

      let computedScale = 1.0;

      if (config.scalingMode === SCALING_MODES.THRESHOLDS) {
        if (activeThresholdBand < 0) {
          activeThresholdBand = ratio < 0.20 ? 0 : ratio < 0.40 ? 1 : ratio < 0.60 ? 2 : ratio < 0.80 ? 3 : 4;
        } else {
          while (activeThresholdBand < 4 && ratio >= THRESHOLD_BOUNDARIES[activeThresholdBand] + BREAKPOINT_HYSTERESIS) {
            activeThresholdBand++;
          }
          while (activeThresholdBand > 0 && ratio < THRESHOLD_BOUNDARIES[activeThresholdBand - 1] - BREAKPOINT_HYSTERESIS) {
            activeThresholdBand--;
          }
        }

        if (activeThresholdBand === 0) computedScale = config.thresholdZoomLevelUnder20Percent;
        else if (activeThresholdBand === 1) computedScale = config.thresholdZoomLevelUnder40Percent;
        else if (activeThresholdBand === 2) computedScale = config.thresholdZoomLevelUnder60Percent;
        else if (activeThresholdBand === 3) computedScale = config.thresholdZoomLevelUnder80Percent;
        else computedScale = config.maximumZoomScaleLimit;
      } else {
        activeThresholdBand = -1;
        computedScale = ratio >= 1.0 ? Math.min(1.00, config.maximumZoomScaleLimit) : ratio;
      }

      return Math.max(config.minimumZoomScaleLimit, Math.min(config.maximumZoomScaleLimit, computedScale));
    }

    return {
      isPinchZoomActive,
      getScreenWidth,
      calculateReferenceBaseWidth,
      computeZoomScaleFactor
    };
  })();

  // ============================================================================
  // 3. PRECISIÓN DE COORDENADAS Y ESCALA NATIVA (PointerPrecisionService)
  // ============================================================================

  /**
   * Mantiene una única representación normalizada de la escala para que la pintura,
   * el hit-testing nativo y el estado del motor utilicen exactamente el mismo valor.
   */
  const PointerPrecisionService = (function () {
    const MEDIA_POINTER_EVENT_TYPES = Object.freeze([
      'pointerdown', 'pointermove', 'pointerup', 'pointerover', 'pointerout', 'pointercancel',
      'mousedown', 'mousemove', 'mouseup', 'mouseover', 'mouseout', 'click'
    ]);
    const MEDIA_PLAYER_SELECTOR = [
      'video', 'audio', '.html5-video-player', '.video-js', '.vjs-player',
      '.jwplayer', '.plyr', '.mejs__container', '.shaka-video-container',
      '[class*="video-player"]', '[class*="videoPlayer"]',
      '[class*="media-player"]', '[class*="mediaPlayer"]',
      '[class*="watch-video"]', '[data-video-player]',
      '[data-testid*="video-player"]'
    ].join(',');
    const MEDIA_CONTROL_SELECTOR = '[class*="seek"], [class*="progress"], [class*="timeline"], [role="slider"]';
    const MEDIA_TIMELINE_SELECTOR = [
      '.ytp-progress-bar-container', '.vjs-progress-holder', '.jw-slider-time',
      '.plyr__progress', '.mejs__time-rail', '.shaka-seek-bar-container',
      '[class*="seek-bar" i]', '[class*="seekbar" i]',
      '[class*="progress-bar" i]', '[class*="timeline" i]', '[role="slider"]'
    ].join(',');
    const MEDIA_PLAYER_CONTAINER_SELECTOR = [
      '.html5-video-player', '.video-js', '.vjs-player', '.jwplayer', '.plyr',
      '.mejs__container', '.shaka-video-container', '[class*="video-player"]',
      '[class*="videoPlayer"]', '[class*="media-player"]', '[class*="mediaPlayer"]',
      '[class*="watch-video"]', '[data-video-player]', '[data-testid*="video-player"]'
    ].join(',');
    const MEDIA_TOOLTIP_SELECTOR = [
      '.ytp-tooltip', '.vjs-mouse-display', '.vjs-time-tooltip',
      '.jw-slider-time .jw-tooltip', '.jw-tooltip-time', '.plyr__tooltip',
      '.mejs__time-float', '.shaka-current-time',
      '[class*="time-tooltip" i]', '[class*="seek-tooltip" i]',
      '[class*="progress-tooltip" i]', '[class*="preview-time" i]',
      '[class*="tooltip" i]'
    ].join(',');
    const MEDIA_PORTAL_TOOLTIP_SELECTOR = [
      '.ytp-tooltip', '.vjs-mouse-display', '.vjs-time-tooltip',
      '.jw-tooltip-time', '.plyr__tooltip', '.mejs__time-float',
      '[class*="time-tooltip" i]', '[class*="seek-tooltip" i]',
      '[class*="progress-tooltip" i]', '[class*="preview-time" i]'
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

  // ============================================================================
  // 4. SERVICIO DE ENTORNO Y PANTALLA COMPLETA (BrowserEnvironmentService)
  // ============================================================================

  /**
   * Servicio encargado de detectar el motor del navegador y la pantalla completa.
   */
  const BrowserEnvironmentService = (function () {
    /**
     * Identifica el motor nativo del navegador para aplicar optimizaciones específicas.
     * @returns {string} 'gecko' (Firefox), 'blink' (Chrome/Edge/Brave) o 'generic'.
     */
    function detectNativeBrowserEngine() {
      try {
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('firefox') || userAgent.includes('gecko/')) return 'gecko';
        if (userAgent.includes('chrome') || userAgent.includes('chromium') || userAgent.includes('edg/')) return 'blink';
      } catch (e) { }
      return 'generic';
    }

    /**
     * Verifica si el documento o algún elemento está en pantalla completa nativa.
     * @returns {boolean} True si está en pantalla completa.
     */
    function isDocumentInFullscreenMode() {
      try {
        return !!(
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement
        );
      } catch (e) {
        return false;
      }
    }

    /**
     * Instala una única vez las variables CSS propias del userscript.
     */
    return {
      detectNativeBrowserEngine,
      isDocumentInFullscreenMode
    };
  })();

  // ============================================================================
  // 5. MOTOR DE EJECUCIÓN DE ZOOM ULTRA-OPTIMIZADO (ZoomExecutionEngine)
  // ============================================================================

  /**
   * Motor de ejecución de zoom con escrituras agrupadas y filtro de histéresis.
   */
  const ZoomExecutionEngine = (function () {
    let isAnimationFrameScheduled = false;
    let isForcedApplicationPending = false;
    let animationFrameRequestId = null;
    let styleMutationObserver = null;
    let lastAppliedZoomScaleString = null;
    let lastAppliedScaleValue = 1.0;
    let lastViewportWidth = -1;
    let lastScreenWidth = -1;
    let lastConfigurationSnapshot = null;
    let lastFullscreenState = false;
    let originalInlineZoom = null;
    let originalInlineZoomPriority = '';

    /**
     * Consulta el ancho válido del viewport navegando entre múltiples fuentes de respaldo.
     * @returns {number} Ancho en píxeles.
     */
    function getValidViewportWidth() {
      try {
        if (window.innerWidth && window.innerWidth > 0) return window.innerWidth;
        if (document.documentElement && document.documentElement.clientWidth > 0) return document.documentElement.clientWidth;
        if (document.body && document.body.clientWidth > 0) return document.body.clientWidth;
        if (window.screen && window.screen.width > 0) return window.screen.width;
      } catch (e) { }
      return 0;
    }

    /**
     * Aplica la escala calculada asignando variables CSS y aplicando zoom nativo con filtro de histéresis.
     */
    function applyViewportZoomScale(forceApplication) {
      if (document.hidden) return;
      if (ViewportMetricsService.isPinchZoomActive()) return;

      try {
        const rootElement = document.documentElement;
        if (!rootElement) return;

        const config = ConfigurationService.getSanitizedConfig();
        PointerPrecisionService.setMediaPointerPrecisionEnabled(config.isMediaPointerPrecisionEnabled);
        const currentViewportWidthPx = getValidViewportWidth();
        if (!currentViewportWidthPx) return;
        const monitorWidth = ViewportMetricsService.getScreenWidth() || currentViewportWidthPx;
        const isFullscreen = BrowserEnvironmentService.isDocumentInFullscreenMode();

        if (!forceApplication &&
            currentViewportWidthPx === lastViewportWidth &&
            monitorWidth === lastScreenWidth &&
            config === lastConfigurationSnapshot &&
            isFullscreen === lastFullscreenState) {
          return;
        }

        lastViewportWidth = currentViewportWidthPx;
        lastScreenWidth = monitorWidth;
        lastConfigurationSnapshot = config;
        lastFullscreenState = isFullscreen;

        if (config.isResetInFullscreenEnabled && isFullscreen) {
          const fullscreenScaleValue = 1;
          const fullscreenScaleString = PointerPrecisionService.formatScale(fullscreenScaleValue);
          if (forceApplication || lastAppliedZoomScaleString !== fullscreenScaleString || !PointerPrecisionService.isScaleSynchronized(rootElement, fullscreenScaleValue)) {
            if (PointerPrecisionService.applyNativeScale(rootElement, fullscreenScaleValue, fullscreenScaleString)) {
              lastAppliedZoomScaleString = fullscreenScaleString;
              lastAppliedScaleValue = fullscreenScaleValue;
            }
          }
          return;
        }

        const viewportToScreenRatio = currentViewportWidthPx / monitorWidth;
        const isSplitView = viewportToScreenRatio < 0.90;
        const automaticReferenceWidth = ViewportMetricsService.calculateReferenceBaseWidth(
          currentViewportWidthPx,
          config.referenceBaseWidthSetting,
          monitorWidth
        );
        const referenceBaseWidthPx = (!config.isSplitViewAdaptationEnabled && isSplitView && config.referenceBaseWidthSetting === 'auto')
          ? currentViewportWidthPx
          : automaticReferenceWidth;
        const computedZoomScaleFactor = ViewportMetricsService.computeZoomScaleFactor(currentViewportWidthPx, referenceBaseWidthPx, config);
        const normalizedZoomScaleFactor = PointerPrecisionService.normalizeScale(computedZoomScaleFactor);
        const zoomScaleString = PointerPrecisionService.formatScale(normalizedZoomScaleFactor);
        const expectedCurrentScaleFactor = lastAppliedZoomScaleString === null ? normalizedZoomScaleFactor : lastAppliedScaleValue;
        const zoomWasOverwritten = !PointerPrecisionService.isScaleSynchronized(rootElement, expectedCurrentScaleFactor);

        if (!forceApplication && !zoomWasOverwritten && lastAppliedZoomScaleString !== null && Math.abs(normalizedZoomScaleFactor - lastAppliedScaleValue) < SCALE_UPDATE_HYSTERESIS) {
          return;
        }

        if (!forceApplication && lastAppliedZoomScaleString === zoomScaleString && !zoomWasOverwritten) {
          return;
        }

        if (PointerPrecisionService.applyNativeScale(rootElement, normalizedZoomScaleFactor, zoomScaleString)) {
          lastAppliedZoomScaleString = zoomScaleString;
          lastAppliedScaleValue = normalizedZoomScaleFactor;
        }
      } catch (e) { }
    }

    /**
     * Programa la ejecución del zoom en el siguiente cuadro de animación (requestAnimationFrame).
     */
    function scheduleFrameExecution(forceApplication) {
      isForcedApplicationPending = isForcedApplicationPending || !!forceApplication;
      if (!isAnimationFrameScheduled) {
        animationFrameRequestId = requestAnimationFrame(() => {
          const shouldForceApplication = isForcedApplicationPending;
          isAnimationFrameScheduled = false;
          isForcedApplicationPending = false;
          animationFrameRequestId = null;
          applyViewportZoomScale(shouldForceApplication);
        });
        isAnimationFrameScheduled = true;
      }
    }

    /**
     * Inicializa el observador de mutaciones de estilo para prevenir sobreescrituras en SPAs.
     */
    function initializeStyleMutationProtectionObserver() {
      try {
        const rootElement = document.documentElement;
        if (!rootElement || styleMutationObserver) return;

        styleMutationObserver = new MutationObserver((mutations) => {
          if (mutations.length > 0 && lastAppliedZoomScaleString !== null && !PointerPrecisionService.isScaleSynchronized(rootElement, lastAppliedScaleValue)) {
            scheduleFrameExecution(true);
          }
        });

        styleMutationObserver.observe(rootElement, {
          attributes: true,
          attributeFilter: ['style']
        });
      } catch (e) { }
    }

    /**
     * Limpia observadores y solicitudes de cuadro de animación.
     */
    function destroy() {
      if (styleMutationObserver) {
        styleMutationObserver.disconnect();
        styleMutationObserver = null;
      }
      if (animationFrameRequestId !== null) {
        cancelAnimationFrame(animationFrameRequestId);
        animationFrameRequestId = null;
      }
      isAnimationFrameScheduled = false;
      isForcedApplicationPending = false;
      lastViewportWidth = -1;
      lastScreenWidth = -1;
      lastConfigurationSnapshot = null;
      const rootElement = document.documentElement;
      if (rootElement && lastAppliedZoomScaleString !== null) {
        if (originalInlineZoom === '') rootElement.style.removeProperty('zoom');
        else rootElement.style.setProperty('zoom', originalInlineZoom, originalInlineZoomPriority);
        rootElement.style.removeProperty('--auto-shrink-scale');
      }
    }

    return {
      applyViewportZoomScale,
      scheduleFrameExecution,
      initializeStyleMutationProtectionObserver,
      rememberOriginalStyle() {
        const rootElement = document.documentElement;
        if (!rootElement || originalInlineZoom !== null) return;
        originalInlineZoom = rootElement.style.getPropertyValue('zoom');
        originalInlineZoomPriority = rootElement.style.getPropertyPriority('zoom');
      },
      destroy
    };
  })();

  // ============================================================================
  // 6. CONTROLADOR DE INTERFAZ DE USUARIO (UserInterfaceController)
  // ============================================================================

  /**
   * Controlador de la ventana modal de configuración con indicador de estado en tiempo real.
   */
  const UserInterfaceController = (function () {
    function injectModalStyles() {
      if (document.getElementById(MODAL_STYLE_ID)) return;
      const modalStylesCssText = `
        #${CONFIGURATION_MODAL_OVERLAY_ID} {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          background: rgba(15, 23, 42, 0.85) !important;
          backdrop-filter: blur(8px) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          z-index: 2147483647 !important;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
          box-sizing: border-box !important;
          color: #f8fafc !important;
          zoom: calc(1 / var(--auto-shrink-scale, 1)) !important;
          transform-origin: center center !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} .as-dialog-card {
          background: #1e293b !important;
          border: 1px solid #475569 !important;
          border-radius: 16px !important;
          width: 540px !important;
          max-width: 94vw !important;
          max-height: 92vh !important;
          overflow-y: auto !important;
          padding: 28px !important;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.75) !important;
          font-size: 15px !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} h2 {
          margin: 0 0 18px 0 !important;
          font-size: 21px !important;
          font-weight: 700 !important;
          color: #38bdf8 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} .as-status-badge-container {
          display: flex !important;
          gap: 8px !important;
          margin-bottom: 16px !important;
          flex-wrap: wrap !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} .as-status-badge {
          background: #0f172a !important;
          border: 1px solid #334155 !important;
          border-radius: 6px !important;
          padding: 6px 12px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          color: #38bdf8 !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} .as-config-section {
          background: #0f172a !important;
          border: 1px solid #334155 !important;
          border-radius: 12px !important;
          padding: 16px !important;
          margin-bottom: 16px !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} .as-section-title {
          font-size: 14px !important;
          font-weight: 600 !important;
          color: #94a3b8 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          margin-bottom: 12px !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} .as-field-group {
          margin-bottom: 14px !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} .as-field-group:last-child {
          margin-bottom: 0 !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} label {
          display: block !important;
          font-size: 14px !important;
          font-weight: 500 !important;
          color: #cbd5e1 !important;
          margin-bottom: 6px !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} input[type="number"],
        #${CONFIGURATION_MODAL_OVERLAY_ID} select {
          width: 100% !important;
          padding: 11px 14px !important;
          background: #1e293b !important;
          border: 1px solid #475569 !important;
          border-radius: 8px !important;
          color: #f8fafc !important;
          font-size: 15px !important;
          box-sizing: border-box !important;
          outline: none !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} input:focus,
        #${CONFIGURATION_MODAL_OVERLAY_ID} select:focus {
          border-color: #38bdf8 !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} .as-grid-two-columns {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 12px !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} .as-checkbox-label {
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          cursor: pointer !important;
          font-size: 14px !important;
          margin-bottom: 10px !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} input[type="checkbox"] {
          width: 18px !important;
          height: 18px !important;
          accent-color: #38bdf8 !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} .as-button-actions {
          display: flex !important;
          justify-content: flex-end !important;
          gap: 12px !important;
          margin-top: 24px !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} button {
          padding: 11px 22px !important;
          border-radius: 8px !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          border: none !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} .btn-save-action {
          background: #0284c7 !important;
          color: #ffffff !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} .btn-save-action:hover {
          background: #0369a1 !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} .btn-cancel-action {
          background: #334155 !important;
          color: #cbd5e1 !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} .btn-cancel-action:hover {
          background: #475569 !important;
        }
        #${CONFIGURATION_MODAL_OVERLAY_ID} .btn-reset-action {
          background: transparent !important;
          color: #ef4444 !important;
          margin-right: auto !important;
          padding-left: 0 !important;
        }
      `;

      try {
        const styleElement = document.createElement('style');
        styleElement.id = MODAL_STYLE_ID;
        styleElement.textContent = modalStylesCssText;
        const targetParent = document.head || document.documentElement;
        if (targetParent) targetParent.appendChild(styleElement);
      } catch (e) { }
    }

    function destroyModal(overlayElement, listenerBindings) {
      if (!overlayElement) return;

      if (Array.isArray(listenerBindings)) {
        for (const binding of listenerBindings) {
          if (binding.element && typeof binding.listener === 'function') {
            binding.element.removeEventListener(binding.type, binding.listener);
          }
        }
      }
      overlayElement.remove();
    }

    /**
     * Renderiza la ventana modal con insignias de estado activo en tiempo real.
     */
    function renderModal() {
      try {
        if (document.getElementById(CONFIGURATION_MODAL_OVERLAY_ID)) return;

        injectModalStyles();

        const config = ConfigurationService.getSanitizedConfig();
        const monitorWidth = ViewportMetricsService.getScreenWidth() || 1920;
        const currentViewportWidthPx = window.innerWidth || monitorWidth;
        const isSplitView = config.isSplitViewAdaptationEnabled && (currentViewportWidthPx / monitorWidth) < 0.90;
        const engine = BrowserEnvironmentService.detectNativeBrowserEngine();

        const overlayElement = document.createElement('div');
        overlayElement.id = CONFIGURATION_MODAL_OVERLAY_ID;

        const isThresholdMode = config.scalingMode === SCALING_MODES.THRESHOLDS;
        const isCustomBase = config.referenceBaseWidthSetting !== 'auto';

        overlayElement.innerHTML = `
          <div class="as-dialog-card">
            <h2>
              <span>⚙️ Configuración Auto-Shrink</span>
              <span style="font-size:12px;color:#64748b;font-weight:normal;">v5.5.1</span>
            </h2>

            <!-- Insignias de Estado en Tiempo Real -->
            <div class="as-status-badge-container">
              <div class="as-status-badge">🌐 Motor: ${engine.toUpperCase()}</div>
              <div class="as-status-badge">📱 Vista Dividida: ${isSplitView ? 'ACTIVA' : 'Inactiva (Full)'}</div>
              <div class="as-status-badge">🔒 Límites: ${Math.round(config.minimumZoomScaleLimit * 100)}% - ${Math.round(config.maximumZoomScaleLimit * 100)}%</div>
            </div>

            <!-- SECCIÓN: VISTA DIVIDIDA Y PANTALLA COMPLETA -->
            <div class="as-config-section">
              <div class="as-section-title">Vista Dividida y Pantalla Completa</div>
              <div class="as-field-group">
                <label class="as-checkbox-label">
                  <input type="checkbox" id="as-checkbox-split-view" ${config.isSplitViewAdaptationEnabled ? 'checked' : ''}>
                  📱 Adaptación Inteligente para Vista Dividida (Firefox / Chrome / Edge / Windows Snap)
                </label>
                <label class="as-checkbox-label">
                  <input type="checkbox" id="as-checkbox-reset-fullscreen" ${config.isResetInFullscreenEnabled ? 'checked' : ''}>
                  📺 Restaurar zoom al 100% nativo al poner el video en Pantalla Completa
                </label>
                <label class="as-checkbox-label">
                  <input type="checkbox" id="as-checkbox-media-pointer" ${config.isMediaPointerPrecisionEnabled ? 'checked' : ''}>
                  🎯 Alinear cursor y etiquetas de tiempo en controles multimedia
                </label>
              </div>
            </div>

            <!-- SECCIÓN: MODO DE ESCALADO -->
            <div class="as-config-section">
              <div class="as-section-title">Modo de Escalado</div>
              <div class="as-field-group">
                <select id="as-select-scaling-mode">
                  <option value="${SCALING_MODES.CONTINUOUS}" ${!isThresholdMode ? 'selected' : ''}>Continuo / Proporcional (Dinámico)</option>
                  <option value="${SCALING_MODES.THRESHOLDS}" ${isThresholdMode ? 'selected' : ''}>Por Umbrales de Tamaño (&lt;80%, &lt;60%, &lt;40%, &lt;20%)</option>
                </select>
              </div>
            </div>

            <!-- SECCIÓN: PANTALLA BASE -->
            <div class="as-config-section">
              <div class="as-section-title">Pantalla Base de Referencia (100% Zoom)</div>
              <div class="as-field-group">
                <select id="as-select-base-width-type">
                  <option value="auto" ${!isCustomBase ? 'selected' : ''}>Detección Automática (Monitor Actual)</option>
                  <option value="custom" ${isCustomBase ? 'selected' : ''}>Personalizado (Píxeles fijos)</option>
                </select>
              </div>
              <div class="as-field-group" id="as-container-custom-width" style="display: ${isCustomBase ? 'block' : 'none'};">
                <label for="as-input-custom-width">Ancho en Píxeles (ej: 1920, 2560, 1366):</label>
                <input type="number" id="as-input-custom-width" value="${isCustomBase ? config.referenceBaseWidthSetting : 1920}" min="800" max="7680">
              </div>
            </div>

            <!-- SECCIÓN: UMBRALES (BREAKPOINTS) -->
            <div class="as-config-section" id="as-section-thresholds-container" style="display: ${isThresholdMode ? 'block' : 'none'};">
              <div class="as-section-title">Niveles de Zoom por Tamaño de Ventana</div>
              <div class="as-grid-two-columns">
                <div class="as-field-group">
                  <label for="as-input-threshold-80">Ventana &lt; 80%:</label>
                  <input type="number" id="as-input-threshold-80" value="${Math.round(config.thresholdZoomLevelUnder80Percent * 100)}" min="10" max="150">
                </div>
                <div class="as-field-group">
                  <label for="as-input-threshold-60">Ventana &lt; 60%:</label>
                  <input type="number" id="as-input-threshold-60" value="${Math.round(config.thresholdZoomLevelUnder60Percent * 100)}" min="10" max="150">
                </div>
                <div class="as-field-group">
                  <label for="as-input-threshold-40">Ventana &lt; 40%:</label>
                  <input type="number" id="as-input-threshold-40" value="${Math.round(config.thresholdZoomLevelUnder40Percent * 100)}" min="10" max="150">
                </div>
                <div class="as-field-group">
                  <label for="as-input-threshold-20">Ventana &lt; 20%:</label>
                  <input type="number" id="as-input-threshold-20" value="${Math.round(config.thresholdZoomLevelUnder20Percent * 100)}" min="10" max="150">
                </div>
              </div>
            </div>

            <!-- SECCIÓN: LÍMITES GLOBALES -->
            <div class="as-config-section">
              <div class="as-section-title">Límites de Zoom Absolutos (Anti-Sobrescalado)</div>
              <div class="as-grid-two-columns">
                <div class="as-field-group">
                  <label for="as-input-minimum-zoom">Zoom Mínimo (%):</label>
                  <input type="number" id="as-input-minimum-zoom" value="${Math.round(config.minimumZoomScaleLimit * 100)}" min="10" max="100">
                </div>
                <div class="as-field-group">
                  <label for="as-input-maximum-zoom">Zoom Máximo (%):</label>
                  <input type="number" id="as-input-maximum-zoom" value="${Math.round(config.maximumZoomScaleLimit * 100)}" min="50" max="200">
                </div>
              </div>
            </div>

            <div class="as-button-actions">
              <button class="btn-reset-action" id="as-button-reset">Restablecer</button>
              <button class="btn-cancel-action" id="as-button-cancel">Cancelar</button>
              <button class="btn-save-action" id="as-button-save">Guardar y Aplicar</button>
            </div>
          </div>
        `;

        const targetParent = document.body || document.documentElement;
        if (targetParent) {
          targetParent.appendChild(overlayElement);
        }

        const scalingModeSelect = overlayElement.querySelector('#as-select-scaling-mode');
        const thresholdsContainer = overlayElement.querySelector('#as-section-thresholds-container');
        const baseWidthSelect = overlayElement.querySelector('#as-select-base-width-type');
        const customWidthContainer = overlayElement.querySelector('#as-container-custom-width');
        const buttonReset = overlayElement.querySelector('#as-button-reset');
        const buttonCancel = overlayElement.querySelector('#as-button-cancel');
        const buttonSave = overlayElement.querySelector('#as-button-save');

        const listenerBindings = [];

        const handleModeChange = () => {
          thresholdsContainer.style.display = scalingModeSelect.value === SCALING_MODES.THRESHOLDS ? 'block' : 'none';
        };

        const handleBaseChange = () => {
          customWidthContainer.style.display = baseWidthSelect.value === 'custom' ? 'block' : 'none';
        };

        const handleCancel = () => {
          destroyModal(overlayElement, listenerBindings);
        };

        const handleReset = () => {
          ConfigurationService.resetAll();
          ZoomExecutionEngine.applyViewportZoomScale(true);
          destroyModal(overlayElement, listenerBindings);
        };

        const handleSave = () => {
          const modeVal = scalingModeSelect.value;
          let baseVal = 'auto';

          if (baseWidthSelect.value === 'custom') {
            const parsedWidth = parseInt(overlayElement.querySelector('#as-input-custom-width').value, 10);
            baseVal = (Number.isFinite(parsedWidth) && parsedWidth > 0) ? parsedWidth : 1920;
          }

          const minZoom = ConfigurationService.sanitizeNumeric(
            overlayElement.querySelector('#as-input-minimum-zoom').value,
            20, 5, 100
          );
          const maxZoom = ConfigurationService.sanitizeNumeric(
            overlayElement.querySelector('#as-input-maximum-zoom').value,
            100, minZoom, 200
          );

          const s80 = ConfigurationService.sanitizeNumeric(overlayElement.querySelector('#as-input-threshold-80').value, 85, 10, 150) / 100;
          const s60 = ConfigurationService.sanitizeNumeric(overlayElement.querySelector('#as-input-threshold-60').value, 70, 10, 150) / 100;
          const s40 = ConfigurationService.sanitizeNumeric(overlayElement.querySelector('#as-input-threshold-40').value, 55, 10, 150) / 100;
          const s20 = ConfigurationService.sanitizeNumeric(overlayElement.querySelector('#as-input-threshold-20').value, 35, 10, 150) / 100;

          const isFullscreen = overlayElement.querySelector('#as-checkbox-reset-fullscreen').checked;
          const isSplitView = overlayElement.querySelector('#as-checkbox-split-view').checked;
          const isMediaPointerPrecisionEnabled = overlayElement.querySelector('#as-checkbox-media-pointer').checked;

          ConfigurationService.setMany({
            scalingMode: modeVal,
            referenceBaseWidthSetting: baseVal,
            minimumZoomScaleLimit: minZoom / 100,
            maximumZoomScaleLimit: maxZoom / 100,
            thresholdZoomLevelUnder80Percent: s80,
            thresholdZoomLevelUnder60Percent: s60,
            thresholdZoomLevelUnder40Percent: s40,
            thresholdZoomLevelUnder20Percent: s20,
            isMediaPointerPrecisionEnabled,
            isResetInFullscreenEnabled: isFullscreen,
            isSplitViewAdaptationEnabled: isSplitView
          });

          ZoomExecutionEngine.applyViewportZoomScale(true);
          destroyModal(overlayElement, listenerBindings);
        };

        scalingModeSelect.addEventListener('change', handleModeChange);
        listenerBindings.push({ element: scalingModeSelect, type: 'change', listener: handleModeChange });

        baseWidthSelect.addEventListener('change', handleBaseChange);
        listenerBindings.push({ element: baseWidthSelect, type: 'change', listener: handleBaseChange });

        buttonCancel.addEventListener('click', handleCancel);
        listenerBindings.push({ element: buttonCancel, type: 'click', listener: handleCancel });

        buttonReset.addEventListener('click', handleReset);
        listenerBindings.push({ element: buttonReset, type: 'click', listener: handleReset });

        buttonSave.addEventListener('click', handleSave);
        listenerBindings.push({ element: buttonSave, type: 'click', listener: handleSave });

      } catch (e) {
        console.error('[Auto-Shrink] Error al renderizar modal:', e);
      }
    }

    function registerMenuCommands() {
      try {
        if (typeof GM_registerMenuCommand === 'function') {
          GM_registerMenuCommand('⚙️ Configurar Auto-Shrink v5.5.1', renderModal);
          GM_registerMenuCommand('🔄 Restablecer Valores', () => {
            ConfigurationService.resetAll();
            ZoomExecutionEngine.applyViewportZoomScale(true);
          });
          GM_registerMenuCommand('🌐 Ver Repositorio en GitHub', () => {
            window.open('https://github.com/Baalgarthem/auto-shrink', '_blank');
          });
        }
      } catch (e) { }
    }

    return {
      renderModal,
      registerMenuCommands
    };
  })();

  // ============================================================================
  // 7. CICLO DE VIDA GLOBAL Y ENGANCHES MULTIETAPA
  // ============================================================================

  let isEngineInitialized = false;

  function initializeEngine() {
    if (isEngineInitialized || !document.documentElement) return;
    isEngineInitialized = true;

    ZoomExecutionEngine.rememberOriginalStyle();
    PointerPrecisionService.initializePointerCorrection();
    try {
      ZoomExecutionEngine.applyViewportZoomScale();
    } catch (e) { }

    try {
      ZoomExecutionEngine.initializeStyleMutationProtectionObserver();
    } catch (e) { }

    try {
      UserInterfaceController.registerMenuCommands();
    } catch (e) { }
  }

  function destroyEngineLifecycle() {
    if (!isEngineInitialized) return;
    isEngineInitialized = false;
    try {
      ZoomExecutionEngine.destroy();
      PointerPrecisionService.destroy();
      ConfigurationService.destroy();
      window.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('orientationchange', handleEnvironmentChange);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleEnvironmentChange);
      document.removeEventListener('webkitfullscreenchange', handleEnvironmentChange);
      document.removeEventListener('mozfullscreenchange', handleEnvironmentChange);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', handleViewportResize);
      if (window.screen && window.screen.orientation) {
        window.screen.orientation.removeEventListener('change', handleEnvironmentChange);
      }
    } catch (e) { }
  }

  function handleVisibilityChange() {
    if (!document.hidden) ZoomExecutionEngine.scheduleFrameExecution(true);
  }

  function handleViewportResize() {
    ZoomExecutionEngine.scheduleFrameExecution(false);
  }

  function handleEnvironmentChange() {
    ZoomExecutionEngine.scheduleFrameExecution(true);
  }

  function handlePageShow() {
    if (!isEngineInitialized) initializeEngine();
    ZoomExecutionEngine.scheduleFrameExecution(true);
  }

  function handlePageHide(event) {
    if (!event.persisted) destroyEngineLifecycle();
  }

  if (document.documentElement) {
    initializeEngine();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEngine, { once: true });
  } else {
    initializeEngine();
  }

  window.addEventListener('resize', handleViewportResize, { passive: true });
  window.addEventListener('pageshow', handlePageShow, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewportResize, { passive: true });
  }
  if (window.screen && window.screen.orientation) {
    window.screen.orientation.addEventListener('change', handleEnvironmentChange, { passive: true });
  }
  window.addEventListener('orientationchange', handleEnvironmentChange, { passive: true });

  document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });

  document.addEventListener('fullscreenchange', handleEnvironmentChange, { passive: true });
  document.addEventListener('webkitfullscreenchange', handleEnvironmentChange, { passive: true });
  document.addEventListener('mozfullscreenchange', handleEnvironmentChange, { passive: true });

  window.addEventListener('pagehide', handlePageHide, { once: true });
  window.addEventListener('beforeunload', destroyEngineLifecycle, { once: true });
})();
