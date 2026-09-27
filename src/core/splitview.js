import { SPLIT_VIEW_THRESHOLD_RATIO, SPLIT_VIEW_BEHAVIORS } from '../config/constants.js';

/**
 * Servicio especializado en detectar pestañas y ventanas en modo de Vista Dividida (Split-View)
 * y calcular el factor de ampliación (Expand) al máximo zoom permitido.
 */
export class SplitViewDetectorService {
  /**
   * @param {Object} [dependencies]
   * @param {Object} [dependencies.viewportMetrics] - Instancia de ViewportMetricsService.
   * @param {Window} [dependencies.windowProvider] - Referencia a window global.
   */
  constructor(dependencies = {}) {
    this.metrics = dependencies.viewportMetrics || null;
    this.windowProvider = dependencies.windowProvider || (typeof window !== 'undefined' ? window : null);
  }

  /**
   * Evalúa la disposición actual del viewport y determina si la ventana/pestaña se encuentra en vista dividida.
   * @returns {Object} Diagnóstico de vista dividida.
   */
  detectSplitView() {
    try {
      const win = this.windowProvider;
      if (!win) return { isSplitView: false, ratio: 1.0, mode: 'full' };

      const viewportWidth = this.metrics ? this.metrics.getValidViewportWidth() : (win.innerWidth || 1920);
      const viewportHeight = this.metrics ? this.metrics.getValidViewportHeight() : (win.innerHeight || 1080);
      const screenWidth = this.metrics ? this.metrics.getScreenWidth() : (win.screen ? win.screen.availWidth || win.screen.width : 1920);
      const screenHeight = this.metrics ? this.metrics.getScreenHeight() : (win.screen ? win.screen.availHeight || win.screen.height : 1080);

      if (!screenWidth || !viewportWidth) {
        return { isSplitView: false, ratio: 1.0, mode: 'full' };
      }

      const viewportToScreenRatio = viewportWidth / screenWidth;
      const isLandscapeMonitor = screenWidth >= screenHeight;
      const isPortraitViewport = isLandscapeMonitor && (viewportWidth / viewportHeight) <= 1.05;

      let outerRatio = 1.0;
      if (win.outerWidth && Number.isFinite(win.outerWidth) && win.outerWidth > 0) {
        outerRatio = win.outerWidth / screenWidth;
      }

      const isRatioSplit = viewportToScreenRatio <= SPLIT_VIEW_THRESHOLD_RATIO || outerRatio <= 0.68;
      const isSplitView = isRatioSplit || isPortraitViewport;

      let mode = 'full';
      if (isSplitView) {
        if (viewportToScreenRatio <= 0.40) mode = 'snap_third';
        else if (viewportToScreenRatio <= 0.65) mode = 'snap_half';
        else mode = 'side_by_side';
      }

      return {
        isSplitView,
        ratio: viewportToScreenRatio,
        mode,
        isPortraitViewport
      };
    } catch (e) {
      return { isSplitView: false, ratio: 1.0, mode: 'full' };
    }
  }

  /**
   * Calcula el factor de escala aplicando la lógica de AMPLIACIÓN (Expand Max) para vista dividida.
   * @param {Object} config - Configuración saneada activa.
   * @param {number} standardComputedScale - Factor de zoom estándar que calcula el motor.
   * @returns {number} Factor de zoom ampliado al máximo o procesado según configuración.
   */
  computeSplitViewTargetScale(config, standardComputedScale) {
    const status = this.detectSplitView();

    if (!config.isSplitViewAdaptationEnabled || !status.isSplitView) {
      return standardComputedScale;
    }

    switch (config.splitViewBehavior) {
      case SPLIT_VIEW_BEHAVIORS.EXPAND_MAX:
        // En vista dividida, NO encoger (shrink), sino AMPLIAR al máximo permitido (maximumZoomScaleLimit)
        return Math.max(1.00, config.maximumZoomScaleLimit);

      case SPLIT_VIEW_BEHAVIORS.RESET_NATIVE:
        return 1.00;

      case SPLIT_VIEW_BEHAVIORS.SHRINK_STANDARD:
      default:
        return standardComputedScale;
    }
  }
}
