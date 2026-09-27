// ==UserScript==
// @name         Auto-Shrink
// @namespace    https://github.com/Baalgarthem/auto-shrink
// @icon         https://github.com/Baalgarthem/auto-shrink/raw/refs/heads/principal/media/main_icon.ico
// @version      5.7.1
// @description  Ajusta automáticamente el zoom al ancho disponible, detecta vista dividida (Split-View) ampliando al máximo, sincroniza el scroll y corrige coordenadas multimedia (XVideos, Pornhub, YouTube, etc.).
// @author       Baalgarthem
// @match        *://*/*
// @noframes
// @updateURL    https://raw.githubusercontent.com/Baalgarthem/auto-shrink/principal/dist/auto-shrink.user.js
// @downloadURL  https://raw.githubusercontent.com/Baalgarthem/auto-shrink/principal/dist/auto-shrink.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==


(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

/* ════════════════════════════════════════════════════════════ */
/*              MÓDULO: src/config/constants.js               */
/* ════════════════════════════════════════════════════════════ */
  var SCALING_MODES, SPLIT_VIEW_BEHAVIORS, DEFAULT_CONFIGURATION, CONFIGURATION_KEYS, CONFIGURATION_MODAL_OVERLAY_ID, MODAL_STYLE_ID, SCALE_UPDATE_HYSTERESIS, SCALE_SYNCHRONIZATION_EPSILON, SCALE_DECIMAL_FACTOR, BREAKPOINT_HYSTERESIS, SPLIT_VIEW_THRESHOLD_RATIO;
  var init_constants = __esm({
    "src/config/constants.js"() {
      SCALING_MODES = Object.freeze({
        CONTINUOUS: "continuous",
        THRESHOLDS: "thresholds"
      });
      SPLIT_VIEW_BEHAVIORS = Object.freeze({
        EXPAND_MAX: "expand_max",
        RESET_NATIVE: "reset_native",
        SHRINK_STANDARD: "shrink_standard"
      });
      DEFAULT_CONFIGURATION = Object.freeze({
        scalingMode: SCALING_MODES.CONTINUOUS,
        referenceBaseWidthSetting: "auto",
        minimumZoomScaleLimit: 0.2,
        maximumZoomScaleLimit: 1,
        thresholdZoomLevelUnder80Percent: 0.85,
        thresholdZoomLevelUnder60Percent: 0.7,
        thresholdZoomLevelUnder40Percent: 0.55,
        thresholdZoomLevelUnder20Percent: 0.35,
        isMediaPointerPrecisionEnabled: true,
        isResetInFullscreenEnabled: true,
        isSplitViewAdaptationEnabled: true,
        splitViewBehavior: SPLIT_VIEW_BEHAVIORS.EXPAND_MAX
      });
      CONFIGURATION_KEYS = Object.freeze(Object.keys(DEFAULT_CONFIGURATION));
      CONFIGURATION_MODAL_OVERLAY_ID = "auto-shrink-configuration-modal-overlay-v2";
      MODAL_STYLE_ID = "auto-shrink-modal-styles-v5";
      SCALE_UPDATE_HYSTERESIS = 25e-4;
      SCALE_SYNCHRONIZATION_EPSILON = 1e-6;
      SCALE_DECIMAL_FACTOR = 1e6;
      BREAKPOINT_HYSTERESIS = 0.01;
      SPLIT_VIEW_THRESHOLD_RATIO = 0.65;
    }
  });

/* ════════════════════════════════════════════════════════════ */
/*            MÓDULO: src/config/configuration.js             */
/* ════════════════════════════════════════════════════════════ */
  var ConfigurationService;
  var init_configuration = __esm({
    "src/config/configuration.js"() {
      init_constants();
      ConfigurationService = class {
        /**
         * @param {Object} [dependencies] - Inyección de dependencias de almacenamiento.
         * @param {Function} [dependencies.getValue] - Función para leer del almacenamiento persistent (ej: GM_getValue).
         * @param {Function} [dependencies.setValue] - Función para escribir en almacenamiento persistente (ej: GM_setValue).
         * @param {Function} [dependencies.addValueChangeListener] - Listener de sincronización entre pestañas.
         * @param {Function} [dependencies.removeValueChangeListener] - Remoción de listener.
         * @param {Function} [dependencies.onConfigChange] - Callback invocado al cambiar cualquier opción.
         */
        constructor(dependencies = {}) {
          this.getValue = typeof dependencies.getValue === "function" ? dependencies.getValue : null;
          this.setValue = typeof dependencies.setValue === "function" ? dependencies.setValue : null;
          this.addValueChangeListener = typeof dependencies.addValueChangeListener === "function" ? dependencies.addValueChangeListener : null;
          this.removeValueChangeListener = typeof dependencies.removeValueChangeListener === "function" ? dependencies.removeValueChangeListener : null;
          this.onConfigChange = typeof dependencies.onConfigChange === "function" ? dependencies.onConfigChange : null;
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
              if (storedValue !== void 0 && storedValue !== null) {
                this.activeCache[key] = storedValue;
              }
            }
            this.sanitizedSnapshotCache = null;
          } catch (e) {
            console.warn("[Auto-Shrink] Error cargando cach\xE9 de configuraci\xF3n:", e);
          }
        }
        get(key) {
          return this.activeCache[key] !== void 0 ? this.activeCache[key] : DEFAULT_CONFIGURATION[key];
        }
        getSanitizedConfig() {
          if (this.sanitizedSnapshotCache !== null) return this.sanitizedSnapshotCache;
          const minLimit = this.sanitizeNumeric(this.get("minimumZoomScaleLimit"), 0.2, 0.05, 1);
          const rawMax = this.sanitizeNumeric(this.get("maximumZoomScaleLimit"), 1, 0.5, 2);
          const maxLimit = Math.max(minLimit, rawMax);
          const threshold80 = this.sanitizeNumeric(this.get("thresholdZoomLevelUnder80Percent"), 0.85, minLimit, maxLimit);
          const threshold60 = Math.min(threshold80, this.sanitizeNumeric(this.get("thresholdZoomLevelUnder60Percent"), 0.7, minLimit, maxLimit));
          const threshold40 = Math.min(threshold60, this.sanitizeNumeric(this.get("thresholdZoomLevelUnder40Percent"), 0.55, minLimit, maxLimit));
          const threshold20 = Math.min(threshold40, this.sanitizeNumeric(this.get("thresholdZoomLevelUnder20Percent"), 0.35, minLimit, maxLimit));
          const rawBehavior = this.get("splitViewBehavior");
          const validBehavior = Object.values(SPLIT_VIEW_BEHAVIORS).includes(rawBehavior) ? rawBehavior : SPLIT_VIEW_BEHAVIORS.EXPAND_MAX;
          this.sanitizedSnapshotCache = Object.freeze({
            scalingMode: this.get("scalingMode") === SCALING_MODES.THRESHOLDS ? SCALING_MODES.THRESHOLDS : SCALING_MODES.CONTINUOUS,
            referenceBaseWidthSetting: this.sanitizeReferenceBaseWidth(this.get("referenceBaseWidthSetting")),
            minimumZoomScaleLimit: minLimit,
            maximumZoomScaleLimit: maxLimit,
            thresholdZoomLevelUnder80Percent: threshold80,
            thresholdZoomLevelUnder60Percent: threshold60,
            thresholdZoomLevelUnder40Percent: threshold40,
            thresholdZoomLevelUnder20Percent: threshold20,
            isMediaPointerPrecisionEnabled: !!this.get("isMediaPointerPrecisionEnabled"),
            isResetInFullscreenEnabled: !!this.get("isResetInFullscreenEnabled"),
            isSplitViewAdaptationEnabled: !!this.get("isSplitViewAdaptationEnabled"),
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
            if (typeof this.onConfigChange === "function") {
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
          if (value === "auto") return "auto";
          const parsed = parseInt(value, 10);
          return Number.isFinite(parsed) ? Math.max(320, Math.min(1e4, parsed)) : "auto";
        }
        initializeSynchronization() {
          if (!this.addValueChangeListener) return;
          for (const key of CONFIGURATION_KEYS) {
            try {
              const listenerId = this.addValueChangeListener(key, (_name, _oldValue, newValue, isRemote) => {
                if (!isRemote) return;
                this.activeCache[key] = newValue === void 0 ? DEFAULT_CONFIGURATION[key] : newValue;
                this.sanitizedSnapshotCache = null;
                if (typeof this.onConfigChange === "function") {
                  this.onConfigChange(key, newValue);
                }
              });
              this.valueChangeListenerIds.push(listenerId);
            } catch (e) {
            }
          }
        }
        destroy() {
          if (!this.removeValueChangeListener) return;
          for (const listenerId of this.valueChangeListenerIds) {
            try {
              this.removeValueChangeListener(listenerId);
            } catch (e) {
            }
          }
          this.valueChangeListenerIds.length = 0;
        }
      };
    }
  });

/* ════════════════════════════════════════════════════════════ */
/*                MÓDULO: src/core/metrics.js                 */
/* ════════════════════════════════════════════════════════════ */
  var ViewportMetricsService;
  var init_metrics = __esm({
    "src/core/metrics.js"() {
      init_constants();
      ViewportMetricsService = class {
        /**
         * @param {Object} [dependencies]
         * @param {Window} [dependencies.windowProvider] - Objeto window global o mock.
         * @param {Screen} [dependencies.screenProvider] - Objeto screen global o mock.
         */
        constructor(dependencies = {}) {
          this.windowProvider = dependencies.windowProvider || (typeof window !== "undefined" ? window : null);
          this.screenProvider = dependencies.screenProvider || (typeof screen !== "undefined" ? screen : null);
          this.THRESHOLD_BOUNDARIES = Object.freeze([0.2, 0.4, 0.6, 0.8]);
          this.activeThresholdBand = -1;
        }
        /**
         * Detecta si el usuario está realizando un gesto de pinch-zoom táctil nativo.
         * @returns {boolean} True si hay un pinch-zoom activo.
         */
        isPinchZoomActive() {
          try {
            const win = this.windowProvider;
            if (win && win.visualViewport && typeof win.visualViewport.scale === "number") {
              return Math.abs(win.visualViewport.scale - 1) > 0.05;
            }
          } catch (e) {
          }
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
          } catch (e) {
          }
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
          } catch (e) {
          }
          return 0;
        }
        /**
         * Obtiene el ancho válido del viewport navegando entre fuentes de respaldo.
         * @returns {number} Ancho en píxeles.
         */
        getValidViewportWidth() {
          try {
            const win = this.windowProvider;
            const docElement = win && win.document && win.document.documentElement ? win.document.documentElement : null;
            const docBody = win && win.document && win.document.body ? win.document.body : null;
            if (win && win.innerWidth && win.innerWidth > 0) return win.innerWidth;
            if (docElement && docElement.clientWidth > 0) return docElement.clientWidth;
            if (docBody && docBody.clientWidth > 0) return docBody.clientWidth;
            if (win && win.screen && win.screen.width > 0) return win.screen.width;
          } catch (e) {
          }
          return 0;
        }
        /**
         * Obtiene la altura válida del viewport.
         * @returns {number} Altura en píxeles.
         */
        getValidViewportHeight() {
          try {
            const win = this.windowProvider;
            const docElement = win && win.document && win.document.documentElement ? win.document.documentElement : null;
            if (win && win.innerHeight && win.innerHeight > 0) return win.innerHeight;
            if (docElement && docElement.clientHeight > 0) return docElement.clientHeight;
          } catch (e) {
          }
          return 0;
        }
        calculateReferenceBaseWidth(currentViewportWidthPx, referenceBaseWidthSetting, screenWidthPx) {
          try {
            const setting = referenceBaseWidthSetting;
            if (typeof setting === "number" && setting > 0) return setting;
            const screenWidth = screenWidthPx || this.getScreenWidth();
            return screenWidth > 0 ? Math.max(currentViewportWidthPx || 0, screenWidth) : currentViewportWidthPx || 1920;
          } catch (e) {
            return 1920;
          }
        }
        computeZoomScaleFactor(currentViewportWidthPx, referenceBaseWidthPx, config) {
          const ratio = currentViewportWidthPx / referenceBaseWidthPx;
          let computedScale = 1;
          if (config.scalingMode === SCALING_MODES.THRESHOLDS) {
            if (this.activeThresholdBand < 0) {
              this.activeThresholdBand = ratio < 0.2 ? 0 : ratio < 0.4 ? 1 : ratio < 0.6 ? 2 : ratio < 0.8 ? 3 : 4;
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
            computedScale = ratio >= 1 ? Math.min(1, config.maximumZoomScaleLimit) : ratio;
          }
          return Math.max(config.minimumZoomScaleLimit, Math.min(config.maximumZoomScaleLimit, computedScale));
        }
      };
    }
  });

/* ════════════════════════════════════════════════════════════ */
/*               MÓDULO: src/core/splitview.js                */
/* ════════════════════════════════════════════════════════════ */
  var SplitViewDetectorService;
  var init_splitview = __esm({
    "src/core/splitview.js"() {
      init_constants();
      SplitViewDetectorService = class {
        /**
         * @param {Object} [dependencies]
         * @param {Object} [dependencies.viewportMetrics] - Instancia de ViewportMetricsService.
         * @param {Window} [dependencies.windowProvider] - Referencia a window global.
         */
        constructor(dependencies = {}) {
          this.metrics = dependencies.viewportMetrics || null;
          this.windowProvider = dependencies.windowProvider || (typeof window !== "undefined" ? window : null);
        }
        /**
         * Evalúa la disposición actual del viewport y determina si la ventana/pestaña se encuentra en vista dividida.
         * @returns {Object} Diagnóstico de vista dividida.
         */
        detectSplitView() {
          try {
            const win = this.windowProvider;
            if (!win) return { isSplitView: false, ratio: 1, mode: "full" };
            const viewportWidth = this.metrics ? this.metrics.getValidViewportWidth() : win.innerWidth || 1920;
            const viewportHeight = this.metrics ? this.metrics.getValidViewportHeight() : win.innerHeight || 1080;
            const screenWidth = this.metrics ? this.metrics.getScreenWidth() : win.screen ? win.screen.availWidth || win.screen.width : 1920;
            const screenHeight = this.metrics ? this.metrics.getScreenHeight() : win.screen ? win.screen.availHeight || win.screen.height : 1080;
            if (!screenWidth || !viewportWidth) {
              return { isSplitView: false, ratio: 1, mode: "full" };
            }
            const viewportToScreenRatio = viewportWidth / screenWidth;
            const isLandscapeMonitor = screenWidth >= screenHeight;
            const isPortraitViewport = isLandscapeMonitor && viewportWidth / viewportHeight <= 1.05;
            let outerRatio = 1;
            if (win.outerWidth && Number.isFinite(win.outerWidth) && win.outerWidth > 0) {
              outerRatio = win.outerWidth / screenWidth;
            }
            const isRatioSplit = viewportToScreenRatio <= SPLIT_VIEW_THRESHOLD_RATIO || outerRatio <= 0.68;
            const isSplitView = isRatioSplit || isPortraitViewport;
            let mode = "full";
            if (isSplitView) {
              if (viewportToScreenRatio <= 0.4) mode = "snap_third";
              else if (viewportToScreenRatio <= 0.65) mode = "snap_half";
              else mode = "side_by_side";
            }
            return {
              isSplitView,
              ratio: viewportToScreenRatio,
              mode,
              isPortraitViewport
            };
          } catch (e) {
            return { isSplitView: false, ratio: 1, mode: "full" };
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
              return Math.max(1, config.maximumZoomScaleLimit);
            case SPLIT_VIEW_BEHAVIORS.RESET_NATIVE:
              return 1;
            case SPLIT_VIEW_BEHAVIORS.SHRINK_STANDARD:
            default:
              return standardComputedScale;
          }
        }
      };
    }
  });

/* ════════════════════════════════════════════════════════════ */
/*              MÓDULO: src/core/environment.js               */
/* ════════════════════════════════════════════════════════════ */
  var BrowserEnvironmentService;
  var init_environment = __esm({
    "src/core/environment.js"() {
      BrowserEnvironmentService = class {
        /**
         * @param {Object} [dependencies]
         * @param {Window} [dependencies.windowProvider] - Instancia global de window.
         * @param {Document} [dependencies.documentProvider] - Instancia global de document.
         */
        constructor(dependencies = {}) {
          this.windowProvider = dependencies.windowProvider || (typeof window !== "undefined" ? window : null);
          this.documentProvider = dependencies.documentProvider || (typeof document !== "undefined" ? document : null);
        }
        /**
         * Identifica el motor nativo del navegador para aplicar optimizaciones específicas.
         * @returns {string} 'gecko' (Firefox), 'blink' (Chrome/Edge/Brave) o 'generic'.
         */
        detectNativeBrowserEngine() {
          try {
            const win = this.windowProvider;
            const userAgent = win && win.navigator && win.navigator.userAgent ? win.navigator.userAgent.toLowerCase() : "";
            if (userAgent.includes("firefox") || userAgent.includes("gecko/")) return "gecko";
            if (userAgent.includes("chrome") || userAgent.includes("chromium") || userAgent.includes("edg/")) return "blink";
          } catch (e) {
          }
          return "generic";
        }
        /**
         * Verifica si el documento o algún elemento está en pantalla completa nativa.
         * @returns {boolean} True si está en pantalla completa.
         */
        isDocumentInFullscreenMode() {
          try {
            const doc = this.documentProvider;
            if (!doc) return false;
            return !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
          } catch (e) {
            return false;
          }
        }
      };
    }
  });

/* ════════════════════════════════════════════════════════════ */
/*                MÓDULO: src/core/pointer.js                 */
/* ════════════════════════════════════════════════════════════ */
  var PointerPrecisionService;
  var init_pointer = __esm({
    "src/core/pointer.js"() {
      init_constants();
      PointerPrecisionService = class {
        /**
         * @param {Object} [dependencies]
         * @param {Window} [dependencies.windowProvider] - Objeto window global.
         * @param {Document} [dependencies.documentProvider] - Objeto document global.
         * @param {Object} [dependencies.unsafeWindowProvider] - Contexto de ventana de la página para Object.defineProperty.
         */
        constructor(dependencies = {}) {
          this.windowProvider = dependencies.windowProvider || (typeof window !== "undefined" ? window : null);
          this.documentProvider = dependencies.documentProvider || (typeof document !== "undefined" ? document : null);
          this.unsafeWindowProvider = dependencies.unsafeWindowProvider || (typeof unsafeWindow !== "undefined" ? unsafeWindow : null);
          this.MEDIA_POINTER_EVENT_TYPES = Object.freeze([
            "pointerdown",
            "pointermove",
            "pointerup",
            "pointerover",
            "pointerout",
            "pointercancel",
            "mousedown",
            "mousemove",
            "mouseup",
            "mouseover",
            "mouseout",
            "click"
          ]);
          this.MEDIA_PLAYER_SELECTOR = [
            "video",
            "audio",
            ".html5-video-player",
            ".video-js",
            ".vjs-player",
            ".jwplayer",
            ".plyr",
            ".mejs__container",
            ".shaka-video-container",
            "#html5_video_wrapper",
            "#video-player-bg",
            "#xv-player",
            ".video-bg-pic",
            "#player",
            "#main-container",
            ".player-container",
            ".video-wrapper",
            ".mgp_container",
            ".mhp1",
            '[id*="player" i]',
            '[class*="player" i]',
            '[class*="video-player"]',
            '[class*="videoPlayer"]',
            '[class*="media-player"]',
            '[class*="mediaPlayer"]',
            '[class*="watch-video"]',
            "[data-video-player]",
            "[data-player-id]",
            '[data-testid*="video-player"]'
          ].join(",");
          this.MEDIA_CONTROL_SELECTOR = [
            '[class*="seek" i]',
            '[class*="progress" i]',
            '[class*="timeline" i]',
            '[class*="seekBar" i]',
            '[class*="progressBar" i]',
            '[class*="slider" i]',
            ".mgp_seekBar",
            ".mgp_progressBar",
            ".mhp1_seekBar",
            ".mhp1_progressBar",
            ".noUi-target",
            ".noUi-base",
            '[role="slider"]'
          ].join(",");
          this.MEDIA_TIMELINE_SELECTOR = [
            ".ytp-progress-bar-container",
            ".vjs-progress-holder",
            ".jw-slider-time",
            ".plyr__progress",
            ".mejs__time-rail",
            ".shaka-seek-bar-container",
            ".mgp_seekBar",
            ".mgp_progressBar",
            ".mhp1_seekBar",
            ".mhp1_progressBar",
            ".noUi-target",
            ".noUi-base",
            ".progress-bar",
            '[class*="seek-bar" i]',
            '[class*="seekbar" i]',
            '[class*="seekBar" i]',
            '[class*="progress-bar" i]',
            '[class*="progressBar" i]',
            '[class*="timeline" i]',
            '[class*="slider" i]',
            '[role="slider"]'
          ].join(",");
          this.MEDIA_PLAYER_CONTAINER_SELECTOR = [
            ".html5-video-player",
            ".video-js",
            ".vjs-player",
            ".jwplayer",
            ".plyr",
            ".mejs__container",
            ".shaka-video-container",
            "#html5_video_wrapper",
            "#video-player-bg",
            "#xv-player",
            "#player",
            "#main-container",
            ".player-container",
            ".video-wrapper",
            ".mgp_container",
            ".mhp1",
            '[id*="player" i]',
            '[class*="player" i]',
            '[class*="video-player"]',
            '[class*="videoPlayer"]',
            '[class*="media-player"]',
            '[class*="mediaPlayer"]',
            '[class*="watch-video"]',
            "[data-video-player]",
            '[data-testid*="video-player"]'
          ].join(",");
          this.MEDIA_TOOLTIP_SELECTOR = [
            ".ytp-tooltip",
            ".vjs-mouse-display",
            ".vjs-time-tooltip",
            ".jw-slider-time .jw-tooltip",
            ".jw-tooltip-time",
            ".plyr__tooltip",
            ".mejs__time-float",
            ".shaka-current-time",
            ".mgp_tooltip",
            ".mgp_preview",
            ".mhp1_tooltip",
            ".mhp1_preview",
            ".noUi-tooltip",
            ".time-tooltip",
            ".video-pic",
            ".thumb",
            ".duration",
            ".time",
            ".timestamp",
            ".time-tag",
            '[class*="time-tooltip" i]',
            '[class*="seek-tooltip" i]',
            '[class*="progress-tooltip" i]',
            '[class*="preview-time" i]',
            '[class*="tooltip" i]',
            '[class*="duration" i]',
            '[class*="time-tag" i]'
          ].join(",");
          this.MEDIA_PORTAL_TOOLTIP_SELECTOR = [
            ".ytp-tooltip",
            ".vjs-mouse-display",
            ".vjs-time-tooltip",
            ".jw-tooltip-time",
            ".plyr__tooltip",
            ".mejs__time-float",
            ".mgp_tooltip",
            ".mgp_preview",
            ".mhp1_tooltip",
            ".mhp1_preview",
            ".noUi-tooltip",
            '[class*="time-tooltip" i]',
            '[class*="seek-tooltip" i]',
            '[class*="progress-tooltip" i]',
            '[class*="preview-time" i]',
            '[class*="tooltip" i]'
          ].join(",");
          this.isNativeZoomSupportedCache = null;
          this.hasLoggedUnsupportedZoom = false;
          this.isMediaPointerPrecisionEnabled = true;
          this.isPointerCorrectionInitialized = false;
          this.activeScaleFactor = 1;
          this.mediaTargetCache = /* @__PURE__ */ new WeakMap();
          this.correctionModeCache = /* @__PURE__ */ new WeakMap();
          this.hoverCoordinateModeCache = /* @__PURE__ */ new WeakMap();
          this.mediaTooltipCandidateCache = /* @__PURE__ */ new WeakMap();
          this.tooltipAnalysisFrameRequestId = null;
          this.pendingTooltipPointerX = 0;
          this.pendingTooltipPointerY = 0;
          this.pendingTooltipPlayerRoot = null;
          this.pendingTooltipTimelineControl = null;
          this.definePageEventProperty = Object.defineProperty;
          try {
            if (this.unsafeWindowProvider && this.unsafeWindowProvider.Object && typeof this.unsafeWindowProvider.Object.defineProperty === "function") {
              this.definePageEventProperty = this.unsafeWindowProvider.Object.defineProperty;
            }
          } catch (e) {
          }
          this.boundCorrectMediaPointerEvent = this.correctMediaPointerEvent.bind(this);
          this.boundAnalyzePendingMediaTooltip = this.analyzePendingMediaTooltip.bind(this);
        }
        isNativeZoomSupported(rootElement) {
          if (this.isNativeZoomSupportedCache !== null) return this.isNativeZoomSupportedCache;
          try {
            const doc = this.documentProvider;
            const styleDeclaration = rootElement && rootElement.style ? rootElement.style : doc ? doc.createElement("div").style : {};
            const hasStyleProperty = "zoom" in styleDeclaration;
            const passesFeatureQuery = typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports("zoom", "1");
            this.isNativeZoomSupportedCache = hasStyleProperty && passesFeatureQuery;
          } catch (e) {
            this.isNativeZoomSupportedCache = false;
          }
          return this.isNativeZoomSupportedCache;
        }
        normalizeScale(scaleFactor) {
          if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return 1;
          return Math.round(scaleFactor * SCALE_DECIMAL_FACTOR) / SCALE_DECIMAL_FACTOR;
        }
        formatScale(normalizedScaleFactor) {
          return normalizedScaleFactor.toFixed(6);
        }
        readInlineScale(rootElement) {
          if (!rootElement || !rootElement.style) return NaN;
          return parseFloat(rootElement.style.getPropertyValue("zoom"));
        }
        isScaleSynchronized(rootElement, expectedScaleFactor) {
          const currentScaleFactor = this.readInlineScale(rootElement);
          return Number.isFinite(currentScaleFactor) && Math.abs(currentScaleFactor - expectedScaleFactor) <= SCALE_SYNCHRONIZATION_EPSILON && rootElement.style.getPropertyPriority("zoom") === "important";
        }
        applyNativeScale(rootElement, normalizedScaleFactor, zoomScaleString) {
          if (!rootElement || !rootElement.style) return false;
          if (!this.isNativeZoomSupported(rootElement)) {
            if (!this.hasLoggedUnsupportedZoom) {
              this.hasLoggedUnsupportedZoom = true;
              console.warn("[Auto-Shrink] El navegador no admite CSS zoom nativo; se conserva escala 1:1 para no desalinear el puntero.");
            }
            return false;
          }
          if (rootElement.style.getPropertyValue("--auto-shrink-scale") !== zoomScaleString) {
            rootElement.style.setProperty("--auto-shrink-scale", zoomScaleString);
          }
          if (!this.isScaleSynchronized(rootElement, normalizedScaleFactor)) {
            rootElement.style.setProperty("zoom", zoomScaleString, "important");
          }
          this.activeScaleFactor = normalizedScaleFactor;
          if (Math.abs(this.activeScaleFactor - 1) <= SCALE_SYNCHRONIZATION_EPSILON) {
            this.hoverCoordinateModeCache = /* @__PURE__ */ new WeakMap();
          }
          return true;
        }
        setMediaPointerPrecisionEnabled(isEnabled) {
          this.isMediaPointerPrecisionEnabled = !!isEnabled;
          if (!this.isMediaPointerPrecisionEnabled) this.hoverCoordinateModeCache = /* @__PURE__ */ new WeakMap();
        }
        isMediaInteractionTarget(targetElement) {
          if (!targetElement || targetElement.nodeType !== Node.ELEMENT_NODE || typeof targetElement.closest !== "function") return false;
          if (this.mediaTargetCache.has(targetElement)) return this.mediaTargetCache.get(targetElement);
          let isMediaTarget = false;
          try {
            isMediaTarget = !!targetElement.closest(this.MEDIA_PLAYER_SELECTOR);
            if (!isMediaTarget && targetElement.closest(this.MEDIA_CONTROL_SELECTOR)) {
              let ancestor = targetElement;
              for (let depth = 0; ancestor && depth < 8; depth++, ancestor = ancestor.parentElement) {
                if (ancestor.querySelector && ancestor.querySelector("video, audio")) {
                  isMediaTarget = true;
                  break;
                }
              }
            }
          } catch (e) {
          }
          this.mediaTargetCache.set(targetElement, isMediaTarget);
          return isMediaTarget;
        }
        detectOffsetCorrectionMode(targetElement, pointerEvent) {
          const cachedMode = this.correctionModeCache.get(targetElement);
          if (cachedMode && Math.abs(cachedMode.scaleFactor - this.activeScaleFactor) <= SCALE_SYNCHRONIZATION_EPSILON) {
            return cachedMode.shouldCorrect;
          }
          try {
            const layoutWidth = targetElement.offsetWidth;
            if (!layoutWidth) return false;
            const rect = targetElement.getBoundingClientRect();
            if (!rect.width) return false;
            const measuredScaleFactor = rect.width / layoutWidth;
            const permittedScaleDeviation = Math.max(0.02, this.activeScaleFactor * 0.08);
            if (Math.abs(measuredScaleFactor - this.activeScaleFactor) > permittedScaleDeviation) return false;
            const visualOffsetX = pointerEvent.clientX - rect.left;
            const logicalOffsetX = visualOffsetX / this.activeScaleFactor;
            const coordinateSeparation = Math.abs(logicalOffsetX - visualOffsetX);
            if (coordinateSeparation < 0.75) return false;
            const nativeOffsetX = pointerEvent.offsetX;
            const distanceToVisualCoordinates = Math.abs(nativeOffsetX - visualOffsetX);
            const distanceToLogicalCoordinates = Math.abs(nativeOffsetX - logicalOffsetX);
            const shouldCorrect = distanceToVisualCoordinates + 0.25 < distanceToLogicalCoordinates;
            this.correctionModeCache.set(targetElement, {
              scaleFactor: this.activeScaleFactor,
              shouldCorrect
            });
            return shouldCorrect;
          } catch (e) {
            return false;
          }
        }
        defineCorrectedEventCoordinate(pointerEvent, propertyName, correctedValue) {
          if (!Number.isFinite(correctedValue)) return;
          try {
            this.definePageEventProperty(pointerEvent, propertyName, {
              configurable: true,
              enumerable: true,
              value: correctedValue
            });
          } catch (e) {
          }
        }
        findMediaPlayerRoot(targetElement) {
          try {
            const knownContainer = targetElement.closest(this.MEDIA_PLAYER_CONTAINER_SELECTOR);
            if (knownContainer) return knownContainer;
            const nativeMediaElement = targetElement.closest("video, audio");
            if (nativeMediaElement) return nativeMediaElement.parentElement || nativeMediaElement;
            let ancestor = targetElement;
            for (let depth = 0; ancestor && depth < 8; depth++, ancestor = ancestor.parentElement) {
              if (ancestor.querySelector && ancestor.querySelector("video, audio")) return ancestor;
            }
          } catch (e) {
          }
          return null;
        }
        isVisibleTimeTooltip(candidateElement, playerRect) {
          try {
            const rect = candidateElement.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return false;
            if (rect.bottom < playerRect.top - 240 || rect.top > playerRect.bottom + 240) return false;
            const win = this.windowProvider;
            const computedStyle = win ? win.getComputedStyle(candidateElement) : candidateElement.style;
            if (computedStyle.display === "none" || computedStyle.visibility === "hidden" || parseFloat(computedStyle.opacity) === 0) return false;
            const text = candidateElement.textContent || "";
            return /\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/.test(text);
          } catch (e) {
            return false;
          }
        }
        findBestMediaTooltip(playerRoot, playerRect) {
          const cachedCandidate = this.mediaTooltipCandidateCache.get(playerRoot);
          if (cachedCandidate && cachedCandidate.isConnected && this.isVisibleTimeTooltip(cachedCandidate, playerRect)) {
            return cachedCandidate;
          }
          let bestCandidate = null;
          let bestScore = Infinity;
          let localCandidates = [];
          try {
            localCandidates = playerRoot.querySelectorAll(this.MEDIA_TOOLTIP_SELECTOR);
          } catch (e) {
          }
          for (const candidate of localCandidates) {
            if (!this.isVisibleTimeTooltip(candidate, playerRect)) continue;
            const rect = candidate.getBoundingClientRect();
            const verticalDistance = Math.abs((rect.top + rect.bottom) / 2 - this.pendingTooltipPointerY);
            const isKnownPositioningContainer = candidate.matches(
              ".ytp-tooltip, .vjs-mouse-display, .jw-tooltip, .plyr__tooltip, .mejs__time-float, .shaka-current-time"
            );
            const score = verticalDistance + (isKnownPositioningContainer ? 0 : 100);
            if (score < bestScore) {
              bestScore = score;
              bestCandidate = candidate;
            }
          }
          if (!bestCandidate && this.documentProvider) {
            let portalCandidates = [];
            try {
              portalCandidates = this.documentProvider.querySelectorAll(this.MEDIA_PORTAL_TOOLTIP_SELECTOR);
            } catch (e) {
            }
            for (const candidate of portalCandidates) {
              if (!this.isVisibleTimeTooltip(candidate, playerRect)) continue;
              const rect = candidate.getBoundingClientRect();
              const score = Math.abs((rect.top + rect.bottom) / 2 - this.pendingTooltipPointerY);
              if (score < bestScore) {
                bestScore = score;
                bestCandidate = candidate;
              }
            }
          }
          if (bestCandidate) this.mediaTooltipCandidateCache.set(playerRoot, bestCandidate);
          return bestCandidate;
        }
        findMediaTimelineControl(targetElement, playerRoot) {
          try {
            const directControl = targetElement.closest(this.MEDIA_TIMELINE_SELECTOR);
            if (directControl && directControl.offsetWidth > 0) return directControl;
            const knownControl = playerRoot.querySelector(this.MEDIA_TIMELINE_SELECTOR);
            if (knownControl && knownControl.offsetWidth > 0) return knownControl;
          } catch (e) {
          }
          return null;
        }
        getTimelineEffectiveZoom(timelineControl, timelineRect) {
          try {
            const currentCssZoom = Number(timelineControl.currentCSSZoom);
            if (Number.isFinite(currentCssZoom) && currentCssZoom > 0) return currentCssZoom;
          } catch (e) {
          }
          const layoutWidth = timelineControl.offsetWidth;
          if (timelineRect && timelineRect.width > 0 && layoutWidth > 0) {
            return timelineRect.width / layoutWidth;
          }
          return this.activeScaleFactor;
        }
        parseTimeTextToSeconds(text) {
          const match = String(text || "").match(/-?\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/);
          if (!match) return NaN;
          const isNegative = match[0].startsWith("-");
          const parts = match[0].replace("-", "").split(":").map(Number);
          let seconds = 0;
          for (const part of parts) seconds = seconds * 60 + part;
          return isNegative ? -seconds : seconds;
        }
        getMediaDurationSeconds(playerRoot) {
          try {
            const mediaElement = playerRoot.matches("video, audio") ? playerRoot : playerRoot.querySelector("video, audio");
            if (mediaElement && Number.isFinite(mediaElement.duration) && mediaElement.duration > 0) {
              return mediaElement.duration;
            }
            const timeMatches = String(playerRoot.textContent || "").match(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/g) || [];
            let longestTime = 0;
            for (const timeText of timeMatches) {
              const seconds = this.parseTimeTextToSeconds(timeText);
              if (Number.isFinite(seconds)) longestTime = Math.max(longestTime, seconds);
            }
            return longestTime || NaN;
          } catch (e) {
            return NaN;
          }
        }
        analyzePendingMediaTooltip() {
          this.tooltipAnalysisFrameRequestId = null;
          const playerRoot = this.pendingTooltipPlayerRoot;
          const timelineControl = this.pendingTooltipTimelineControl;
          if (!playerRoot || !timelineControl || !playerRoot.isConnected || !timelineControl.isConnected) return;
          try {
            const playerRect = playerRoot.getBoundingClientRect();
            const timelineRect = timelineControl.getBoundingClientRect();
            if (!timelineRect.width || !timelineControl.offsetWidth) return;
            const effectiveZoom = this.getTimelineEffectiveZoom(timelineControl, timelineRect);
            const existingCorrectionMode = this.hoverCoordinateModeCache.get(timelineControl);
            if (existingCorrectionMode && Math.abs(existingCorrectionMode.scaleFactor - effectiveZoom) <= SCALE_SYNCHRONIZATION_EPSILON) return;
            const tooltipElement = this.findBestMediaTooltip(playerRoot, playerRect);
            if (!tooltipElement) return;
            const visualRatio = Math.max(0, Math.min(1, (this.pendingTooltipPointerX - timelineRect.left) / timelineRect.width));
            const uncorrectedLayoutRatio = Math.max(0, Math.min(1, (this.pendingTooltipPointerX - timelineRect.left) / timelineControl.offsetWidth));
            let shouldCorrectClientCoordinates = false;
            let hasReliableDiagnosis = false;
            const tooltipTimeSeconds = this.parseTimeTextToSeconds(tooltipElement.textContent);
            const durationSeconds = this.getMediaDurationSeconds(playerRoot);
            if (Number.isFinite(tooltipTimeSeconds) && Number.isFinite(durationSeconds) && durationSeconds > 0) {
              const absoluteTooltipSeconds = Math.abs(tooltipTimeSeconds);
              const tooltipRatio = Math.max(0, Math.min(
                1,
                tooltipTimeSeconds < 0 ? 1 - absoluteTooltipSeconds / durationSeconds : absoluteTooltipSeconds / durationSeconds
              ));
              const distanceToVisualRatio = Math.abs(tooltipRatio - visualRatio);
              const distanceToUncorrectedRatio = Math.abs(tooltipRatio - uncorrectedLayoutRatio);
              if (Math.abs(distanceToVisualRatio - distanceToUncorrectedRatio) > 0.025) {
                shouldCorrectClientCoordinates = distanceToUncorrectedRatio < distanceToVisualRatio;
                hasReliableDiagnosis = true;
              }
            }
            if (!hasReliableDiagnosis) {
              const tooltipRect = tooltipElement.getBoundingClientRect();
              const tooltipCenterX = (tooltipRect.left + tooltipRect.right) / 2;
              const predictedUncorrectedCenterX = timelineRect.left + (this.pendingTooltipPointerX - timelineRect.left) * effectiveZoom;
              const distanceToPointer = Math.abs(tooltipCenterX - this.pendingTooltipPointerX);
              const distanceToUncorrectedPosition = Math.abs(tooltipCenterX - predictedUncorrectedCenterX);
              if (Math.abs(distanceToPointer - distanceToUncorrectedPosition) > 4) {
                shouldCorrectClientCoordinates = distanceToUncorrectedPosition < distanceToPointer;
                hasReliableDiagnosis = true;
              }
            }
            if (hasReliableDiagnosis) {
              this.hoverCoordinateModeCache.set(timelineControl, {
                scaleFactor: effectiveZoom,
                shouldCorrect: shouldCorrectClientCoordinates
              });
            }
          } catch (e) {
          }
        }
        scheduleMediaTooltipAnalysis(pointerEvent, playerRoot, timelineControl, nativeClientX) {
          this.pendingTooltipPointerX = nativeClientX;
          this.pendingTooltipPointerY = pointerEvent.clientY;
          this.pendingTooltipPlayerRoot = playerRoot;
          this.pendingTooltipTimelineControl = timelineControl;
          if (this.tooltipAnalysisFrameRequestId === null && this.windowProvider) {
            this.tooltipAnalysisFrameRequestId = this.windowProvider.requestAnimationFrame(this.boundAnalyzePendingMediaTooltip);
          }
        }
        isMediaHoverEvent(eventType) {
          return eventType === "pointermove" || eventType === "mousemove" || eventType === "pointerover" || eventType === "mouseover";
        }
        applyHoverClientCoordinateCorrection(pointerEvent, timelineControl, nativeClientX) {
          const correctionMode = this.hoverCoordinateModeCache.get(timelineControl);
          if (!correctionMode || !correctionMode.shouldCorrect) return;
          try {
            const rect = timelineControl.getBoundingClientRect();
            if (!rect.width || !timelineControl.offsetWidth) return;
            const effectiveZoom = this.getTimelineEffectiveZoom(timelineControl, rect);
            if (Math.abs(correctionMode.scaleFactor - effectiveZoom) > SCALE_SYNCHRONIZATION_EPSILON) {
              correctionMode.scaleFactor = effectiveZoom;
            }
            const correctedClientX = rect.left + (nativeClientX - rect.left) / effectiveZoom;
            const correctionDeltaX = correctedClientX - nativeClientX;
            const nativePageX = pointerEvent.pageX;
            this.defineCorrectedEventCoordinate(pointerEvent, "clientX", correctedClientX);
            this.defineCorrectedEventCoordinate(pointerEvent, "x", correctedClientX);
            this.defineCorrectedEventCoordinate(pointerEvent, "pageX", nativePageX + correctionDeltaX);
          } catch (e) {
          }
        }
        correctMediaPointerEvent(pointerEvent) {
          if (!this.isMediaPointerPrecisionEnabled || Math.abs(this.activeScaleFactor - 1) <= SCALE_SYNCHRONIZATION_EPSILON) return;
          const targetElement = pointerEvent.target;
          if (!this.isMediaInteractionTarget(targetElement)) return;
          const nativeClientX = pointerEvent.clientX;
          if (this.detectOffsetCorrectionMode(targetElement, pointerEvent)) {
            const inverseScaleFactor = 1 / this.activeScaleFactor;
            this.defineCorrectedEventCoordinate(pointerEvent, "offsetX", pointerEvent.offsetX * inverseScaleFactor);
            this.defineCorrectedEventCoordinate(pointerEvent, "offsetY", pointerEvent.offsetY * inverseScaleFactor);
            this.defineCorrectedEventCoordinate(pointerEvent, "movementX", pointerEvent.movementX * inverseScaleFactor);
            this.defineCorrectedEventCoordinate(pointerEvent, "movementY", pointerEvent.movementY * inverseScaleFactor);
          }
          if (this.isMediaHoverEvent(pointerEvent.type)) {
            const playerRoot = this.findMediaPlayerRoot(targetElement);
            if (!playerRoot) return;
            const timelineControl = this.findMediaTimelineControl(targetElement, playerRoot);
            if (!timelineControl) return;
            this.applyHoverClientCoordinateCorrection(pointerEvent, timelineControl, nativeClientX);
            this.scheduleMediaTooltipAnalysis(pointerEvent, playerRoot, timelineControl, nativeClientX);
          }
        }
        initializePointerCorrection() {
          if (this.isPointerCorrectionInitialized || !this.windowProvider) return;
          this.isPointerCorrectionInitialized = true;
          for (const eventType of this.MEDIA_POINTER_EVENT_TYPES) {
            this.windowProvider.addEventListener(eventType, this.boundCorrectMediaPointerEvent, { capture: true, passive: true });
          }
        }
        destroy() {
          if (this.tooltipAnalysisFrameRequestId !== null && this.windowProvider) {
            this.windowProvider.cancelAnimationFrame(this.tooltipAnalysisFrameRequestId);
            this.tooltipAnalysisFrameRequestId = null;
          }
          if (this.isPointerCorrectionInitialized && this.windowProvider) {
            for (const eventType of this.MEDIA_POINTER_EVENT_TYPES) {
              this.windowProvider.removeEventListener(eventType, this.boundCorrectMediaPointerEvent, true);
            }
          }
          this.isPointerCorrectionInitialized = false;
          this.activeScaleFactor = 1;
          this.mediaTargetCache = /* @__PURE__ */ new WeakMap();
          this.correctionModeCache = /* @__PURE__ */ new WeakMap();
          this.hoverCoordinateModeCache = /* @__PURE__ */ new WeakMap();
          this.mediaTooltipCandidateCache = /* @__PURE__ */ new WeakMap();
          this.pendingTooltipPlayerRoot = null;
          this.pendingTooltipTimelineControl = null;
        }
      };
    }
  });

/* ════════════════════════════════════════════════════════════ */
/*                 MÓDULO: src/core/scroll.js                 */
/* ════════════════════════════════════════════════════════════ */
  var ScrollSynchronizationService;
  var init_scroll = __esm({
    "src/core/scroll.js"() {
      ScrollSynchronizationService = class {
        /**
         * @param {Object} [dependencies]
         * @param {Object} [dependencies.pointerService] - Instancia de PointerPrecisionService.
         * @param {Window} [dependencies.windowProvider] - Objeto window global.
         * @param {Document} [dependencies.documentProvider] - Objeto document global.
         */
        constructor(dependencies = {}) {
          this.pointerService = dependencies.pointerService || null;
          this.windowProvider = dependencies.windowProvider || (typeof window !== "undefined" ? window : null);
          this.documentProvider = dependencies.documentProvider || (typeof document !== "undefined" ? document : null);
          this.isInitialized = false;
          this.frameRequestId = null;
          this.lastScrollY = -1;
          this.lastScrollX = -1;
          this.boundSynchronizeScrollMetrics = this.synchronizeScrollMetrics.bind(this);
          this.boundOnScrollHandler = this.onScrollHandler.bind(this);
        }
        synchronizeScrollMetrics() {
          this.frameRequestId = null;
          const doc = this.documentProvider;
          const win = this.windowProvider;
          if (!doc || doc.hidden) return;
          try {
            const rootElement = doc.documentElement;
            if (!rootElement) return;
            const currentScrollY = win && win.scrollY || rootElement.scrollTop || 0;
            const currentScrollX = win && win.scrollX || rootElement.scrollLeft || 0;
            if (Math.abs(currentScrollY - this.lastScrollY) < 0.5 && Math.abs(currentScrollX - this.lastScrollX) < 0.5) {
              return;
            }
            this.lastScrollY = currentScrollY;
            this.lastScrollX = currentScrollX;
            const scale = (this.pointerService ? this.pointerService.readInlineScale(rootElement) : parseFloat(rootElement.style.getPropertyValue("zoom"))) || 1;
            const visualScrollY = Math.round(currentScrollY / scale);
            const visualScrollX = Math.round(currentScrollX / scale);
            rootElement.style.setProperty("--auto-shrink-scroll-top", `${currentScrollY}px`);
            rootElement.style.setProperty("--auto-shrink-scroll-left", `${currentScrollX}px`);
            rootElement.style.setProperty("--auto-shrink-visual-scroll-top", `${visualScrollY}px`);
            rootElement.style.setProperty("--auto-shrink-visual-scroll-left", `${visualScrollX}px`);
            rootElement.style.setProperty("--auto-shrink-effective-scale", String(scale));
          } catch (e) {
          }
        }
        onScrollHandler() {
          if (this.frameRequestId === null && this.windowProvider) {
            this.frameRequestId = this.windowProvider.requestAnimationFrame(this.boundSynchronizeScrollMetrics);
          }
        }
        initialize() {
          if (this.isInitialized || !this.windowProvider) return;
          this.isInitialized = true;
          this.windowProvider.addEventListener("scroll", this.boundOnScrollHandler, { capture: true, passive: true });
          this.synchronizeScrollMetrics();
        }
        destroy() {
          if (!this.isInitialized) return;
          this.isInitialized = false;
          if (this.frameRequestId !== null && this.windowProvider) {
            this.windowProvider.cancelAnimationFrame(this.frameRequestId);
            this.frameRequestId = null;
          }
          if (this.windowProvider) {
            this.windowProvider.removeEventListener("scroll", this.boundOnScrollHandler, true);
          }
        }
      };
    }
  });

/* ════════════════════════════════════════════════════════════ */
/*                 MÓDULO: src/core/engine.js                 */
/* ════════════════════════════════════════════════════════════ */
  var ZoomExecutionEngine;
  var init_engine = __esm({
    "src/core/engine.js"() {
      init_constants();
      ZoomExecutionEngine = class {
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
          this.windowProvider = dependencies.windowProvider || (typeof window !== "undefined" ? window : null);
          this.documentProvider = dependencies.documentProvider || (typeof document !== "undefined" ? document : null);
          this.isAnimationFrameScheduled = false;
          this.isForcedApplicationPending = false;
          this.animationFrameRequestId = null;
          this.styleMutationObserver = null;
          this.lastAppliedZoomScaleString = null;
          this.lastAppliedScaleValue = 1;
          this.lastViewportWidth = -1;
          this.lastScreenWidth = -1;
          this.lastConfigurationSnapshot = null;
          this.lastFullscreenState = false;
          this.originalInlineZoom = null;
          this.originalInlineZoomPriority = "";
          this.boundApplyViewportZoomScale = this.applyViewportZoomScale.bind(this);
        }
        rememberOriginalStyle() {
          const doc = this.documentProvider;
          const rootElement = doc ? doc.documentElement : null;
          if (!rootElement || this.originalInlineZoom !== null) return;
          this.originalInlineZoom = rootElement.style.getPropertyValue("zoom");
          this.originalInlineZoomPriority = rootElement.style.getPropertyPriority("zoom");
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
            const currentViewportWidthPx = this.metricsService ? this.metricsService.getValidViewportWidth() : this.windowProvider ? this.windowProvider.innerWidth : 1920;
            if (!currentViewportWidthPx) return;
            const monitorWidth = (this.metricsService ? this.metricsService.getScreenWidth() : 0) || currentViewportWidthPx;
            const isFullscreen = this.envService ? this.envService.isDocumentInFullscreenMode() : false;
            if (!forceApplication && currentViewportWidthPx === this.lastViewportWidth && monitorWidth === this.lastScreenWidth && config === this.lastConfigurationSnapshot && isFullscreen === this.lastFullscreenState) {
              return;
            }
            this.lastViewportWidth = currentViewportWidthPx;
            this.lastScreenWidth = monitorWidth;
            this.lastConfigurationSnapshot = config;
            this.lastFullscreenState = isFullscreen;
            if (config.isResetInFullscreenEnabled && isFullscreen) {
              const fullscreenScaleValue = 1;
              const fullscreenScaleString = this.pointerService ? this.pointerService.formatScale(fullscreenScaleValue) : "1.000000";
              if (forceApplication || this.lastAppliedZoomScaleString !== fullscreenScaleString || !(this.pointerService && this.pointerService.isScaleSynchronized(rootElement, fullscreenScaleValue))) {
                if (this.pointerService && this.pointerService.applyNativeScale(rootElement, fullscreenScaleValue, fullscreenScaleString)) {
                  this.lastAppliedZoomScaleString = fullscreenScaleString;
                  this.lastAppliedScaleValue = fullscreenScaleValue;
                }
              }
              return;
            }
            const splitViewDiagnosis = this.splitViewDetector ? this.splitViewDetector.detectSplitView() : { isSplitView: false };
            const automaticReferenceWidth = this.metricsService ? this.metricsService.calculateReferenceBaseWidth(currentViewportWidthPx, config.referenceBaseWidthSetting, monitorWidth) : monitorWidth;
            const referenceBaseWidthPx = !config.isSplitViewAdaptationEnabled && splitViewDiagnosis.isSplitView && config.referenceBaseWidthSetting === "auto" ? currentViewportWidthPx : automaticReferenceWidth;
            let rawComputedScale = this.metricsService ? this.metricsService.computeZoomScaleFactor(currentViewportWidthPx, referenceBaseWidthPx, config) : 1;
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
          } catch (e) {
          }
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
              attributeFilter: ["style"]
            });
          } catch (e) {
          }
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
            if (this.originalInlineZoom === "") rootElement.style.removeProperty("zoom");
            else if (this.originalInlineZoom) rootElement.style.setProperty("zoom", this.originalInlineZoom, this.originalInlineZoomPriority);
            rootElement.style.removeProperty("--auto-shrink-scale");
          }
        }
      };
    }
  });

