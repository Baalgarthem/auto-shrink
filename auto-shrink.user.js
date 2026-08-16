// ==UserScript==
// @name         Auto-Shrink
// @namespace    https://github.com/Baalgarthem/auto-shrink
// @icon         https://github.com/Baalgarthem/auto-shrink/raw/refs/heads/principal/media/main_icon.ico
// @version      5.0.0
// @description  Ajusta automáticamente el zoom de cada página al ancho disponible para evitar correcciones manuales al redimensionar o usar vista dividida.
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
// @run-at       document-start
// ==/UserScript==

/**
 * Auto-Shrink Userscript v5.0.0 - Escalado automático estable y no invasivo
 * ------------------------------------------------------------------------------------------
 * Estructura dividida en 6 servicios modulares especializados:
 * 1. ConfigurationService: Configuración saneada y sincronización real entre pestañas.
 * 2. ViewportMetricsService: Medición del viewport y cálculo proporcional de la escala.
 * 3. VisualStabilizationService: Variables CSS informativas sin alterar estilos ajenos.
 * 4. MediaProtectionService: Detección del motor y del estado de pantalla completa.
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
    isResetInFullscreenEnabled: true,
    isSplitViewAdaptationEnabled: true
  });

  const CONFIGURATION_MODAL_OVERLAY_ID = 'auto-shrink-configuration-modal-overlay-v2';
  const VISUAL_STABILIZATION_STYLE_ID = 'auto-shrink-visual-stabilization-styles-v5';
  const MODAL_STYLE_ID = 'auto-shrink-modal-styles-v5';
  const HYSTERESIS_THRESHOLD = 0.0025;

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
        for (const key of Object.keys(DEFAULT_CONFIGURATION)) {
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

      sanitizedSnapshotCache = Object.freeze({
        scalingMode: get('scalingMode') === SCALING_MODES.THRESHOLDS ? SCALING_MODES.THRESHOLDS : SCALING_MODES.CONTINUOUS,
        referenceBaseWidthSetting: sanitizeReferenceBaseWidth(get('referenceBaseWidthSetting')),
        minimumZoomScaleLimit: minLimit,
        maximumZoomScaleLimit: maxLimit,
        thresholdZoomLevelUnder80Percent: sanitizeNumeric(get('thresholdZoomLevelUnder80Percent'), 0.85, minLimit, maxLimit),
        thresholdZoomLevelUnder60Percent: sanitizeNumeric(get('thresholdZoomLevelUnder60Percent'), 0.70, minLimit, maxLimit),
        thresholdZoomLevelUnder40Percent: sanitizeNumeric(get('thresholdZoomLevelUnder40Percent'), 0.55, minLimit, maxLimit),
        thresholdZoomLevelUnder20Percent: sanitizeNumeric(get('thresholdZoomLevelUnder20Percent'), 0.35, minLimit, maxLimit),
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
        activeCache[key] = value;
        sanitizedSnapshotCache = null; // Invalidar instantánea
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

    function sanitizeReferenceBaseWidth(value) {
      if (value === 'auto') return 'auto';
      const parsed = parseInt(value, 10);
      return Number.isFinite(parsed) ? Math.max(320, Math.min(10000, parsed)) : 'auto';
    }

    function initializeSynchronization() {
      loadAll();
      if (typeof GM_addValueChangeListener !== 'function') return;

      for (const key of Object.keys(DEFAULT_CONFIGURATION)) {
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
      get,
      getSanitizedConfig,
      set,
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

    function calculateReferenceBaseWidth(currentViewportWidthPx) {
      try {
        const setting = ConfigurationService.getSanitizedConfig().referenceBaseWidthSetting;
        if (typeof setting === 'number' && setting > 0) return setting;
        if (typeof setting === 'string' && setting !== 'auto') {
          const parsed = parseInt(setting, 10);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }

        const screenWidth = getScreenWidth();
        return screenWidth > 0 ? Math.max(currentViewportWidthPx || 0, screenWidth) : (currentViewportWidthPx || 1920);
      } catch (e) {
        return 1920;
      }
    }

    /**
     * Computa el factor de escala aplicando el modo activo y respetando límites efectivos.
     * @param {number} currentViewportWidthPx - Ancho actual del viewport.
     * @param {number} referenceBaseWidthPx - Ancho base de referencia.
     * @param {number} effectiveMin - Límite mínimo efectivo.
     * @param {number} effectiveMax - Límite máximo efectivo.
     * @returns {number} Factor de zoom restringido dentro de límites.
     */
    function computeZoomScaleFactor(currentViewportWidthPx, referenceBaseWidthPx, effectiveMin, effectiveMax) {
      const config = ConfigurationService.getSanitizedConfig();
      const ratio = currentViewportWidthPx / referenceBaseWidthPx;

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
          computedScale = effectiveMax;
        }
      } else {
        computedScale = ratio >= 1.0 ? Math.min(1.00, effectiveMax) : ratio;
      }

      return Math.max(effectiveMin, Math.min(effectiveMax, computedScale));
    }

    return {
      isPinchZoomActive,
      getScreenWidth,
      calculateReferenceBaseWidth,
      computeZoomScaleFactor
    };
  })();

  // ============================================================================
  // 3. SERVICIO DE ESTABILIZACIÓN VISUAL Y RESPONSIVA (VisualStabilizationService)
  // ============================================================================

  /**
   * Publica métricas de Auto-Shrink como variables CSS sin imponer reglas a la página.
   */
  const VisualStabilizationService = (function () {

    /**
     * Genera la hoja de estilos de estabilización visual adaptada al motor del navegador.
     * @param {string} engineName - Nombre del motor del navegador ('gecko' o 'blink').
     * @returns {string} Código CSS optimizado.
     */
    function buildStabilizationCssText() {
      return `
        /* Solamente propiedades propias: no se altera la maquetación de la página. */
        :root {
          --auto-shrink-scale: 1;
          --auto-shrink-inv-scale: 1;
          --auto-shrink-viewport-width: 100vw;
        }
      `;
    }

    /**
     * Inyecta dinámicamente las reglas de estabilización visual en el documento.
     * @param {string} engineName - Nombre del motor del navegador.
     */
    function injectStabilizationStyles() {
      try {
        if (document.getElementById(VISUAL_STABILIZATION_STYLE_ID)) return;
        const styleElement = document.createElement('style');
        styleElement.id = VISUAL_STABILIZATION_STYLE_ID;
        styleElement.textContent = buildStabilizationCssText();
        const targetParent = document.head || document.documentElement;
        if (targetParent) targetParent.appendChild(styleElement);
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
        const viewportHeightPx = window.innerHeight || 1080;
        const aspectRatioString = (viewportWidthPx / viewportHeightPx).toFixed(2);
        const isFullscreen = MediaProtectionService.isDocumentInFullscreenMode();

        rootElement.style.setProperty('--auto-shrink-scale', zoomScaleString);
        rootElement.style.setProperty('--auto-shrink-inv-scale', inverseScaleString);
        rootElement.style.setProperty('--auto-shrink-viewport-width', viewportWidthPx + 'px');
        rootElement.style.setProperty('--auto-shrink-is-split-view', isSplitView ? '1' : '0');
        rootElement.style.setProperty('--auto-shrink-effective-base', referenceBasePx + 'px');
        rootElement.style.setProperty('--auto-shrink-aspect-ratio', aspectRatioString);
        rootElement.style.setProperty('--auto-shrink-is-fullscreen', isFullscreen ? '1' : '0');
      } catch (e) { }
    }

    return {
      injectStabilizationStyles,
      updateGlobalCssVariables
    };
  })();

  // ============================================================================
  // 4. SERVICIO DE ENTORNO Y PANTALLA COMPLETA (MediaProtectionService)
  // ============================================================================

  /**
   * Servicio encargado de detectar el motor del navegador y la pantalla completa.
   */
  const MediaProtectionService = (function () {
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
    function applyProtectionStyles() {
      try {
        VisualStabilizationService.injectStabilizationStyles();
      } catch (e) { }
    }

    return {
      detectNativeBrowserEngine,
      isDocumentInFullscreenMode,
      applyProtectionStyles
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
    let isScriptApplyingZoomMutation = false;
    let lastAppliedZoomScaleString = null;
    let lastAppliedScaleValue = 1.0;
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

        if (config.isResetInFullscreenEnabled && MediaProtectionService.isDocumentInFullscreenMode()) {
          if (forceApplication || lastAppliedZoomScaleString !== '1.0000' || parseFloat(rootElement.style.zoom) !== 1) {
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

        const monitorWidth = ViewportMetricsService.getScreenWidth() || currentViewportWidthPx;
        const viewportToScreenRatio = currentViewportWidthPx / monitorWidth;
        const isSplitView = viewportToScreenRatio < 0.90;
        const effectiveMin = config.minimumZoomScaleLimit;
        const effectiveMax = config.maximumZoomScaleLimit;
        const automaticReferenceWidth = ViewportMetricsService.calculateReferenceBaseWidth(currentViewportWidthPx);
        const referenceBaseWidthPx = (!config.isSplitViewAdaptationEnabled && isSplitView && config.referenceBaseWidthSetting === 'auto')
          ? currentViewportWidthPx
          : automaticReferenceWidth;
        const lockedZoomScaleFactor = ViewportMetricsService.computeZoomScaleFactor(currentViewportWidthPx, referenceBaseWidthPx, effectiveMin, effectiveMax);
        const zoomScaleString = lockedZoomScaleFactor.toFixed(4);
        const currentInlineZoom = parseFloat(rootElement.style.zoom);
        const zoomWasOverwritten = !Number.isFinite(currentInlineZoom) || Math.abs(currentInlineZoom - lockedZoomScaleFactor) >= HYSTERESIS_THRESHOLD;

        if (!forceApplication && !zoomWasOverwritten && lastAppliedZoomScaleString !== null && Math.abs(lockedZoomScaleFactor - lastAppliedScaleValue) < HYSTERESIS_THRESHOLD) {
          return;
        }

        if (!forceApplication && lastAppliedZoomScaleString === zoomScaleString && !zoomWasOverwritten) {
          return;
        }

        isScriptApplyingZoomMutation = true;
        try {
          VisualStabilizationService.updateGlobalCssVariables(
            rootElement,
            lockedZoomScaleFactor,
            currentViewportWidthPx,
            isSplitView,
            referenceBaseWidthPx
          );

          rootElement.style.setProperty('zoom', zoomScaleString, 'important');
          lastAppliedZoomScaleString = zoomScaleString;
          lastAppliedScaleValue = lockedZoomScaleFactor;
        } finally {
          isScriptApplyingZoomMutation = false;
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
          if (isScriptApplyingZoomMutation) return;
          for (let i = 0; i < mutations.length; i++) {
            if (mutations[i].attributeName === 'style') {
              const currentZoom = parseFloat(rootElement.style.zoom);
              if (lastAppliedZoomScaleString !== null && (!Number.isFinite(currentZoom) || Math.abs(currentZoom - lastAppliedScaleValue) >= HYSTERESIS_THRESHOLD)) {
                scheduleFrameExecution(true);
              }
              break;
            }
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
      const rootElement = document.documentElement;
      if (rootElement && lastAppliedZoomScaleString !== null) {
        if (originalInlineZoom === '') rootElement.style.removeProperty('zoom');
        else rootElement.style.setProperty('zoom', originalInlineZoom, originalInlineZoomPriority);
        for (const propertyName of Array.from(rootElement.style)) {
          if (propertyName.startsWith('--auto-shrink-')) rootElement.style.removeProperty(propertyName);
        }
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
        const monitorWidth = (window.screen && window.screen.width) ? window.screen.width : 1920;
        const currentViewportWidthPx = window.innerWidth || monitorWidth;
        const isSplitView = config.isSplitViewAdaptationEnabled && (currentViewportWidthPx / monitorWidth) <= 0.78;
        const engine = MediaProtectionService.detectNativeBrowserEngine();

        const overlayElement = document.createElement('div');
        overlayElement.id = CONFIGURATION_MODAL_OVERLAY_ID;

        const isThresholdMode = config.scalingMode === SCALING_MODES.THRESHOLDS;
        const isCustomBase = config.referenceBaseWidthSetting !== 'auto';

        overlayElement.innerHTML = `
          <div class="as-dialog-card">
            <h2>
              <span>⚙️ Configuración Auto-Shrink</span>
              <span style="font-size:12px;color:#64748b;font-weight:normal;">v5.0.0</span>
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
          GM_registerMenuCommand('⚙️ Configurar Auto-Shrink v5.0', renderModal);
          GM_registerMenuCommand('🔄 Restablecer Valores', () => {
            ConfigurationService.resetAll();
            MediaProtectionService.applyProtectionStyles();
            ZoomExecutionEngine.applyViewportZoomScale();
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
    try {
      MediaProtectionService.applyProtectionStyles();
    } catch (e) { }

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
      ConfigurationService.destroy();
      window.removeEventListener('resize', ZoomExecutionEngine.scheduleFrameExecution);
      window.removeEventListener('orientationchange', ZoomExecutionEngine.scheduleFrameExecution);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', ZoomExecutionEngine.applyViewportZoomScale);
      document.removeEventListener('webkitfullscreenchange', ZoomExecutionEngine.applyViewportZoomScale);
      document.removeEventListener('mozfullscreenchange', ZoomExecutionEngine.applyViewportZoomScale);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', ZoomExecutionEngine.scheduleFrameExecution);
      if (window.screen && window.screen.orientation) {
        window.screen.orientation.removeEventListener('change', ZoomExecutionEngine.scheduleFrameExecution);
      }
    } catch (e) { }
  }

  function handleVisibilityChange() {
    if (!document.hidden) ZoomExecutionEngine.scheduleFrameExecution(true);
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

  window.addEventListener('resize', ZoomExecutionEngine.scheduleFrameExecution, { passive: true });
  window.addEventListener('pageshow', handlePageShow, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', ZoomExecutionEngine.scheduleFrameExecution, { passive: true });
  }
  if (window.screen && window.screen.orientation) {
    window.screen.orientation.addEventListener('change', ZoomExecutionEngine.scheduleFrameExecution, { passive: true });
  }
  window.addEventListener('orientationchange', ZoomExecutionEngine.scheduleFrameExecution, { passive: true });

  document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });

  document.addEventListener('fullscreenchange', ZoomExecutionEngine.applyViewportZoomScale, { passive: true });
  document.addEventListener('webkitfullscreenchange', ZoomExecutionEngine.applyViewportZoomScale, { passive: true });
  document.addEventListener('mozfullscreenchange', ZoomExecutionEngine.applyViewportZoomScale, { passive: true });

  window.addEventListener('pagehide', handlePageHide, { once: true });
  window.addEventListener('beforeunload', destroyEngineLifecycle, { once: true });
})();
