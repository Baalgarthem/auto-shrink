// ==UserScript==
// @name         Auto-Shrink
// @namespace    https://github.com/Baalgarthem/auto-shrink
// @version      3.6.1
// @description  Reducción dinámica del tamaño de página con adaptación a la orientación de pantalla, protección anti-sobrescritura de estilos, variables CSS extendidas y actualización desde GitHub.
// @author       Baalgarthem
// @match        *://*/*
// @noframes
// @updateURL    https://raw.githubusercontent.com/Baalgarthem/auto-shrink/principal/auto-shrink.user.js
// @downloadURL  https://raw.githubusercontent.com/Baalgarthem/auto-shrink/principal/auto-shrink.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

/**
 * Auto-Shrink Userscript v3.6.0 - Motor de Escalado e Integración Responsiva
 * ----------------------------------------------------------------------------
 * Estructura dividida en 6 servicios modulares especializados:
 * 1. ConfigurationService: Caché inmutable, protección anti-corrupción y validación min <= max.
 * 2. ViewportMetricsService: Métricas del viewport DPI-aware con detección multi-proporción (50%, 33%, 25%).
 * 3. VisualStabilizationService: Estabilización responsiva, variables CSS extendidas y compensación de scrollbar.
 * 4. MediaProtectionService: Detección de motor (Gecko/Blink) y precisión del puntero 1:1.
 * 5. ZoomExecutionEngine: Filtro de histéresis anti-vibración, anti-sobrescritura y MutationObserver rAF (16ms).
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
  // CONSTANTES Y CONFIGURACIÓN ESTRUCTURADA
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
    isSmoothTransitionEnabled: false,
    isProtectVideoPlayersEnabled: true,
    isResetInFullscreenEnabled: true,
    isSplitViewAdaptationEnabled: true
  });

  const CONFIGURATION_MODAL_OVERLAY_ID = 'auto-shrink-configuration-modal-overlay-v2';
  const VISUAL_STABILIZATION_STYLE_ID = 'auto-shrink-visual-stabilization-styles';
  const HYSTERESIS_THRESHOLD = 0.005; // 0.5% de tolerancia para evitar vibraciones de sub-píxel

  // ============================================================================
  // 1. SERVICIO DE CONFIGURACIÓN Y SANEAMIENTO (ConfigurationService)
  // ============================================================================

  /**
   * Servicio encargado de administrar el almacenamiento, caché en memoria, saneamiento
   * y validación cruzada de límites de configuración con protección anti-corrupción.
   */
  const ConfigurationService = (function () {
    const activeCache = Object.assign({}, DEFAULT_CONFIGURATION);

    /**
     * Carga todas las opciones almacenadas en la extensión hacia la caché en memoria.
     */
    function loadAll() {
      try {
        if (typeof GM_getValue !== 'function') return;
        for (const key of Object.keys(DEFAULT_CONFIGURATION)) {
          const storedValue = GM_getValue(key, DEFAULT_CONFIGURATION[key]);
          if (storedValue !== undefined && storedValue !== null) {
            activeCache[key] = storedValue;
          }
        }
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
     * @returns {Object} Configuración saneada inmutable.
     */
    function getSanitizedConfig() {
      const minLimit = sanitizeNumeric(get('minimumZoomScaleLimit'), 0.20, 0.05, 1.00);
      const rawMax = sanitizeNumeric(get('maximumZoomScaleLimit'), 1.00, 0.50, 2.00);
      
      // Validación cruzada estricta (min <= max)
      const maxLimit = Math.max(minLimit, rawMax);

      return Object.freeze({
        scalingMode: get('scalingMode') === SCALING_MODES.THRESHOLDS ? SCALING_MODES.THRESHOLDS : SCALING_MODES.CONTINUOUS,
        referenceBaseWidthSetting: get('referenceBaseWidthSetting'),
        minimumZoomScaleLimit: minLimit,
        maximumZoomScaleLimit: maxLimit,
        thresholdZoomLevelUnder80Percent: sanitizeNumeric(get('thresholdZoomLevelUnder80Percent'), 0.85, minLimit, maxLimit),
        thresholdZoomLevelUnder60Percent: sanitizeNumeric(get('thresholdZoomLevelUnder60Percent'), 0.70, minLimit, maxLimit),
        thresholdZoomLevelUnder40Percent: sanitizeNumeric(get('thresholdZoomLevelUnder40Percent'), 0.55, minLimit, maxLimit),
        thresholdZoomLevelUnder20Percent: sanitizeNumeric(get('thresholdZoomLevelUnder20Percent'), 0.35, minLimit, maxLimit),
        isSmoothTransitionEnabled: !!get('isSmoothTransitionEnabled'),
        isProtectVideoPlayersEnabled: !!get('isProtectVideoPlayersEnabled'),
        isResetInFullscreenEnabled: !!get('isResetInFullscreenEnabled'),
        isSplitViewAdaptationEnabled: !!get('isSplitViewAdaptationEnabled')
      });
    }

    /**
     * Establece el valor de una clave de configuración y actualiza el almacenamiento persistente.
     * @param {string} key - Clave a modificar.
     * @param {*} value - Nuevo valor.
     */
    function set(key, value) {
      try {
        activeCache[key] = value;
        if (typeof GM_setValue === 'function') {
          GM_setValue(key, value);
        }
      } catch (e) {
        console.warn(`[Auto-Shrink] Error guardando clave "${key}":`, e);
      }
    }

    /**
     * Restablece todas las opciones de configuración a sus valores por defecto.
     */
    function resetAll() {
      for (const key of Object.keys(DEFAULT_CONFIGURATION)) {
        set(key, DEFAULT_CONFIGURATION[key]);
      }
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

    loadAll();

    return {
      get,
      getSanitizedConfig,
      set,
      resetAll,
      sanitizeNumeric
    };
  })();

  // ============================================================================
  // 2. SERVICIO DE MÉTRICAS DEL VIEWPORT (ViewportMetricsService)
  // ============================================================================

  /**
   * Servicio encargado de calcular el ancho base de referencia, detectar contexto
   * de vista dividida multi-proporción (50%, 33%, 25%) y aplicar adaptaciones DPI-aware.
   */
  const ViewportMetricsService = (function () {

    /**
     * Analiza la dimensión del viewport e identifica distribuciones de vista dividida multi-proporción.
     * @param {number} currentViewportWidthPx - Ancho del viewport en píxeles.
     * @param {number} monitorWidth - Ancho del monitor en píxeles.
     * @returns {Object} Contexto detallado de vista dividida.
     */
    function detectSplitViewContext(currentViewportWidthPx, monitorWidth) {
      const ratioToMonitor = currentViewportWidthPx / monitorWidth;
      const isAdaptationActive = ConfigurationService.get('isSplitViewAdaptationEnabled');
      let isSplitView = false;
      let effectiveBaseWidth = monitorWidth;
      let splitType = 'full';

      if (isAdaptationActive && ratioToMonitor <= 0.78) {
        isSplitView = true;
        if (ratioToMonitor <= 0.38) {
          // Vista dividida en un tercio (33%) o un cuarto (25%)
          effectiveBaseWidth = monitorWidth / 3;
          splitType = 'third';
        } else {
          // Vista dividida a la mitad (50%)
          effectiveBaseWidth = monitorWidth / 2;
          splitType = 'half';
        }
      }

      return Object.freeze({
        isSplitView,
        splitType,
        ratioToMonitor,
        effectiveBaseWidth: Math.max(400, effectiveBaseWidth)
      });
    }

    /**
     * Recalcula dinámicamente los límites de zoom mínimo y máximo según la distribución.
     * @param {number} userMin - Zoom mínimo configurado por el usuario.
     * @param {number} userMax - Zoom máximo configurado por el usuario.
     * @param {boolean} isSplitView - True si la ventana está en vista dividida.
     * @returns {Object} Limites efectivos saneados.
     */
    function computeDynamicSplitBounds(userMin, userMax, isSplitView) {
      if (isSplitView) {
        const effectiveMin = Math.max(userMin, 0.40); // Previene reducción excesiva en split view
        const effectiveMax = Math.min(userMax, 1.00); // 100% nativo en panel dividido
        return Object.freeze({ effectiveMin, effectiveMax });
      }
      return Object.freeze({ effectiveMin: userMin, effectiveMax: userMax });
    }

    /**
     * Calcula el ancho base de la pantalla en píxeles considerando la densidad DPI.
     * @param {number} [currentViewportWidthPx] - Ancho actual del viewport.
     * @returns {number} Ancho base de referencia en píxeles.
     */
    function calculateReferenceBaseWidth(currentViewportWidthPx) {
      try {
        const setting = ConfigurationService.get('referenceBaseWidthSetting');
        if (typeof setting === 'number' && setting > 0) return setting;
        if (typeof setting === 'string' && setting !== 'auto') {
          const parsed = parseInt(setting, 10);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }

        let monitorWidth = (window.screen && window.screen.width) ? window.screen.width : 1920;
        
        // Ajuste DPI-aware para pantallas de alta densidad
        if (window.devicePixelRatio && window.devicePixelRatio > 1.25 && window.screen.availWidth) {
          monitorWidth = Math.max(monitorWidth, window.screen.availWidth);
        }

        const splitContext = detectSplitViewContext(currentViewportWidthPx || monitorWidth, monitorWidth);
        return splitContext.effectiveBaseWidth;
      } catch (e) {
        return 1920;
      }
    }

    /**
     * Computa el factor de escala aplicando el modo activo y respetando límites efectivos.
     * @param {number} currentViewportWidthPx - Ancho actual del viewport.
     * @param {number} referenceBaseWidthPx - Ancho base de referencia.
     * @param {Object} bounds - Limites efectivos { effectiveMin, effectiveMax }.
     * @returns {number} Factor de zoom restringido dentro de límites.
     */
    function computeZoomScaleFactor(currentViewportWidthPx, referenceBaseWidthPx, bounds) {
      const config = ConfigurationService.getSanitizedConfig();
      const ratio = currentViewportWidthPx / referenceBaseWidthPx;
      const minLimit = bounds ? bounds.effectiveMin : config.minimumZoomScaleLimit;
      const maxLimit = bounds ? bounds.effectiveMax : config.maximumZoomScaleLimit;

      let computedScale = 1.0;

      if (config.scalingMode === SCALING_MODES.THRESHOLDS) {
        if (ratio < 0.20) {
          computedScale = config.thresholdZoomLevelUnder20Percent;
        } else if (ratio < 0.40) {
          computedScale = config.thresholdZoomLevelUnder40Percent;
        } else if (ratio < 0.60) {
          computedScale = config.thresholdZoomLevelUnder60Percent;
        } else if (ratio < 0.80) {
          computedScale = config.thresholdZoomLevelUnder80Percent;
        } else {
          computedScale = maxLimit;
        }
      } else {
        // Enfoque estricto de auto-shrink: Si la ventana es grande (ratio >= 1.0), el zoom no supera 1.00
        computedScale = ratio >= 1.0 ? Math.min(1.00, maxLimit) : ratio;
      }

      // Restricción matemática estricta [effectiveMin, effectiveMax]
      return Math.max(minLimit, Math.min(maxLimit, computedScale));
    }

    return {
      detectSplitViewContext,
      computeDynamicSplitBounds,
      calculateReferenceBaseWidth,
      computeZoomScaleFactor
    };
  })();

  // ============================================================================
  // 3. SERVICIO DE ESTABILIZACIÓN VISUAL Y RESPONSIVA (VisualStabilizationService)
  // ============================================================================

  /**
   * Módulo especializado de estabilización visual responsiva y compensación de barra de desplazamiento.
   */
  const VisualStabilizationService = (function () {

    /**
     * Genera la hoja de estilos de estabilización visual adaptada al motor del navegador.
     * @param {string} engineName - Nombre del motor del navegador ('gecko' o 'blink').
     * @returns {string} Código CSS optimizado.
     */
    function buildStabilizationCssText(engineName) {
      const engineSpecificRules = engineName === 'gecko' 
        ? `/* Reglas de suavizado de maquetación específicas para Firefox (Gecko) */
           html { layout-smoothing: subpixel-antialiased !important; }`
        : `/* Reglas de suavizado de maquetación específicas para Chromium (Blink) */
           html { -webkit-font-smoothing: antialiased !important; }`;

      return `
        /* Preservación de maquetación fluida y orden de apilamiento */
        html {
          min-height: 100% !important;
          box-sizing: border-box !important;
          overflow-x: hidden !important;
        }

        *, *::before, *::after {
          box-sizing: inherit !important;
        }

        ${engineSpecificRules}

        /* Estabilización de contenedores principales para acoplamiento de ventanas (Windows Snap) y vista dividida */
        body, #app, #root, #__next, main, article, section, header, footer, nav, .container, .wrapper {
          max-width: 100% !important;
        }

        /* Ajuste y alineación de elementos con posición fija o pegajosa para evitar desbordamientos laterales */
        [style*="position: fixed"], [style*="position: sticky"],
        header[class*="header"], nav[class*="nav"], div[class*="top-bar"] {
          max-width: 100% !important;
        }

        /* Contención de elementos anchos como tablas y bloques de código para evitar romper el diseño */
        table, pre, code, iframe, canvas, svg, picture {
          max-width: 100% !important;
          overflow-x: auto !important;
        }

        /* Escalado fluido y adaptativo de medios e imágenes */
        img, video {
          max-width: 100% !important;
          height: auto !important;
          object-fit: contain;
        }
      `;
    }

    /**
     * Inyecta dinámicamente las reglas de estabilización visual en el documento.
     * @param {string} engineName - Nombre del motor del navegador.
     */
    function injectStabilizationStyles(engineName) {
      try {
        if (document.getElementById(VISUAL_STABILIZATION_STYLE_ID)) return;

        const cssContent = buildStabilizationCssText(engineName);

        if (typeof GM_addStyle === 'function') {
          GM_addStyle(cssContent);
        } else {
          const styleElement = document.createElement('style');
          styleElement.id = VISUAL_STABILIZATION_STYLE_ID;
          styleElement.textContent = cssContent;
          const targetParent = document.head || document.documentElement;
          if (targetParent) {
            targetParent.appendChild(styleElement);
          }
        }
      } catch (e) {
        console.warn('[Auto-Shrink] Error inyectando hoja de estabilización visual:', e);
      }
    }

    /**
     * Aplica las variables CSS globales de maquetación y compensación de scrollbar.
     * @param {HTMLElement} rootElement - Elemento html.
     * @param {number} scaleFactor - Factor de zoom activo.
     * @param {number} viewportWidthPx - Ancho del viewport.
     * @param {boolean} isSplitView - Indicador de vista dividida.
     * @param {number} referenceBasePx - Ancho base activo.
     */
    function updateGlobalCssVariables(rootElement, scaleFactor, viewportWidthPx, isSplitView, referenceBasePx) {
      if (!rootElement || !rootElement.style) return;
      try {
        const zoomScaleString = scaleFactor.toFixed(4);
        const inverseScaleString = (1 / scaleFactor).toFixed(4);
        const scrollbarWidthPx = Math.max(0, window.innerWidth - rootElement.clientWidth);
        const viewportHeightPx = window.innerHeight || 1080;
        const aspectRatioString = (viewportWidthPx / viewportHeightPx).toFixed(2);
        const isFullscreen = MediaProtectionService.isDocumentInFullscreenMode();

        rootElement.style.setProperty('--auto-shrink-scale', zoomScaleString);
        rootElement.style.setProperty('--auto-shrink-inv-scale', inverseScaleString);
        rootElement.style.setProperty('--auto-shrink-viewport-width', viewportWidthPx + 'px');
        rootElement.style.setProperty('--auto-shrink-is-split-view', isSplitView ? '1' : '0');
        rootElement.style.setProperty('--auto-shrink-effective-base', referenceBasePx + 'px');
        rootElement.style.setProperty('--auto-shrink-scrollbar-width', scrollbarWidthPx + 'px');
        rootElement.style.setProperty('--auto-shrink-aspect-ratio', aspectRatioString);
        rootElement.style.setProperty('--auto-shrink-is-fullscreen', isFullscreen ? '1' : '0');
        rootElement.style.removeProperty('width');
        rootElement.style.removeProperty('min-height');
      } catch (e) {}
    }

    return {
      injectStabilizationStyles,
      updateGlobalCssVariables
    };
  })();

  // ============================================================================
  // 4. SERVICIO DE PROTECCIÓN DE MEDIOS Y PUNTERO (MediaProtectionService)
  // ============================================================================

  /**
   * Servicio encargado de la compatibilidad por motor del navegador (Gecko vs Blink)
   * y la inyección de reglas CSS para garantizar precisión 1:1 en eventos de puntero.
   */
  const MediaProtectionService = (function () {
    let currentActiveScaleFactor = 1.0;

    function setScaleFactor(scaleFactor) {
      currentActiveScaleFactor = scaleFactor;
    }

    /**
     * Identifica el motor nativo del navegador para aplicar optimizaciones específicas.
     * @returns {string} 'gecko' (Firefox), 'blink' (Chrome/Edge/Brave) o 'generic'.
     */
    function detectNativeBrowserEngine() {
      try {
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('firefox') || userAgent.includes('gecko/')) return 'gecko';
        if (userAgent.includes('chrome') || userAgent.includes('chromium') || userAgent.includes('edg/')) return 'blink';
      } catch (e) {}
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
     * Aplica la estabilización visual y la protección de eventos de puntero.
     */
    function applyProtectionStyles() {
      try {
        const engine = detectNativeBrowserEngine();
        VisualStabilizationService.injectStabilizationStyles(engine);

        if (!ConfigurationService.get('isProtectVideoPlayersEnabled')) return;

        const mediaProtectionCss = `
          /* Precisión absoluta del puntero en controles interactivos, reproductores y deslizadores */
          .html5-video-player,
          .html5-video-player .ytp-progress-bar-container,
          .html5-video-player .ytp-chrome-bottom,
          .vjs-control-bar,
          [class*="video-player"],
          [class*="media-player"],
          [class*="seekbar"],
          [class*="progress-bar"],
          input[type="range"],
          canvas,
          svg {
            pointer-events: auto !important;
            touch-action: manipulation !important;
          }
        `;

        if (typeof GM_addStyle === 'function') {
          GM_addStyle(mediaProtectionCss);
        } else {
          const styleElement = document.createElement('style');
          styleElement.textContent = mediaProtectionCss;
          const targetParent = document.head || document.documentElement;
          if (targetParent) {
            targetParent.appendChild(styleElement);
          }
        }
      } catch (e) {}
    }

    return {
      setScaleFactor,
      detectNativeBrowserEngine,
      isDocumentInFullscreenMode,
      applyProtectionStyles
    };
  })();

  // ============================================================================
  // 5. MOTOR DE EJECUCIÓN DE ZOOM (ZoomExecutionEngine)
  // ============================================================================

  /**
   * Motor de ejecución atómico de zoom con agrupadación de mutaciones (16ms RAF debouncer)
   * y filtro de histéresis anti-vibración.
   */
  const ZoomExecutionEngine = (function () {
    let isAnimationFrameScheduled = false;
    let animationFrameRequestId = null;
    let styleMutationObserver = null;
    let elementResizeObserver = null;
    let isScriptApplyingZoomMutation = false;
    let lastAppliedZoomScaleString = null;
    let lastAppliedScaleValue = 1.0;

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
      } catch (e) {}
      return 0;
    }

    /**
     * Aplica el bloqueo estricto anti-sobrescalado (Anti-Overzoom Lock).
     * @param {number} rawScale - Escala calculada.
     * @param {number} effectiveMin - Límite mínimo efectivo.
     * @param {number} effectiveMax - Límite máximo efectivo.
     * @returns {number} Escala bloqueada dentro de límites.
     */
    function lockScaleBounds(rawScale, effectiveMin, effectiveMax) {
      if (!Number.isFinite(rawScale)) return 1.0;
      return Math.max(effectiveMin, Math.min(effectiveMax, rawScale));
    }

    /**
     * Aplica la escala calculada asignando variables CSS y aplicando zoom nativo con filtro de histéresis.
     */
    function applyViewportZoomScale() {
      if (document.hidden) return;

      try {
        const rootElement = document.documentElement;
        if (!rootElement) return;

        const config = ConfigurationService.getSanitizedConfig();

        // Reiniciar a 100% nativo si está en Pantalla Completa
        if (config.isResetInFullscreenEnabled && MediaProtectionService.isDocumentInFullscreenMode()) {
          MediaProtectionService.setScaleFactor(1.0);
          if (lastAppliedZoomScaleString !== '1.0000') {
            isScriptApplyingZoomMutation = true;
            try {
              VisualStabilizationService.updateGlobalCssVariables(rootElement, 1.0, window.innerWidth || 1920, false, 1920);
              rootElement.style.setProperty('zoom', '1.0', 'important');
              lastAppliedZoomScaleString = '1.0000';
              lastAppliedScaleValue = 1.0;
            } finally {
              isScriptApplyingZoomMutation = false;
            }
          }
          return;
        }

        const currentViewportWidthPx = getValidViewportWidth();
        if (!currentViewportWidthPx) return;

        const monitorWidth = (window.screen && window.screen.width) ? window.screen.width : 1920;
        const splitContext = ViewportMetricsService.detectSplitViewContext(currentViewportWidthPx, monitorWidth);
        const dynamicBounds = ViewportMetricsService.computeDynamicSplitBounds(
          config.minimumZoomScaleLimit,
          config.maximumZoomScaleLimit,
          splitContext.isSplitView
        );

        const referenceBaseWidthPx = ViewportMetricsService.calculateReferenceBaseWidth(currentViewportWidthPx);
        const rawZoomScaleFactor = ViewportMetricsService.computeZoomScaleFactor(currentViewportWidthPx, referenceBaseWidthPx, dynamicBounds);
        
        // Bloqueo Anti-Sobrescalado Estricto
        const lockedZoomScaleFactor = lockScaleBounds(rawZoomScaleFactor, dynamicBounds.effectiveMin, dynamicBounds.effectiveMax);

        // Filtro de Histéresis: Si la diferencia de escala es menor al 0.5%, ignora la mutación para evitar vibración de sub-píxel
        if (lastAppliedZoomScaleString !== null && Math.abs(lockedZoomScaleFactor - lastAppliedScaleValue) < HYSTERESIS_THRESHOLD) {
          return;
        }

        const zoomScaleString = lockedZoomScaleFactor.toFixed(4);

        MediaProtectionService.setScaleFactor(lockedZoomScaleFactor);

        if (lastAppliedZoomScaleString === zoomScaleString && rootElement.style.zoom === zoomScaleString) {
          return;
        }

        isScriptApplyingZoomMutation = true;
        try {
          // Asignar variables CSS de escala e integración dinámica multitarea
          VisualStabilizationService.updateGlobalCssVariables(
            rootElement,
            lockedZoomScaleFactor,
            currentViewportWidthPx,
            splitContext.isSplitView,
            referenceBaseWidthPx
          );

          if (config.isSmoothTransitionEnabled) {
            if (!rootElement.style.transition.includes('zoom')) {
              rootElement.style.transition = 'zoom 0.12s cubic-bezier(0.4, 0, 0.2, 1)';
            }
          } else if (rootElement.style.transition.includes('zoom')) {
            rootElement.style.transition = rootElement.style.transition
              .replace(/zoom\s*[\d\.]+\w*\s*[^,]*,?/g, '')
              .trim();
          }

          rootElement.style.setProperty('zoom', zoomScaleString, 'important');
          lastAppliedZoomScaleString = zoomScaleString;
          lastAppliedScaleValue = lockedZoomScaleFactor;
        } finally {
          isScriptApplyingZoomMutation = false;
        }
      } catch (e) {}
    }

    /**
     * Programa la ejecución del zoom en el siguiente cuadro de animación (requestAnimationFrame).
     */
    function scheduleFrameExecution() {
      if (!isAnimationFrameScheduled) {
        animationFrameRequestId = requestAnimationFrame(() => {
          applyViewportZoomScale();
          isAnimationFrameScheduled = false;
          animationFrameRequestId = null;
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
          if (isScriptApplyingZoomMutation) return;
          for (let i = 0; i < mutations.length; i++) {
            if (mutations[i].attributeName === 'style') {
              scheduleFrameExecution();
              break;
            }
          }
        });

        styleMutationObserver.observe(rootElement, {
          attributes: true,
          attributeFilter: ['style']
        });
      } catch (e) {}
    }

    /**
     * Inicializa ResizeObserver para rastrear cambios en barras laterales de SPAs.
     */
    function initializeResizeObserver() {
      try {
        const rootElement = document.documentElement;
        if (!rootElement || elementResizeObserver || typeof ResizeObserver === 'undefined') return;

        elementResizeObserver = new ResizeObserver(() => {
          scheduleFrameExecution();
        });

        elementResizeObserver.observe(rootElement);
      } catch (e) {}
    }

    /**
     * Limpia observadores y solicitudes de cuadro de animación.
     */
    function destroy() {
      if (styleMutationObserver) {
        styleMutationObserver.disconnect();
        styleMutationObserver = null;
      }
      if (elementResizeObserver) {
        elementResizeObserver.disconnect();
        elementResizeObserver = null;
      }
      if (animationFrameRequestId !== null) {
        cancelAnimationFrame(animationFrameRequestId);
        animationFrameRequestId = null;
      }
    }

    return {
      applyViewportZoomScale,
      scheduleFrameExecution,
      initializeStyleMutationProtectionObserver,
      initializeResizeObserver,
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
          /* Contra-escalado inverso: El modal siempre se renderiza a escala real (100% o mayor) sin sufrir reduccion */
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
        if (typeof GM_addStyle === 'function') {
          GM_addStyle(modalStylesCssText);
        } else {
          const styleElement = document.createElement('style');
          styleElement.textContent = modalStylesCssText;
          const targetParent = document.head || document.documentElement;
          if (targetParent) {
            targetParent.appendChild(styleElement);
          }
        }
      } catch (e) {}
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
        const monitorWidth = (window.screen && window.screen.width) ? window.screen.width : 1920;
        const currentViewportWidthPx = window.innerWidth || monitorWidth;
        const splitContext = ViewportMetricsService.detectSplitViewContext(currentViewportWidthPx, monitorWidth);
        const engine = MediaProtectionService.detectNativeBrowserEngine();

        const overlayElement = document.createElement('div');
        overlayElement.id = CONFIGURATION_MODAL_OVERLAY_ID;

        const isThresholdMode = config.scalingMode === SCALING_MODES.THRESHOLDS;
        const isCustomBase = config.referenceBaseWidthSetting !== 'auto';

        overlayElement.innerHTML = `
          <div class="as-dialog-card">
            <h2>
              <span>⚙️ Configuración Auto-Shrink</span>
              <span style="font-size:12px;color:#64748b;font-weight:normal;">v3.6.0</span>
            </h2>

            <!-- Insignias de Estado en Tiempo Real -->
            <div class="as-status-badge-container">
              <div class="as-status-badge">🌐 Motor: ${engine.toUpperCase()}</div>
              <div class="as-status-badge">📱 Vista Dividida: ${splitContext.isSplitView ? `ACTIVA (${splitContext.splitType.toUpperCase()})` : 'Inactiva (Full)'}</div>
              <div class="as-status-badge">🔒 Límites: ${Math.round(config.minimumZoomScaleLimit * 100)}% - ${Math.round(config.maximumZoomScaleLimit * 100)}%</div>
            </div>

            <!-- SECCIÓN: VISTA DIVIDIDA Y PANTALLA COMPLETA -->
            <div class="as-config-section">
              <div class="as-section-title">Vista Dividida y Precisión del Puntero</div>
              <div class="as-field-group">
                <label class="as-checkbox-label">
                  <input type="checkbox" id="as-checkbox-split-view" ${config.isSplitViewAdaptationEnabled ? 'checked' : ''}>
                  📱 Adaptación Inteligente para Vista Dividida (Firefox / Chrome / Edge / Windows Snap)
                </label>
                <label class="as-checkbox-label">
                  <input type="checkbox" id="as-checkbox-protect-video" ${config.isProtectVideoPlayersEnabled ? 'checked' : ''}>
                  🛡️ Precisión del ratón 1:1 en reproductores, controles y deslizadores
                </label>
                <label class="as-checkbox-label">
                  <input type="checkbox" id="as-checkbox-reset-fullscreen" ${config.isResetInFullscreenEnabled ? 'checked' : ''}>
                  📺 Restaurar zoom al 100% nativo al poner el video en Pantalla Completa
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

            <!-- SECCIÓN: OPCIONES AVANZADAS -->
            <div class="as-config-section">
              <div class="as-field-group">
                <label class="as-checkbox-label">
                  <input type="checkbox" id="as-checkbox-smooth-transition" ${config.isSmoothTransitionEnabled ? 'checked' : ''}>
                  Activar transición suave al cambiar de tamaño
                </label>
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
          MediaProtectionService.applyProtectionStyles();
          ZoomExecutionEngine.applyViewportZoomScale();
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

          const isSmooth = overlayElement.querySelector('#as-checkbox-smooth-transition').checked;
          const isProtect = overlayElement.querySelector('#as-checkbox-protect-video').checked;
          const isFullscreen = overlayElement.querySelector('#as-checkbox-reset-fullscreen').checked;
          const isSplitView = overlayElement.querySelector('#as-checkbox-split-view').checked;

          ConfigurationService.set('scalingMode', modeVal);
          ConfigurationService.set('referenceBaseWidthSetting', baseVal);
          ConfigurationService.set('minimumZoomScaleLimit', minZoom / 100);
          ConfigurationService.set('maximumZoomScaleLimit', maxZoom / 100);
          ConfigurationService.set('thresholdZoomLevelUnder80Percent', s80);
          ConfigurationService.set('thresholdZoomLevelUnder60Percent', s60);
          ConfigurationService.set('thresholdZoomLevelUnder40Percent', s40);
          ConfigurationService.set('thresholdZoomLevelUnder20Percent', s20);
          ConfigurationService.set('isSmoothTransitionEnabled', isSmooth);
          ConfigurationService.set('isProtectVideoPlayersEnabled', isProtect);
          ConfigurationService.set('isResetInFullscreenEnabled', isFullscreen);
          ConfigurationService.set('isSplitViewAdaptationEnabled', isSplitView);

          MediaProtectionService.applyProtectionStyles();
          ZoomExecutionEngine.applyViewportZoomScale();
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
          GM_registerMenuCommand('⚙️ Configurar Auto-Shrink v3.6', renderModal);
          GM_registerMenuCommand('🔄 Restablecer Valores', () => {
            ConfigurationService.resetAll();
            MediaProtectionService.applyProtectionStyles();
            ZoomExecutionEngine.applyViewportZoomScale();
          });
          GM_registerMenuCommand('🌐 Ver Repositorio en GitHub', () => {
            window.open('https://github.com/Baalgarthem/auto-shrink', '_blank');
          });
        }
      } catch (e) {}
    }

    return {
      renderModal,
      registerMenuCommands
    };
  })();

  // ============================================================================
  // 7. CICLO DE VIDA GLOBAL Y ENGANCHES MULTIETAPA
  // ============================================================================

  function initializeEngine() {
    try {
      MediaProtectionService.applyProtectionStyles();
    } catch (e) {}

    try {
      ZoomExecutionEngine.applyViewportZoomScale();
    } catch (e) {}

    try {
      ZoomExecutionEngine.initializeStyleMutationProtectionObserver();
    } catch (e) {}

    try {
      ZoomExecutionEngine.initializeResizeObserver();
    } catch (e) {}

    try {
      UserInterfaceController.registerMenuCommands();
    } catch (e) {}
  }

  function destroyEngineLifecycle() {
    try {
      ZoomExecutionEngine.destroy();
      window.removeEventListener('resize', ZoomExecutionEngine.scheduleFrameExecution);
      document.removeEventListener('fullscreenchange', ZoomExecutionEngine.applyViewportZoomScale);
      document.removeEventListener('webkitfullscreenchange', ZoomExecutionEngine.applyViewportZoomScale);
      document.removeEventListener('mozfullscreenchange', ZoomExecutionEngine.applyViewportZoomScale);
    } catch (e) {}
  }

  // Enganches multietapa para asegurar el inicio en cualquier tipo de pagina web
  if (document.documentElement) {
    initializeEngine();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEngine, { once: true });
  } else {
    initializeEngine();
  }

  window.addEventListener('load', initializeEngine, { once: true });

  // Temporizadores de respaldo (failsafes) para sitios de carga diferida (SPAs)
  setTimeout(initializeEngine, 50);
  setTimeout(initializeEngine, 300);
  setTimeout(initializeEngine, 1000);

  window.addEventListener('resize', ZoomExecutionEngine.scheduleFrameExecution, { passive: true });
  if (window.screen && window.screen.orientation) {
    window.screen.orientation.addEventListener('change', ZoomExecutionEngine.scheduleFrameExecution, { passive: true });
  }
  window.addEventListener('orientationchange', ZoomExecutionEngine.scheduleFrameExecution, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) ZoomExecutionEngine.applyViewportZoomScale();
  }, { passive: true });

  document.addEventListener('fullscreenchange', ZoomExecutionEngine.applyViewportZoomScale, { passive: true });
  document.addEventListener('webkitfullscreenchange', ZoomExecutionEngine.applyViewportZoomScale, { passive: true });
  document.addEventListener('mozfullscreenchange', ZoomExecutionEngine.applyViewportZoomScale, { passive: true });

  window.addEventListener('pagehide', destroyEngineLifecycle, { once: true });
  window.addEventListener('beforeunload', destroyEngineLifecycle, { once: true });
})();
