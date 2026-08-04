// ==UserScript==
// @name         Auto-Shrink
// @namespace    https://github.com/Baalgarthem/auto-shrink
// @version      2.7.0
// @description  Reducción dinámica del tamaño de página por proporción o umbrales con emulación exacta de zoom nativo del navegador, modal de configuración expandido de lectura clara, parches de precisión multielemento y actualización automática desde GitHub.
// @author       Baalgarthem
// @match        *://*/*
// @noframes
// @updateURL    https://raw.githubusercontent.com/Baalgarthem/auto-shrink/main/auto-shrink.user.js
// @downloadURL  https://raw.githubusercontent.com/Baalgarthem/auto-shrink/main/auto-shrink.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

/**
 * Auto-Shrink Userscript v2.7.0
 * ----------------------------------------------------------------------------
 * Arquitectura modular dividida en servicios independientes (ConfigurationService,
 * ViewportMetricsService, MediaProtectionService, ZoomExecutionEngine, UserInterfaceController).
 * Diseñado para emular de forma exacta el comportamiento del zoom nativo del navegador (como el 60% nativo de Firefox),
 * eliminando por completo espacios en blanco laterales e inferiores y garantizando la ejecucion continua en el 100% de los sitios web.
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
    isResetInFullscreenEnabled: true
  });

  const CONFIGURATION_MODAL_OVERLAY_ID = 'auto-shrink-configuration-modal-overlay-v2';
  const MEDIA_PROTECTION_STYLE_ID = 'auto-shrink-media-protection-styles';

  // ============================================================================
  // SERVICIO DE CONFIGURACIÓN Y SANEAMIENTO (ConfigurationService)
  // ============================================================================

  /**
   * Servicio encargado de administrar el almacenamiento, caché en memoria y saneamiento
   * de los parámetros de configuración del script.
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
          if (storedValue !== undefined) {
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
      set,
      resetAll,
      sanitizeNumeric
    };
  })();

  // ============================================================================
  // SERVICIO DE MÉTRICAS DEL VIEWPORT (ViewportMetricsService)
  // ============================================================================

  /**
   * Servicio encargado de calcular el ancho base de referencia y los factores de escala.
   */
  const ViewportMetricsService = (function () {
    /**
     * Calcula el ancho base de la pantalla en píxeles.
     * @returns {number} Ancho en píxeles.
     */
    function calculateReferenceBaseWidth() {
      try {
        const setting = ConfigurationService.get('referenceBaseWidthSetting');
        if (typeof setting === 'number' && setting > 0) return setting;
        if (typeof setting === 'string' && setting !== 'auto') {
          const parsed = parseInt(setting, 10);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
        return (window.screen && window.screen.width) ? window.screen.width : 1920;
      } catch (e) {
        return 1920;
      }
    }

    /**
     * Computa el factor de escala según el modo activo (continuo o por umbrales).
     * @param {number} currentViewportWidthPx - Ancho actual del viewport.
     * @param {number} referenceBaseWidthPx - Ancho base de referencia.
     * @returns {number} Factor de zoom entre el mínimo y máximo permitido.
     */
    function computeZoomScaleFactor(currentViewportWidthPx, referenceBaseWidthPx) {
      const minLimit = parseFloat(ConfigurationService.get('minimumZoomScaleLimit'));
      const maxLimit = parseFloat(ConfigurationService.get('maximumZoomScaleLimit'));
      const ratio = currentViewportWidthPx / referenceBaseWidthPx;

      let computedScale = 1.0;

      if (ConfigurationService.get('scalingMode') === SCALING_MODES.THRESHOLDS) {
        if (ratio < 0.20) {
          computedScale = parseFloat(ConfigurationService.get('thresholdZoomLevelUnder20Percent'));
        } else if (ratio < 0.40) {
          computedScale = parseFloat(ConfigurationService.get('thresholdZoomLevelUnder40Percent'));
        } else if (ratio < 0.60) {
          computedScale = parseFloat(ConfigurationService.get('thresholdZoomLevelUnder60Percent'));
        } else if (ratio < 0.80) {
          computedScale = parseFloat(ConfigurationService.get('thresholdZoomLevelUnder80Percent'));
        } else {
          computedScale = maxLimit;
        }
      } else {
        computedScale = ratio;
      }

      return Math.max(minLimit, Math.min(maxLimit, computedScale));
    }

    return {
      calculateReferenceBaseWidth,
      computeZoomScaleFactor
    };
  })();

  // ============================================================================
  // SERVICIO DE PROTECCIÓN DE MEDIOS Y COORDENADAS (MediaProtectionService)
  // ============================================================================

  /**
   * Servicio encargado de la intercepción de eventos de ratón para corregir coordenadas
   * en reproductores de video y controles deslizantes, e inyectar reglas de maquetación.
   */
  const MediaProtectionService = (function () {
    let currentActiveScaleFactor = 1.0;
    let isMousePatchInitialized = false;

    function setScaleFactor(scaleFactor) {
      currentActiveScaleFactor = scaleFactor;
    }

    /**
     * Determina si un elemento pertenece a un reproductor de video, barra de progreso, lienzo o control interactivo.
     * @param {Element} element - Elemento a evaluar.
     * @returns {boolean} True si requiere parche de coordenadas.
     */
    function isInteractiveOrMediaTarget(element) {
      if (!element || !(element instanceof Element)) return false;
      try {
        if (element.closest('video, audio, canvas, svg, input[type="range"], [role="progressbar"], [role="slider"], [role="scrollbar"], [draggable="true"]')) {
          return true;
        }
        const selector = [
          '[class*="player"]',
          '[class*="video"]',
          '[class*="media"]',
          '[class*="progress"]',
          '[class*="seekbar"]',
          '[class*="scrubber"]',
          '[class*="timeline"]',
          '[class*="slider"]',
          '[class*="range"]',
          '[class*="control"]',
          '[id*="player"]',
          '[id*="video"]',
          '[id*="progress"]',
          '[id*="seekbar"]',
          '[id*="slider"]'
        ].join(',');
        return !!element.closest(selector);
      } catch (e) {
        return false;
      }
    }

    /**
     * Intercepta descriptores de acceso clientX/Y, pageX/Y y offsetX/Y en MouseEvent y PointerEvent.
     */
    function patchMouseCoordinatesInWindow() {
      if (isMousePatchInitialized) return;
      isMousePatchInitialized = true;

      try {
        const targetWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        if (!targetWindow) return;

        const mouseProto = targetWindow.MouseEvent && targetWindow.MouseEvent.prototype;
        const pointerProto = targetWindow.PointerEvent && targetWindow.PointerEvent.prototype;

        const prototypesToPatch = [mouseProto, pointerProto].filter(Boolean);

        prototypesToPatch.forEach((proto) => {
          ['clientX', 'clientY', 'pageX', 'pageY', 'offsetX', 'offsetY'].forEach((propertyName) => {
            try {
              const originalDescriptor = Object.getOwnPropertyDescriptor(proto, propertyName);
              if (!originalDescriptor || originalDescriptor.__autoShrinkPatched) return;

              const originalGetter = originalDescriptor.get;
              if (typeof originalGetter !== 'function') return;

              const newDescriptor = {
                get: function () {
                  const rawCoordinateValue = originalGetter.call(this);
                  if (
                    !ConfigurationService.get('isProtectVideoPlayersEnabled') ||
                    !currentActiveScaleFactor ||
                    currentActiveScaleFactor === 1.0
                  ) {
                    return rawCoordinateValue;
                  }
                  if (isInteractiveOrMediaTarget(this.target)) {
                    return rawCoordinateValue / currentActiveScaleFactor;
                  }
                  return rawCoordinateValue;
                },
                configurable: true,
                enumerable: true
              };
              newDescriptor.__autoShrinkPatched = true;

              Object.defineProperty(proto, propertyName, newDescriptor);
            } catch (propError) {}
          });
        });
      } catch (e) {
        console.warn('[Auto-Shrink] Error parcheando coordenadas de ratón:', e);
      }
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
     * Aplica las reglas CSS de maquetación de zoom nativo y compatibilidad.
     */
    function applyProtectionStyles() {
      patchMouseCoordinatesInWindow();
      try {
        if (!ConfigurationService.get('isProtectVideoPlayersEnabled')) {
          const styleNode = document.getElementById(MEDIA_PROTECTION_STYLE_ID);
          if (styleNode) styleNode.remove();
          return;
        }

        if (document.getElementById(MEDIA_PROTECTION_STYLE_ID)) return;

        const mediaProtectionCss = `
          /* Emulacion de Zoom Nativo: Ancho y alto extendido para eliminar espacios en blanco */
          html {
            width: calc(100% / var(--auto-shrink-scale, 1)) !important;
            min-height: calc(100vh / var(--auto-shrink-scale, 1)) !important;
            box-sizing: border-box !important;
          }
          
          /* Corrección de precisión de puntero en controles interactivos y reproductores */
          .html5-video-player .ytp-progress-bar-container,
          .html5-video-player .ytp-chrome-bottom,
          .vjs-control-bar,
          [class*="video-player"] [class*="progress"],
          [class*="video-player"] [class*="control"],
          [class*="media-player"] [class*="progress"],
          [class*="seekbar"],
          input[type="range"] {
            pointer-events: auto !important;
            transform-origin: bottom left !important;
          }
        `;

        if (typeof GM_addStyle === 'function') {
          GM_addStyle(mediaProtectionCss);
        } else {
          const styleElement = document.createElement('style');
          styleElement.id = MEDIA_PROTECTION_STYLE_ID;
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
      isDocumentInFullscreenMode,
      applyProtectionStyles
    };
  })();

  // ============================================================================
  // MOTOR DE EJECUCIÓN DE ZOOM (ZoomExecutionEngine)
  // ============================================================================

  /**
   * Motor de ejecución atómico de zoom. Aplica las transformaciones en el DOM
   * y gestiona la sincronización de observadores de mutación y tamaño.
   */
  const ZoomExecutionEngine = (function () {
    let isAnimationFrameScheduled = false;
    let animationFrameRequestId = null;
    let styleMutationObserver = null;
    let elementResizeObserver = null;
    let isScriptApplyingZoomMutation = false;
    let lastAppliedZoomScaleString = null;

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
     * Aplica la escala de zoom calculada en el documento HTML.
     */
    function applyViewportZoomScale() {
      if (document.hidden) return;

      try {
        const rootElement = document.documentElement;
        if (!rootElement) return;

        // Reiniciar a 100% nativo si está en Pantalla Completa
        if (ConfigurationService.get('isResetInFullscreenEnabled') && MediaProtectionService.isDocumentInFullscreenMode()) {
          MediaProtectionService.setScaleFactor(1.0);
          if (lastAppliedZoomScaleString !== '1.0000') {
            isScriptApplyingZoomMutation = true;
            try {
              rootElement.style.setProperty('--auto-shrink-scale', '1');
              rootElement.style.setProperty('--auto-shrink-inv-scale', '1');
              rootElement.style.removeProperty('width');
              rootElement.style.removeProperty('min-height');
              rootElement.style.setProperty('zoom', '1.0', 'important');
              lastAppliedZoomScaleString = '1.0000';
            } finally {
              isScriptApplyingZoomMutation = false;
            }
          }
          return;
        }

        const currentViewportWidthPx = getValidViewportWidth();
        if (!currentViewportWidthPx) return;

        const referenceBaseWidthPx = ViewportMetricsService.calculateReferenceBaseWidth();
        if (!referenceBaseWidthPx) return;

        const zoomScaleFactor = ViewportMetricsService.computeZoomScaleFactor(currentViewportWidthPx, referenceBaseWidthPx);
        const zoomScaleString = zoomScaleFactor.toFixed(4);
        const inverseScaleString = (1 / zoomScaleFactor).toFixed(4);

        // Calcular dimensiones de maquetacion para emular zoom nativo sin espacios blancos
        const layoutWidthPercentString = (100 / zoomScaleFactor).toFixed(4) + '%';
        const layoutMinHeightVhString = (100 / zoomScaleFactor).toFixed(4) + 'vh';

        MediaProtectionService.setScaleFactor(zoomScaleFactor);

        if (lastAppliedZoomScaleString === zoomScaleString && rootElement.style.zoom === zoomScaleString) {
          return;
        }

        isScriptApplyingZoomMutation = true;
        try {
          // Asignar variables CSS de escala e instruir al navegador a expandir el viewport de maquetacion
          rootElement.style.setProperty('--auto-shrink-scale', zoomScaleString);
          rootElement.style.setProperty('--auto-shrink-inv-scale', inverseScaleString);
          rootElement.style.setProperty('width', layoutWidthPercentString, 'important');
          rootElement.style.setProperty('min-height', layoutMinHeightVhString, 'important');

          if (ConfigurationService.get('isSmoothTransitionEnabled')) {
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
     * Inicializa el observador de mutaciones de estilo para prevenir sobreescrituras.
     */
    function initializeStyleMutationProtectionObserver() {
      try {
        const rootElement = document.documentElement;
        if (!rootElement || styleMutationObserver) return;

        styleMutationObserver = new MutationObserver((mutations) => {
          if (isScriptApplyingZoomMutation) return;
          for (let i = 0; i < mutations.length; i++) {
            if (mutations[i].attributeName === 'style') {
              applyViewportZoomScale();
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
  // CONTROLADOR DE INTERFAZ DE USUARIO (UserInterfaceController)
  // ============================================================================

  /**
   * Controlador de la ventana modal de configuración.
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
          width: 520px !important;
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

    function renderModal() {
      try {
        if (document.getElementById(CONFIGURATION_MODAL_OVERLAY_ID)) return;

        injectModalStyles();

        const overlayElement = document.createElement('div');
        overlayElement.id = CONFIGURATION_MODAL_OVERLAY_ID;

        const isThresholdMode = ConfigurationService.get('scalingMode') === SCALING_MODES.THRESHOLDS;
        const isCustomBase = ConfigurationService.get('referenceBaseWidthSetting') !== 'auto';

        overlayElement.innerHTML = `
          <div class="as-dialog-card">
            <h2>
              <span>⚙️ Configuración Auto-Shrink</span>
              <span style="font-size:12px;color:#64748b;font-weight:normal;">v2.7.0</span>
            </h2>

            <!-- SECCIÓN: REPRODUCTORES DE VIDEO Y PANTALLA COMPLETA -->
            <div class="as-config-section">
              <div class="as-section-title">Compatibilidad de Video y Cursor</div>
              <div class="as-field-group">
                <label class="as-checkbox-label">
                  <input type="checkbox" id="as-checkbox-protect-video" ${ConfigurationService.get('isProtectVideoPlayersEnabled') ? 'checked' : ''}>
                  🛡️ Corregir precisión del ratón en reproductores, controles y deslizadores
                </label>
                <label class="as-checkbox-label">
                  <input type="checkbox" id="as-checkbox-reset-fullscreen" ${ConfigurationService.get('isResetInFullscreenEnabled') ? 'checked' : ''}>
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
                <input type="number" id="as-input-custom-width" value="${isCustomBase ? ConfigurationService.get('referenceBaseWidthSetting') : 1920}" min="800" max="7680">
              </div>
            </div>

            <!-- SECCIÓN: UMBRALES (BREAKPOINTS) -->
            <div class="as-config-section" id="as-section-thresholds-container" style="display: ${isThresholdMode ? 'block' : 'none'};">
              <div class="as-section-title">Niveles de Zoom por Tamaño de Ventana</div>
              <div class="as-grid-two-columns">
                <div class="as-field-group">
                  <label for="as-input-threshold-80">Ventana &lt; 80%:</label>
                  <input type="number" id="as-input-threshold-80" value="${Math.round(ConfigurationService.get('thresholdZoomLevelUnder80Percent') * 100)}" min="10" max="150">
                </div>
                <div class="as-field-group">
                  <label for="as-input-threshold-60">Ventana &lt; 60%:</label>
                  <input type="number" id="as-input-threshold-60" value="${Math.round(ConfigurationService.get('thresholdZoomLevelUnder60Percent') * 100)}" min="10" max="150">
                </div>
                <div class="as-field-group">
                  <label for="as-input-threshold-40">Ventana &lt; 40%:</label>
                  <input type="number" id="as-input-threshold-40" value="${Math.round(ConfigurationService.get('thresholdZoomLevelUnder40Percent') * 100)}" min="10" max="150">
                </div>
                <div class="as-field-group">
                  <label for="as-input-threshold-20">Ventana &lt; 20%:</label>
                  <input type="number" id="as-input-threshold-20" value="${Math.round(ConfigurationService.get('thresholdZoomLevelUnder20Percent') * 100)}" min="10" max="150">
                </div>
              </div>
            </div>

            <!-- SECCIÓN: LÍMITES GLOBALES -->
            <div class="as-config-section">
              <div class="as-section-title">Límites de Zoom Absolutos</div>
              <div class="as-grid-two-columns">
                <div class="as-field-group">
                  <label for="as-input-minimum-zoom">Zoom Mínimo (%):</label>
                  <input type="number" id="as-input-minimum-zoom" value="${Math.round(ConfigurationService.get('minimumZoomScaleLimit') * 100)}" min="10" max="100">
                </div>
                <div class="as-field-group">
                  <label for="as-input-maximum-zoom">Zoom Máximo (%):</label>
                  <input type="number" id="as-input-maximum-zoom" value="${Math.round(ConfigurationService.get('maximumZoomScaleLimit') * 100)}" min="50" max="200">
                </div>
              </div>
            </div>

            <!-- SECCIÓN: OPCIONES AVANZADAS -->
            <div class="as-config-section">
              <div class="as-field-group">
                <label class="as-checkbox-label">
                  <input type="checkbox" id="as-checkbox-smooth-transition" ${ConfigurationService.get('isSmoothTransitionEnabled') ? 'checked' : ''}>
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
          GM_registerMenuCommand('⚙️ Configurar Auto-Shrink v2.7', renderModal);
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
  // CICLO DE VIDA GLOBAL Y EVENTOS DE INICIALIZACIÓN MULTIETAPA
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
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) ZoomExecutionEngine.applyViewportZoomScale();
  }, { passive: true });

  document.addEventListener('fullscreenchange', ZoomExecutionEngine.applyViewportZoomScale, { passive: true });
  document.addEventListener('webkitfullscreenchange', ZoomExecutionEngine.applyViewportZoomScale, { passive: true });
  document.addEventListener('mozfullscreenchange', ZoomExecutionEngine.applyViewportZoomScale, { passive: true });

  window.addEventListener('pagehide', destroyEngineLifecycle, { once: true });
  window.addEventListener('beforeunload', destroyEngineLifecycle, { once: true });
})();