/* ════════════════════════════════════════════════════════════ */
/*                MÓDULO: src/ui/interface.js                 */
/* ════════════════════════════════════════════════════════════ */
  var UserInterfaceController;
  var init_interface = __esm({
    "src/ui/interface.js"() {
      init_constants();
      UserInterfaceController = class {
        /**
         * @param {Object} [dependencies]
         * @param {Object} dependencies.configurationService - Instancia de ConfigurationService.
         * @param {Object} dependencies.viewportMetricsService - Instancia de ViewportMetricsService.
         * @param {Object} dependencies.splitViewDetectorService - Instancia de SplitViewDetectorService.
         * @param {Object} dependencies.browserEnvironmentService - Instancia de BrowserEnvironmentService.
         * @param {Object} dependencies.zoomExecutionEngine - Instancia de ZoomExecutionEngine.
         * @param {Window} [dependencies.windowProvider] - Objeto window global.
         * @param {Document} [dependencies.documentProvider] - Objeto document global.
         * @param {Function} [dependencies.menuRegisterer] - Función para registrar menú (ej: GM_registerMenuCommand).
         */
        constructor(dependencies = {}) {
          this.configService = dependencies.configurationService || null;
          this.metricsService = dependencies.viewportMetricsService || null;
          this.splitViewDetector = dependencies.splitViewDetectorService || null;
          this.envService = dependencies.browserEnvironmentService || null;
          this.engine = dependencies.zoomExecutionEngine || null;
          this.windowProvider = dependencies.windowProvider || (typeof window !== "undefined" ? window : null);
          this.documentProvider = dependencies.documentProvider || (typeof document !== "undefined" ? document : null);
          this.menuRegisterer = dependencies.menuRegisterer || (typeof GM_registerMenuCommand === "function" ? GM_registerMenuCommand : null);
          this.boundRenderModal = this.renderModal.bind(this);
        }
        injectModalStyles() {
          const doc = this.documentProvider;
          if (!doc || doc.getElementById(MODAL_STYLE_ID)) return;
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
            const styleElement = doc.createElement("style");
            styleElement.id = MODAL_STYLE_ID;
            styleElement.textContent = modalStylesCssText;
            const targetParent = doc.head || doc.documentElement;
            if (targetParent) targetParent.appendChild(styleElement);
          } catch (e) {
          }
        }
        destroyModal(overlayElement, listenerBindings) {
          if (!overlayElement) return;
          if (Array.isArray(listenerBindings)) {
            for (const binding of listenerBindings) {
              if (binding.element && typeof binding.listener === "function") {
                binding.element.removeEventListener(binding.type, binding.listener);
              }
            }
          }
          overlayElement.remove();
        }
        renderModal() {
          const doc = this.documentProvider;
          const win = this.windowProvider;
          if (!doc || doc.getElementById(CONFIGURATION_MODAL_OVERLAY_ID)) return;
          try {
            this.injectModalStyles();
            const config = this.configService ? this.configService.getSanitizedConfig() : {};
            const splitViewDiagnosis = this.splitViewDetector ? this.splitViewDetector.detectSplitView() : { isSplitView: false, mode: "full" };
            const engineName = this.envService ? this.envService.detectNativeBrowserEngine() : "generic";
            const overlayElement = doc.createElement("div");
            overlayElement.id = CONFIGURATION_MODAL_OVERLAY_ID;
            const isThresholdMode = config.scalingMode === SCALING_MODES.THRESHOLDS;
            const isCustomBase = config.referenceBaseWidthSetting !== "auto";
            const isSplitActive = splitViewDiagnosis.isSplitView;
            let splitText = "Inactiva (Full)";
            if (isSplitActive) {
              splitText = `ACTIVA (${splitViewDiagnosis.mode.replace("_", " ").toUpperCase()})`;
            }
            overlayElement.innerHTML = `
        <div class="as-dialog-card">
          <h2>
            <span>\u2699\uFE0F Configuraci\xF3n Auto-Shrink</span>
            <span style="font-size:12px;color:#64748b;font-weight:normal;">v5.7.0 (DI & Split-View)</span>
          </h2>

          <!-- Insignias de Estado en Tiempo Real -->
          <div class="as-status-badge-container">
            <div class="as-status-badge">\u{1F310} Motor: ${engineName.toUpperCase()}</div>
            <div class="as-status-badge">\u{1F4F1} Vista Dividida: ${splitText}</div>
            <div class="as-status-badge">\u{1F512} L\xEDmites: ${Math.round(config.minimumZoomScaleLimit * 100)}% - ${Math.round(config.maximumZoomScaleLimit * 100)}%</div>
          </div>

          <!-- SECCI\xD3N: VISTA DIVIDIDA Y PANTALLA COMPLETA -->
          <div class="as-config-section">
            <div class="as-section-title">Vista Dividida y Pantalla Completa</div>
            <div class="as-field-group">
              <label class="as-checkbox-label">
                <input type="checkbox" id="as-checkbox-split-view" ${config.isSplitViewAdaptationEnabled ? "checked" : ""}>
                \u{1F4F1} Activar Detecci\xF3n Inteligente para Vista Dividida (Side-by-Side / Windows Snap)
              </label>
            </div>
            <div class="as-field-group">
              <label for="as-select-split-behavior">Comportamiento del Zoom en Vista Dividida:</label>
              <select id="as-select-split-behavior">
                <option value="${SPLIT_VIEW_BEHAVIORS.EXPAND_MAX}" ${config.splitViewBehavior === SPLIT_VIEW_BEHAVIORS.EXPAND_MAX ? "selected" : ""}>\u{1F50E} AMPLIAR al Zoom M\xE1ximo (Recomendado para Lectura)</option>
                <option value="${SPLIT_VIEW_BEHAVIORS.RESET_NATIVE}" ${config.splitViewBehavior === SPLIT_VIEW_BEHAVIORS.RESET_NATIVE ? "selected" : ""}>\u{1F4D0} Mantener al 100% Nativo</option>
                <option value="${SPLIT_VIEW_BEHAVIORS.SHRINK_STANDARD}" ${config.splitViewBehavior === SPLIT_VIEW_BEHAVIORS.SHRINK_STANDARD ? "selected" : ""}>\u{1F4C9} Aplicar Encogimiento Est\xE1ndar</option>
              </select>
            </div>
            <div class="as-field-group">
              <label class="as-checkbox-label">
                <input type="checkbox" id="as-checkbox-reset-fullscreen" ${config.isResetInFullscreenEnabled ? "checked" : ""}>
                \u{1F4FA} Restaurar zoom al 100% nativo al poner el video en Pantalla Completa
              </label>
              <label class="as-checkbox-label">
                <input type="checkbox" id="as-checkbox-media-pointer" ${config.isMediaPointerPrecisionEnabled ? "checked" : ""}>
                \u{1F3AF} Alinear cursor y etiquetas de tiempo en controles multimedia
              </label>
            </div>
          </div>

          <!-- SECCI\xD3N: MODO DE ESCALADO -->
          <div class="as-config-section">
            <div class="as-section-title">Modo de Escalado Est\xE1ndar</div>
            <div class="as-field-group">
              <select id="as-select-scaling-mode">
                <option value="${SCALING_MODES.CONTINUOUS}" ${!isThresholdMode ? "selected" : ""}>Continuo / Proporcional (Din\xE1mico)</option>
                <option value="${SCALING_MODES.THRESHOLDS}" ${isThresholdMode ? "selected" : ""}>Por Umbrales de Tama\xF1o (&lt;80%, &lt;60%, &lt;40%, &lt;20%)</option>
              </select>
            </div>
          </div>

          <!-- SECCI\xD3N: PANTALLA BASE -->
          <div class="as-config-section">
            <div class="as-section-title">Pantalla Base de Referencia (100% Zoom)</div>
            <div class="as-field-group">
              <select id="as-select-base-width-type">
                <option value="auto" ${!isCustomBase ? "selected" : ""}>Detecci\xF3n Autom\xE1tica (Monitor Actual)</option>
                <option value="custom" ${isCustomBase ? "selected" : ""}>Personalizado (P\xEDxeles fijos)</option>
              </select>
            </div>
            <div class="as-field-group" id="as-container-custom-width" style="display: ${isCustomBase ? "block" : "none"};">
              <label for="as-input-custom-width">Ancho en P\xEDxeles (ej: 1920, 2560, 1366):</label>
              <input type="number" id="as-input-custom-width" value="${isCustomBase ? config.referenceBaseWidthSetting : 1920}" min="800" max="7680">
            </div>
          </div>

          <!-- SECCI\xD3N: UMBRALES (BREAKPOINTS) -->
          <div class="as-config-section" id="as-section-thresholds-container" style="display: ${isThresholdMode ? "block" : "none"};">
            <div class="as-section-title">Niveles de Zoom por Tama\xF1o de Ventana</div>
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

          <!-- SECCI\xD3N: L\xCDMITES GLOBALES -->
          <div class="as-config-section">
            <div class="as-section-title">L\xEDmites de Zoom Absolutos (Anti-Sobrescalado y M\xE1ximo Ampliado)</div>
            <div class="as-grid-two-columns">
              <div class="as-field-group">
                <label for="as-input-minimum-zoom">Zoom M\xEDnimo (%):</label>
                <input type="number" id="as-input-minimum-zoom" value="${Math.round(config.minimumZoomScaleLimit * 100)}" min="10" max="100">
              </div>
              <div class="as-field-group">
                <label for="as-input-maximum-zoom">Zoom M\xE1ximo / Ampliado (%):</label>
                <input type="number" id="as-input-maximum-zoom" value="${Math.round(config.maximumZoomScaleLimit * 100)}" min="50" max="300">
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
            const targetParent = doc.body || doc.documentElement;
            if (targetParent) {
              targetParent.appendChild(overlayElement);
            }
            const scalingModeSelect = overlayElement.querySelector("#as-select-scaling-mode");
            const thresholdsContainer = overlayElement.querySelector("#as-section-thresholds-container");
            const baseWidthSelect = overlayElement.querySelector("#as-select-base-width-type");
            const customWidthContainer = overlayElement.querySelector("#as-container-custom-width");
            const buttonReset = overlayElement.querySelector("#as-button-reset");
            const buttonCancel = overlayElement.querySelector("#as-button-cancel");
            const buttonSave = overlayElement.querySelector("#as-button-save");
            const listenerBindings = [];
            const handleModeChange = () => {
              thresholdsContainer.style.display = scalingModeSelect.value === SCALING_MODES.THRESHOLDS ? "block" : "none";
            };
            const handleBaseChange = () => {
              customWidthContainer.style.display = baseWidthSelect.value === "custom" ? "block" : "none";
            };
            const handleCancel = () => {
              this.destroyModal(overlayElement, listenerBindings);
            };
            const handleReset = () => {
              if (this.configService) this.configService.resetAll();
              if (this.engine) this.engine.applyViewportZoomScale(true);
              this.destroyModal(overlayElement, listenerBindings);
            };
            const handleSave = () => {
              const modeVal = scalingModeSelect.value;
              let baseVal = "auto";
              if (baseWidthSelect.value === "custom") {
                const parsedWidth = parseInt(overlayElement.querySelector("#as-input-custom-width").value, 10);
                baseVal = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : 1920;
              }
              const minZoom = this.configService ? this.configService.sanitizeNumeric(overlayElement.querySelector("#as-input-minimum-zoom").value, 20, 5, 100) : 20;
              const maxZoom = this.configService ? this.configService.sanitizeNumeric(overlayElement.querySelector("#as-input-maximum-zoom").value, 100, minZoom, 300) : 100;
              const s80 = (this.configService ? this.configService.sanitizeNumeric(overlayElement.querySelector("#as-input-threshold-80").value, 85, 10, 150) : 85) / 100;
              const s60 = (this.configService ? this.configService.sanitizeNumeric(overlayElement.querySelector("#as-input-threshold-60").value, 70, 10, 150) : 70) / 100;
              const s40 = (this.configService ? this.configService.sanitizeNumeric(overlayElement.querySelector("#as-input-threshold-40").value, 55, 10, 150) : 55) / 100;
              const s20 = (this.configService ? this.configService.sanitizeNumeric(overlayElement.querySelector("#as-input-threshold-20").value, 35, 10, 150) : 35) / 100;
              const isFullscreen = overlayElement.querySelector("#as-checkbox-reset-fullscreen").checked;
              const isSplitView = overlayElement.querySelector("#as-checkbox-split-view").checked;
              const splitBehavior = overlayElement.querySelector("#as-select-split-behavior").value;
              const isMediaPointerPrecisionEnabled = overlayElement.querySelector("#as-checkbox-media-pointer").checked;
              if (this.configService) {
                this.configService.setMany({
                  scalingMode: modeVal,
                  referenceBaseWidthSetting: baseVal,
                  minimumZoomScaleLimit: minZoom / 100,
                  maximumZoomScaleLimit: maxZoom / 100,
                  thresholdZoomLevelUnder80Percent: s80,
                  thresholdZoomLevelUnder60Percent: s60,
                  thresholdZoomLevelUnder40Percent: s40,
                  thresholdZoomLevelUnder20Percent: s20,
                  isMediaPointerPrecisionEnabled,
                  isResetInFullscreenEnabled: isFullscreen,
                  isSplitViewAdaptationEnabled: isSplitView,
                  splitViewBehavior: splitBehavior
                });
              }
              if (this.engine) this.engine.applyViewportZoomScale(true);
              this.destroyModal(overlayElement, listenerBindings);
            };
            scalingModeSelect.addEventListener("change", handleModeChange);
            listenerBindings.push({ element: scalingModeSelect, type: "change", listener: handleModeChange });
            baseWidthSelect.addEventListener("change", handleBaseChange);
            listenerBindings.push({ element: baseWidthSelect, type: "change", listener: handleBaseChange });
            buttonCancel.addEventListener("click", handleCancel);
            listenerBindings.push({ element: buttonCancel, type: "click", listener: handleCancel });
            buttonReset.addEventListener("click", handleReset);
            listenerBindings.push({ element: buttonReset, type: "click", listener: handleReset });
            buttonSave.addEventListener("click", handleSave);
            listenerBindings.push({ element: buttonSave, type: "click", listener: handleSave });
          } catch (e) {
            console.error("[Auto-Shrink] Error al renderizar modal:", e);
          }
        }
        registerMenuCommands() {
          try {
            if (this.menuRegisterer) {
              this.menuRegisterer("\u2699\uFE0F Configurar Auto-Shrink v5.7.0", this.boundRenderModal);
              this.menuRegisterer("\u{1F504} Restablecer Valores", () => {
                if (this.configService) this.configService.resetAll();
                if (this.engine) this.engine.applyViewportZoomScale(true);
              });
              this.menuRegisterer("\u{1F310} Ver Repositorio en GitHub", () => {
                if (this.windowProvider) this.windowProvider.open("https://github.com/Baalgarthem/auto-shrink", "_blank");
              });
            }
          } catch (e) {
          }
        }
      };
    }
  });

/* ════════════════════════════════════════════════════════════ */
/*                  MÓDULO: src/container.js                  */
/* ════════════════════════════════════════════════════════════ */
  var ApplicationContainer;
  var init_container = __esm({
    "src/container.js"() {
      init_configuration();
      init_metrics();
      init_splitview();
      init_environment();
      init_pointer();
      init_scroll();
      init_engine();
      init_interface();
      ApplicationContainer = class {
        constructor(environmentGlobals = {}) {
          const win = environmentGlobals.windowProvider || (typeof window !== "undefined" ? window : null);
          const doc = environmentGlobals.documentProvider || (typeof document !== "undefined" ? document : null);
          const scr = environmentGlobals.screenProvider || (typeof screen !== "undefined" ? screen : null);
          const unsafeWin = environmentGlobals.unsafeWindowProvider || (typeof unsafeWindow !== "undefined" ? unsafeWindow : null);
          const getValue = environmentGlobals.getValue || (typeof GM_getValue === "function" ? GM_getValue : null);
          const setValue = environmentGlobals.setValue || (typeof GM_setValue === "function" ? GM_setValue : null);
          const addValueChangeListener = environmentGlobals.addValueChangeListener || (typeof GM_addValueChangeListener === "function" ? GM_addValueChangeListener : null);
          const removeValueChangeListener = environmentGlobals.removeValueChangeListener || (typeof GM_removeValueChangeListener === "function" ? GM_removeValueChangeListener : null);
          const menuRegisterer = environmentGlobals.menuRegisterer || (typeof GM_registerMenuCommand === "function" ? GM_registerMenuCommand : null);
          this.windowProvider = win;
          this.documentProvider = doc;
          this.isEngineInitialized = false;
          this.configurationService = new ConfigurationService({
            getValue,
            setValue,
            addValueChangeListener,
            removeValueChangeListener,
            onConfigChange: () => {
              if (this.zoomExecutionEngine) {
                this.zoomExecutionEngine.scheduleFrameExecution(true);
              }
            }
          });
          this.viewportMetricsService = new ViewportMetricsService({
            windowProvider: win,
            screenProvider: scr
          });
          this.splitViewDetectorService = new SplitViewDetectorService({
            viewportMetrics: this.viewportMetricsService,
            windowProvider: win
          });
          this.browserEnvironmentService = new BrowserEnvironmentService({
            windowProvider: win,
            documentProvider: doc
          });
          this.pointerPrecisionService = new PointerPrecisionService({
            windowProvider: win,
            documentProvider: doc,
            unsafeWindowProvider: unsafeWin
          });
          this.scrollSynchronizationService = new ScrollSynchronizationService({
            pointerService: this.pointerPrecisionService,
            windowProvider: win,
            documentProvider: doc
          });
          this.zoomExecutionEngine = new ZoomExecutionEngine({
            configurationService: this.configurationService,
            viewportMetricsService: this.viewportMetricsService,
            splitViewDetectorService: this.splitViewDetectorService,
            pointerPrecisionService: this.pointerPrecisionService,
            scrollSynchronizationService: this.scrollSynchronizationService,
            browserEnvironmentService: this.browserEnvironmentService,
            windowProvider: win,
            documentProvider: doc
          });
          this.userInterfaceController = new UserInterfaceController({
            configurationService: this.configurationService,
            viewportMetricsService: this.viewportMetricsService,
            splitViewDetectorService: this.splitViewDetectorService,
            browserEnvironmentService: this.browserEnvironmentService,
            zoomExecutionEngine: this.zoomExecutionEngine,
            windowProvider: win,
            documentProvider: doc,
            menuRegisterer
          });
          this.boundHandleViewportResize = this.handleViewportResize.bind(this);
          this.boundHandleEnvironmentChange = this.handleEnvironmentChange.bind(this);
          this.boundHandlePageShow = this.handlePageShow.bind(this);
          this.boundHandlePageHide = this.handlePageHide.bind(this);
          this.boundHandleVisibilityChange = this.handleVisibilityChange.bind(this);
        }
        initialize() {
          if (this.isEngineInitialized || !this.documentProvider || !this.documentProvider.documentElement) return;
          this.isEngineInitialized = true;
          this.zoomExecutionEngine.rememberOriginalStyle();
          this.pointerPrecisionService.initializePointerCorrection();
          try {
            this.scrollSynchronizationService.initialize();
          } catch (e) {
          }
          try {
            this.zoomExecutionEngine.applyViewportZoomScale();
          } catch (e) {
          }
          try {
            this.zoomExecutionEngine.initializeStyleMutationProtectionObserver();
          } catch (e) {
          }
          try {
            this.userInterfaceController.registerMenuCommands();
          } catch (e) {
          }
          this.bindEvents();
        }
        bindEvents() {
          const win = this.windowProvider;
          const doc = this.documentProvider;
          if (!win || !doc) return;
          win.addEventListener("resize", this.boundHandleViewportResize, { passive: true });
          win.addEventListener("pageshow", this.boundHandlePageShow, { passive: true });
          win.addEventListener("pagehide", this.boundHandlePageHide, { passive: true });
          win.addEventListener("orientationchange", this.boundHandleEnvironmentChange, { passive: true });
          if (win.visualViewport) {
            win.visualViewport.addEventListener("resize", this.boundHandleViewportResize, { passive: true });
          }
          if (win.screen && win.screen.orientation) {
            win.screen.orientation.addEventListener("change", this.boundHandleEnvironmentChange, { passive: true });
          }
          doc.addEventListener("visibilitychange", this.boundHandleVisibilityChange, { passive: true });
          doc.addEventListener("fullscreenchange", this.boundHandleEnvironmentChange, { passive: true });
          doc.addEventListener("webkitfullscreenchange", this.boundHandleEnvironmentChange, { passive: true });
          doc.addEventListener("mozfullscreenchange", this.boundHandleEnvironmentChange, { passive: true });
        }
        handleViewportResize() {
          this.zoomExecutionEngine.scheduleFrameExecution(false);
        }
        handleEnvironmentChange() {
          this.zoomExecutionEngine.scheduleFrameExecution(true);
        }
        handleVisibilityChange() {
          if (this.documentProvider && !this.documentProvider.hidden) {
            this.zoomExecutionEngine.scheduleFrameExecution(true);
          }
        }
        handlePageShow() {
          if (!this.isEngineInitialized) this.initialize();
          this.zoomExecutionEngine.scheduleFrameExecution(true);
        }
        handlePageHide(event) {
          if (event && !event.persisted) this.destroy();
        }
        destroy() {
          if (!this.isEngineInitialized) return;
          this.isEngineInitialized = false;
          try {
            this.zoomExecutionEngine.destroy();
            this.pointerPrecisionService.destroy();
            this.scrollSynchronizationService.destroy();
            this.configurationService.destroy();
            const win = this.windowProvider;
            const doc = this.documentProvider;
            if (win) {
              win.removeEventListener("resize", this.boundHandleViewportResize);
              win.removeEventListener("orientationchange", this.boundHandleEnvironmentChange);
              win.removeEventListener("pageshow", this.boundHandlePageShow);
              win.removeEventListener("pagehide", this.boundHandlePageHide);
              if (win.visualViewport) win.visualViewport.removeEventListener("resize", this.boundHandleViewportResize);
              if (win.screen && win.screen.orientation) {
                win.screen.orientation.removeEventListener("change", this.boundHandleEnvironmentChange);
              }
            }
            if (doc) {
              doc.removeEventListener("visibilitychange", this.boundHandleVisibilityChange);
              doc.removeEventListener("fullscreenchange", this.boundHandleEnvironmentChange);
              doc.removeEventListener("webkitfullscreenchange", this.boundHandleEnvironmentChange);
              doc.removeEventListener("mozfullscreenchange", this.boundHandleEnvironmentChange);
            }
          } catch (e) {
          }
        }
      };
    }
  });

/* ════════════════════════════════════════════════════════════ */
/*                    MÓDULO: src/index.js                    */
/* ════════════════════════════════════════════════════════════ */
  var require_index = __commonJS({
    "src/index.js"() {
      init_container();
      (function initializeAutoShrinkScriptScope() {
        "use strict";
        try {
          if (window.top !== window.self) return;
        } catch (e) {
          return;
        }
        const container = new ApplicationContainer({
          windowProvider: typeof window !== "undefined" ? window : null,
          documentProvider: typeof document !== "undefined" ? document : null,
          screenProvider: typeof screen !== "undefined" ? screen : null,
          unsafeWindowProvider: typeof unsafeWindow !== "undefined" ? unsafeWindow : null,
          getValue: typeof GM_getValue === "function" ? GM_getValue : null,
          setValue: typeof GM_setValue === "function" ? GM_setValue : null,
          addValueChangeListener: typeof GM_addValueChangeListener === "function" ? GM_addValueChangeListener : null,
          removeValueChangeListener: typeof GM_removeValueChangeListener === "function" ? GM_removeValueChangeListener : null,
          menuRegisterer: typeof GM_registerMenuCommand === "function" ? GM_registerMenuCommand : null
        });
        if (document.documentElement) {
          container.initialize();
        }
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => container.initialize(), { once: true });
        } else {
          container.initialize();
        }
        window.addEventListener("beforeunload", () => container.destroy(), { once: true });
      })();
    }
  });
  require_index();
})();
