import { SCALING_MODES, BREAKPOINT_HYSTERESIS } from '../config/constants.js';

/**
 * Servicio de medición del viewport con inyección de dependencias de ventana y pantalla.
 */
export class ViewportMetricsService {
  /**
   * @param {Object} [dependencies]
   * @param {Window} [dependencies.windowProvider] - Objeto window global o mock.
   * @param {Screen} [dependencies.screenProvider] - Objeto screen global o mock.
   */
  constructor(dependencies = {}) {
    this.windowProvider = dependencies.windowProvider || (typeof window !== 'undefined' ? window : null);
    this.screenProvider = dependencies.screenProvider || (typeof screen !== 'undefined' ? screen : null);
    this.THRESHOLD_BOUNDARIES = Object.freeze([0.20, 0.40, 0.60, 0.80]);
    this.activeThresholdBand = -1;
  }

  /**
   * Detecta si el usuario está realizando un gesto de pinch-zoom táctil nativo.
   * @returns {boolean} True si hay un pinch-zoom activo.
   */
  isPinchZoomActive() {
    try {
      const win = this.windowProvider;
      if (win && win.visualViewport && typeof win.visualViewport.scale === 'number') {
        return Math.abs(win.visualViewport.scale - 1.0) > 0.05;
      }
    } catch (e) { }
    return false;
  }

  /**
   * Calcula el ancho base de la pantalla en píxeles considerando la densidad DPI.
   * @returns {number} Ancho base de referencia en píxeles.
   */
  getScreenWidth() {
    try {
      const scr = this.screenProvider;
      if (scr) {
        const availableWidth = Number(scr.availWidth);
        const totalWidth = Number(scr.width);
        if (Number.isFinite(availableWidth) && availableWidth > 0) return availableWidth;
        if (Number.isFinite(totalWidth) && totalWidth > 0) return totalWidth;
      }
    } catch (e) { }
    return 0;
  }

  /**
   * Retorna la altura útil de la pantalla.
   * @returns {number} Altura en píxeles.
   */
  getScreenHeight() {
    try {
      const scr = this.screenProvider;
      if (scr) {
        const availableHeight = Number(scr.availHeight);
        const totalHeight = Number(scr.height);
        if (Number.isFinite(availableHeight) && availableHeight > 0) return availableHeight;
        if (Number.isFinite(totalHeight) && totalHeight > 0) return totalHeight;
      }
    } catch (e) { }
    return 0;
  }

  /**
   * Obtiene el ancho válido del viewport navegando entre fuentes de respaldo.
   * @returns {number} Ancho en píxeles.
   */
  getValidViewportWidth() {
    try {
      const win = this.windowProvider;
      const docElement = (win && win.document && win.document.documentElement) ? win.document.documentElement : null;
      const docBody = (win && win.document && win.document.body) ? win.document.body : null;

      if (win && win.innerWidth && win.innerWidth > 0) return win.innerWidth;
      if (docElement && docElement.clientWidth > 0) return docElement.clientWidth;
      if (docBody && docBody.clientWidth > 0) return docBody.clientWidth;
      if (win && win.screen && win.screen.width > 0) return win.screen.width;
    } catch (e) { }
    return 0;
  }

  /**
   * Obtiene la altura válida del viewport.
   * @returns {number} Altura en píxeles.
   */
  getValidViewportHeight() {
    try {
      const win = this.windowProvider;
      const docElement = (win && win.document && win.document.documentElement) ? win.document.documentElement : null;

      if (win && win.innerHeight && win.innerHeight > 0) return win.innerHeight;
      if (docElement && docElement.clientHeight > 0) return docElement.clientHeight;
    } catch (e) { }
    return 0;
  }

  calculateReferenceBaseWidth(currentViewportWidthPx, referenceBaseWidthSetting, screenWidthPx) {
    try {
      const setting = referenceBaseWidthSetting;
      if (typeof setting === 'number' && setting > 0) return setting;
      const screenWidth = screenWidthPx || this.getScreenWidth();
      return screenWidth > 0 ? Math.max(currentViewportWidthPx || 0, screenWidth) : (currentViewportWidthPx || 1920);
    } catch (e) {
      return 1920;
    }
  }

  computeZoomScaleFactor(currentViewportWidthPx, referenceBaseWidthPx, config) {
    const ratio = currentViewportWidthPx / referenceBaseWidthPx;
    let computedScale = 1.0;

    if (config.scalingMode === SCALING_MODES.THRESHOLDS) {
      if (this.activeThresholdBand < 0) {
        this.activeThresholdBand = ratio < 0.20 ? 0 : ratio < 0.40 ? 1 : ratio < 0.60 ? 2 : ratio < 0.80 ? 3 : 4;
      } else {
        while (this.activeThresholdBand < 4 && ratio >= this.THRESHOLD_BOUNDARIES[this.activeThresholdBand] + BREAKPOINT_HYSTERESIS) {
          this.activeThresholdBand++;
        }
        while (this.activeThresholdBand > 0 && ratio < this.THRESHOLD_BOUNDARIES[this.activeThresholdBand - 1] - BREAKPOINT_HYSTERESIS) {
          this.activeThresholdBand--;
        }
      }

      if (this.activeThresholdBand === 0) computedScale = config.thresholdZoomLevelUnder20Percent;
      else if (this.activeThresholdBand === 1) computedScale = config.thresholdZoomLevelUnder40Percent;
      else if (this.activeThresholdBand === 2) computedScale = config.thresholdZoomLevelUnder60Percent;
      else if (this.activeThresholdBand === 3) computedScale = config.thresholdZoomLevelUnder80Percent;
      else computedScale = config.maximumZoomScaleLimit;
    } else {
      this.activeThresholdBand = -1;
      computedScale = ratio >= 1.0 ? Math.min(1.00, config.maximumZoomScaleLimit) : ratio;
    }

    return Math.max(config.minimumZoomScaleLimit, Math.min(config.maximumZoomScaleLimit, computedScale));
  }
}