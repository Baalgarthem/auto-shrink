import { SCALE_UPDATE_HYSTERESIS } from '../config/constants.js';

/**
 * Motor de ejecución de zoom ultra-optimizado con inyección de dependencias.
 */
export class ZoomExecutionEngine {
  /**
   * @param {Object} [dependencies]
   * @param {Object} dependencies.configurationService - Instancia de ConfigurationService.
   * @param {Object} dependencies.viewportMetricsService - Instancia de ViewportMetricsService.
   * @param {Object} dependencies.splitViewDetectorService - Instancia de SplitViewDetectorService.
   * @param {Object} dependencies.pointerPrecisionService - Instancia de PointerPrecisionService.
   * @param {Object} dependencies.scrollSynchronizationService - Instancia de ScrollSynchronizationService.
   * @param {Object} dependencies.browserEnvironmentService - Instancia de BrowserEnvironmentService.
   * @param {Window} [dependencies.windowProvider] - Objeto window global.
   * @param {Document} [dependencies.documentProvider] - Objeto document global.
   */
  constructor(dependencies = {}) {
    this.configService = dependencies.configurationService || null;
    this.metricsService = dependencies.viewportMetricsService || null;
    this.splitViewDetector = dependencies.splitViewDetectorService || null;
    this.pointerService = dependencies.pointerPrecisionService || null;
    this.scrollService = dependencies.scrollSynchronizationService || null;
    this.envService = dependencies.browserEnvironmentService || null;
    this.windowProvider = dependencies.windowProvider || (typeof window !== 'undefined' ? window : null);
    this.documentProvider = dependencies.documentProvider || (typeof document !== 'undefined' ? document : null);

    this.isAnimationFrameScheduled = false;
    this.isForcedApplicationPending = false;
    this.animationFrameRequestId = null;
    this.styleMutationObserver = null;
    this.lastAppliedZoomScaleString = null;
    this.lastAppliedScaleValue = 1.0;
    this.lastViewportWidth = -1;
    this.lastScreenWidth = -1;
    this.lastConfigurationSnapshot = null;
    this.lastFullscreenState = false;
    this.originalInlineZoom = null;
    this.originalInlineZoomPriority = '';

    this.boundApplyViewportZoomScale = this.applyViewportZoomScale.bind(this);
  }

  rememberOriginalStyle() {
    const doc = this.documentProvider;
    const rootElement = doc ? doc.documentElement : null;
    if (!rootElement || this.originalInlineZoom !== null) return;
    this.originalInlineZoom = rootElement.style.getPropertyValue('zoom');
    this.originalInlineZoomPriority = rootElement.style.getPropertyPriority('zoom');
  }

