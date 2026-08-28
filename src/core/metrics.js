import { SCALING_MODES, BREAKPOINT_HYSTERESIS } from '../config/constants.js';
/**
   * Servicio encargado de calcular métricas estables del viewport y la pantalla de referencia.
   */
  export const ViewportMetricsService = (function () {
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