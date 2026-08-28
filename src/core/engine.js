import { SCALE_UPDATE_HYSTERESIS } from '../config/constants.js';
import { ConfigurationService } from '../config/configuration.js';
import { ViewportMetricsService } from './metrics.js';
import { PointerPrecisionService } from './pointer.js';
import { ScrollSynchronizationService } from './scroll.js';
import { BrowserEnvironmentService } from './environment.js';
import { UserInterfaceController } from '../ui/interface.js';
/**
   * Motor de ejecución de zoom con escrituras agrupadas y filtro de histéresis.
   */
  export const ZoomExecutionEngine = (function () {
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