  applyViewportZoomScale(forceApplication) {
    const doc = this.documentProvider;
    if (!doc || doc.hidden) return;
    if (this.metricsService && this.metricsService.isPinchZoomActive()) return;

    try {
      const rootElement = doc.documentElement;
      if (!rootElement) return;

      const config = this.configService ? this.configService.getSanitizedConfig() : {};
      if (this.pointerService) {
        this.pointerService.setMediaPointerPrecisionEnabled(config.isMediaPointerPrecisionEnabled);
      }

      const currentViewportWidthPx = this.metricsService ? this.metricsService.getValidViewportWidth() : (this.windowProvider ? this.windowProvider.innerWidth : 1920);
      if (!currentViewportWidthPx) return;
      const monitorWidth = (this.metricsService ? this.metricsService.getScreenWidth() : 0) || currentViewportWidthPx;
      const isFullscreen = this.envService ? this.envService.isDocumentInFullscreenMode() : false;

      if (!forceApplication &&
          currentViewportWidthPx === this.lastViewportWidth &&
          monitorWidth === this.lastScreenWidth &&
          config === this.lastConfigurationSnapshot &&
          isFullscreen === this.lastFullscreenState) {
        return;
      }

      this.lastViewportWidth = currentViewportWidthPx;
      this.lastScreenWidth = monitorWidth;
      this.lastConfigurationSnapshot = config;
      this.lastFullscreenState = isFullscreen;

      if (config.isResetInFullscreenEnabled && isFullscreen) {
        const fullscreenScaleValue = 1;
        const fullscreenScaleString = this.pointerService ? this.pointerService.formatScale(fullscreenScaleValue) : '1.000000';
        if (forceApplication || this.lastAppliedZoomScaleString !== fullscreenScaleString || !(this.pointerService && this.pointerService.isScaleSynchronized(rootElement, fullscreenScaleValue))) {
          if (this.pointerService && this.pointerService.applyNativeScale(rootElement, fullscreenScaleValue, fullscreenScaleString)) {
            this.lastAppliedZoomScaleString = fullscreenScaleString;
            this.lastAppliedScaleValue = fullscreenScaleValue;
          }
        }
        return;
      }

      // ── Detección Específica de Vista Dividida ──
      const splitViewDiagnosis = this.splitViewDetector ? this.splitViewDetector.detectSplitView() : { isSplitView: false };
      const automaticReferenceWidth = this.metricsService
        ? this.metricsService.calculateReferenceBaseWidth(currentViewportWidthPx, config.referenceBaseWidthSetting, monitorWidth)
        : monitorWidth;

      const referenceBaseWidthPx = (!config.isSplitViewAdaptationEnabled && splitViewDiagnosis.isSplitView && config.referenceBaseWidthSetting === 'auto')
        ? currentViewportWidthPx
        : automaticReferenceWidth;

      let rawComputedScale = this.metricsService
        ? this.metricsService.computeZoomScaleFactor(currentViewportWidthPx, referenceBaseWidthPx, config)
        : 1.0;

      // Aplicar Lógica de Ampliación (Expand Max) en Vista Dividida si aplica
      let computedZoomScaleFactor = rawComputedScale;
      if (this.splitViewDetector) {
        computedZoomScaleFactor = this.splitViewDetector.computeSplitViewTargetScale(config, rawComputedScale);
      }

      const normalizedZoomScaleFactor = this.pointerService ? this.pointerService.normalizeScale(computedZoomScaleFactor) : computedZoomScaleFactor;
      const zoomScaleString = this.pointerService ? this.pointerService.formatScale(normalizedZoomScaleFactor) : String(normalizedZoomScaleFactor);
      const expectedCurrentScaleFactor = this.lastAppliedZoomScaleString === null ? normalizedZoomScaleFactor : this.lastAppliedScaleValue;
      const zoomWasOverwritten = this.pointerService ? !this.pointerService.isScaleSynchronized(rootElement, expectedCurrentScaleFactor) : false;

      if (!forceApplication && !zoomWasOverwritten && this.lastAppliedZoomScaleString !== null && Math.abs(normalizedZoomScaleFactor - this.lastAppliedScaleValue) < SCALE_UPDATE_HYSTERESIS) {
        return;
      }

      if (!forceApplication && this.lastAppliedZoomScaleString === zoomScaleString && !zoomWasOverwritten) {
        return;
      }

      if (this.pointerService && this.pointerService.applyNativeScale(rootElement, normalizedZoomScaleFactor, zoomScaleString)) {
        this.lastAppliedZoomScaleString = zoomScaleString;
        this.lastAppliedScaleValue = normalizedZoomScaleFactor;
      }
    } catch (e) { }
  }

  scheduleFrameExecution(forceApplication) {
    this.isForcedApplicationPending = this.isForcedApplicationPending || !!forceApplication;
    if (!this.isAnimationFrameScheduled && this.windowProvider) {
      this.animationFrameRequestId = this.windowProvider.requestAnimationFrame(() => {
        const shouldForceApplication = this.isForcedApplicationPending;
        this.isAnimationFrameScheduled = false;
        this.isForcedApplicationPending = false;
        this.animationFrameRequestId = null;
        this.applyViewportZoomScale(shouldForceApplication);
      });
      this.isAnimationFrameScheduled = true;
    }
  }

  initializeStyleMutationProtectionObserver() {
    try {
      const doc = this.documentProvider;
      const rootElement = doc ? doc.documentElement : null;
      if (!rootElement || this.styleMutationObserver) return;

      this.styleMutationObserver = new MutationObserver((mutations) => {
        if (mutations.length > 0 && this.lastAppliedZoomScaleString !== null && this.pointerService && !this.pointerService.isScaleSynchronized(rootElement, this.lastAppliedScaleValue)) {
          this.scheduleFrameExecution(true);
        }
      });

      this.styleMutationObserver.observe(rootElement, {
        attributes: true,
        attributeFilter: ['style']
      });
    } catch (e) { }
  }

  destroy() {
    if (this.styleMutationObserver) {
      this.styleMutationObserver.disconnect();
      this.styleMutationObserver = null;
    }
    if (this.animationFrameRequestId !== null && this.windowProvider) {
      this.windowProvider.cancelAnimationFrame(this.animationFrameRequestId);
      this.animationFrameRequestId = null;
    }
    this.isAnimationFrameScheduled = false;
    this.isForcedApplicationPending = false;
    this.lastViewportWidth = -1;
    this.lastScreenWidth = -1;
    this.lastConfigurationSnapshot = null;
    const doc = this.documentProvider;
    const rootElement = doc ? doc.documentElement : null;
    if (rootElement && this.lastAppliedZoomScaleString !== null) {
      if (this.originalInlineZoom === '') rootElement.style.removeProperty('zoom');
      else if (this.originalInlineZoom) rootElement.style.setProperty('zoom', this.originalInlineZoom, this.originalInlineZoomPriority);
      rootElement.style.removeProperty('--auto-shrink-scale');
    }
  }
}