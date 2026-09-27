import { SCALING_MODES, SPLIT_VIEW_BEHAVIORS, DEFAULT_CONFIGURATION, CONFIGURATION_KEYS } from './constants.js';

/**
 * Servicio encargado de administrar la configuración con inyección de dependencias de almacenamiento.
 */
export class ConfigurationService {
  /**
   * @param {Object} [dependencies] - Inyección de dependencias de almacenamiento.
   * @param {Function} [dependencies.getValue] - Función para leer del almacenamiento persistent (ej: GM_getValue).
   * @param {Function} [dependencies.setValue] - Función para escribir en almacenamiento persistente (ej: GM_setValue).
   * @param {Function} [dependencies.addValueChangeListener] - Listener de sincronización entre pestañas.
   * @param {Function} [dependencies.removeValueChangeListener] - Remoción de listener.
   * @param {Function} [dependencies.onConfigChange] - Callback invocado al cambiar cualquier opción.
   */
  constructor(dependencies = {}) {
    this.getValue = typeof dependencies.getValue === 'function' ? dependencies.getValue : null;
    this.setValue = typeof dependencies.setValue === 'function' ? dependencies.setValue : null;
    this.addValueChangeListener = typeof dependencies.addValueChangeListener === 'function' ? dependencies.addValueChangeListener : null;
    this.removeValueChangeListener = typeof dependencies.removeValueChangeListener === 'function' ? dependencies.removeValueChangeListener : null;
    this.onConfigChange = typeof dependencies.onConfigChange === 'function' ? dependencies.onConfigChange : null;

    this.activeCache = Object.assign({}, DEFAULT_CONFIGURATION);
    this.valueChangeListenerIds = [];
    this.sanitizedSnapshotCache = null;

    this.loadAll();
    this.initializeSynchronization();
  }

  loadAll() {
    try {
      if (!this.getValue) return;
      for (const key of CONFIGURATION_KEYS) {
        const storedValue = this.getValue(key, DEFAULT_CONFIGURATION[key]);
        if (storedValue !== undefined && storedValue !== null) {
          this.activeCache[key] = storedValue;
        }
      }
      this.sanitizedSnapshotCache = null;
    } catch (e) {
      console.warn('[Auto-Shrink] Error cargando caché de configuración:', e);
    }
  }

  get(key) {
    return this.activeCache[key] !== undefined ? this.activeCache[key] : DEFAULT_CONFIGURATION[key];
  }

  getSanitizedConfig() {
    if (this.sanitizedSnapshotCache !== null) return this.sanitizedSnapshotCache;

    const minLimit = this.sanitizeNumeric(this.get('minimumZoomScaleLimit'), 0.20, 0.05, 1.00);
    const rawMax = this.sanitizeNumeric(this.get('maximumZoomScaleLimit'), 1.00, 0.50, 2.00);
    const maxLimit = Math.max(minLimit, rawMax);

    const threshold80 = this.sanitizeNumeric(this.get('thresholdZoomLevelUnder80Percent'), 0.85, minLimit, maxLimit);
    const threshold60 = Math.min(threshold80, this.sanitizeNumeric(this.get('thresholdZoomLevelUnder60Percent'), 0.70, minLimit, maxLimit));
    const threshold40 = Math.min(threshold60, this.sanitizeNumeric(this.get('thresholdZoomLevelUnder40Percent'), 0.55, minLimit, maxLimit));
    const threshold20 = Math.min(threshold40, this.sanitizeNumeric(this.get('thresholdZoomLevelUnder20Percent'), 0.35, minLimit, maxLimit));

    const rawBehavior = this.get('splitViewBehavior');
    const validBehavior = Object.values(SPLIT_VIEW_BEHAVIORS).includes(rawBehavior)
      ? rawBehavior
      : SPLIT_VIEW_BEHAVIORS.EXPAND_MAX;

    this.sanitizedSnapshotCache = Object.freeze({
      scalingMode: this.get('scalingMode') === SCALING_MODES.THRESHOLDS ? SCALING_MODES.THRESHOLDS : SCALING_MODES.CONTINUOUS,
      referenceBaseWidthSetting: this.sanitizeReferenceBaseWidth(this.get('referenceBaseWidthSetting')),
      minimumZoomScaleLimit: minLimit,
      maximumZoomScaleLimit: maxLimit,
      thresholdZoomLevelUnder80Percent: threshold80,
      thresholdZoomLevelUnder60Percent: threshold60,
      thresholdZoomLevelUnder40Percent: threshold40,
      thresholdZoomLevelUnder20Percent: threshold20,
      isMediaPointerPrecisionEnabled: !!this.get('isMediaPointerPrecisionEnabled'),
      isResetInFullscreenEnabled: !!this.get('isResetInFullscreenEnabled'),
      isSplitViewAdaptationEnabled: !!this.get('isSplitViewAdaptationEnabled'),
      splitViewBehavior: validBehavior
    });

    return this.sanitizedSnapshotCache;
  }

  set(key, value) {
    try {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_CONFIGURATION, key) || Object.is(this.activeCache[key], value)) {
        return false;
      }
      this.activeCache[key] = value;
      this.sanitizedSnapshotCache = null;
      if (this.setValue) {
        this.setValue(key, value);
      }
      if (typeof this.onConfigChange === 'function') {
        this.onConfigChange(key, value);
      }
      return true;
    } catch (e) {
      console.warn(`[Auto-Shrink] Error guardando clave "${key}":`, e);
      return false;
    }
  }

  setMany(values) {
    let hasChanges = false;
    for (const key of CONFIGURATION_KEYS) {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        hasChanges = this.set(key, values[key]) || hasChanges;
      }
    }
    return hasChanges;
  }

  resetAll() {
    return this.setMany(DEFAULT_CONFIGURATION);
  }

  sanitizeNumeric(value, fallbackValue, minBound, maxBound) {
    const parsed = parseFloat(value);
    if (!Number.isFinite(parsed)) return fallbackValue;
    return Math.max(minBound, Math.min(maxBound, parsed));
  }

  sanitizeReferenceBaseWidth(value) {
    if (value === 'auto') return 'auto';
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(320, Math.min(10000, parsed)) : 'auto';
  }

  initializeSynchronization() {
    if (!this.addValueChangeListener) return;

    for (const key of CONFIGURATION_KEYS) {
      try {
        const listenerId = this.addValueChangeListener(key, (_name, _oldValue, newValue, isRemote) => {
          if (!isRemote) return;
          this.activeCache[key] = newValue === undefined ? DEFAULT_CONFIGURATION[key] : newValue;
          this.sanitizedSnapshotCache = null;
          if (typeof this.onConfigChange === 'function') {
            this.onConfigChange(key, newValue);
          }
        });
        this.valueChangeListenerIds.push(listenerId);
      } catch (e) { }
    }
  }

  destroy() {
    if (!this.removeValueChangeListener) return;
    for (const listenerId of this.valueChangeListenerIds) {
      try {
        this.removeValueChangeListener(listenerId);
      } catch (e) { }
    }
    this.valueChangeListenerIds.length = 0;
  }
}