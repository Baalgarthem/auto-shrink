/**
   * Modos de escalado soportados por el sistema.
   * @readonly
   * @enum {string}
   */
  export const SCALING_MODES = Object.freeze({
    CONTINUOUS: 'continuous',
    THRESHOLDS: 'thresholds'
  });

  /**
   * Valores de configuración por defecto inmutables.
   * @readonly
   * @type {Object}
   */
  export const DEFAULT_CONFIGURATION = Object.freeze({
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
  export const CONFIGURATION_KEYS = Object.freeze(Object.keys(DEFAULT_CONFIGURATION));

  export const CONFIGURATION_MODAL_OVERLAY_ID = 'auto-shrink-configuration-modal-overlay-v2';
  export const MODAL_STYLE_ID = 'auto-shrink-modal-styles-v5';
  export const SCALE_UPDATE_HYSTERESIS = 0.0025;
  export const SCALE_SYNCHRONIZATION_EPSILON = 0.000001;
  export const SCALE_DECIMAL_FACTOR = 1000000;
  export const BREAKPOINT_HYSTERESIS = 0.01;