import { SCALING_MODES, DEFAULT_CONFIGURATION, CONFIGURATION_KEYS } from './constants.js';
import { ZoomExecutionEngine } from '../core/engine.js';
/**
   * Servicio encargado de administrar el almacenamiento, caché en memoria sin asignaciones
   * y sincronización en tiempo real entre pestañas múltiples.
   */
  export const ConfigurationService = (function () {
    const activeCache = Object.assign({}, DEFAULT_CONFIGURATION);
    const valueChangeListenerIds = [];
    let sanitizedSnapshotCache = null;

    /**
     * Carga todas las opciones almacenadas en la extensión hacia la caché en memoria.
     */
    function loadAll() {
      try {
        if (typeof GM_getValue !== 'function') return;
        for (const key of CONFIGURATION_KEYS) {
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

      const threshold80 = sanitizeNumeric(get('thresholdZoomLevelUnder80Percent'), 0.85, minLimit, maxLimit);
      const threshold60 = Math.min(threshold80, sanitizeNumeric(get('thresholdZoomLevelUnder60Percent'), 0.70, minLimit, maxLimit));
      const threshold40 = Math.min(threshold60, sanitizeNumeric(get('thresholdZoomLevelUnder40Percent'), 0.55, minLimit, maxLimit));
      const threshold20 = Math.min(threshold40, sanitizeNumeric(get('thresholdZoomLevelUnder20Percent'), 0.35, minLimit, maxLimit));

      sanitizedSnapshotCache = Object.freeze({
        scalingMode: get('scalingMode') === SCALING_MODES.THRESHOLDS ? SCALING_MODES.THRESHOLDS : SCALING_MODES.CONTINUOUS,
        referenceBaseWidthSetting: sanitizeReferenceBaseWidth(get('referenceBaseWidthSetting')),
        minimumZoomScaleLimit: minLimit,
        maximumZoomScaleLimit: maxLimit,
        thresholdZoomLevelUnder80Percent: threshold80,
        thresholdZoomLevelUnder60Percent: threshold60,
        thresholdZoomLevelUnder40Percent: threshold40,
        thresholdZoomLevelUnder20Percent: threshold20,
        isMediaPointerPrecisionEnabled: !!get('isMediaPointerPrecisionEnabled'),
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
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_CONFIGURATION, key) || Object.is(activeCache[key], value)) return false;
        activeCache[key] = value;
        sanitizedSnapshotCache = null; // Invalidar instantánea
        if (typeof GM_setValue === 'function') {
          GM_setValue(key, value);
        }
        return true;
      } catch (e) {
        console.warn(`[Auto-Shrink] Error guardando clave "${key}":`, e);
        return false;
      }
    }

    function setMany(values) {
      let hasChanges = false;
      for (const key of CONFIGURATION_KEYS) {
        if (Object.prototype.hasOwnProperty.call(values, key)) {
          hasChanges = set(key, values[key]) || hasChanges;
        }
      }
      return hasChanges;
    }

    /**
     * Restablece todas las opciones de configuración a sus valores por defecto.
     */
    function resetAll() {
      return setMany(DEFAULT_CONFIGURATION);
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

      for (const key of CONFIGURATION_KEYS) {
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
      getSanitizedConfig,
      setMany,
      resetAll,
      sanitizeNumeric,
      destroy
    };
  })();