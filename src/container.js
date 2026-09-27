import { ConfigurationService } from './config/configuration.js';
import { ViewportMetricsService } from './core/metrics.js';
import { SplitViewDetectorService } from './core/splitview.js';
import { BrowserEnvironmentService } from './core/environment.js';
import { PointerPrecisionService } from './core/pointer.js';
import { ScrollSynchronizationService } from './core/scroll.js';
import { ZoomExecutionEngine } from './core/engine.js';
import { UserInterfaceController } from './ui/interface.js';

/**
 * Contenedor de Inyección de Dependencias (DI Container) para Auto-Shrink.
 * Instancia, enlaza y administra el ciclo de vida de los 8 servicios modulares.
 */
export class ApplicationContainer {
  constructor(environmentGlobals = {}) {
    const win = environmentGlobals.windowProvider || (typeof window !== 'undefined' ? window : null);
    const doc = environmentGlobals.documentProvider || (typeof document !== 'undefined' ? document : null);
    const scr = environmentGlobals.screenProvider || (typeof screen !== 'undefined' ? screen : null);
    const unsafeWin = environmentGlobals.unsafeWindowProvider || (typeof unsafeWindow !== 'undefined' ? unsafeWindow : null);

    const getValue = environmentGlobals.getValue || (typeof GM_getValue === 'function' ? GM_getValue : null);
    const setValue = environmentGlobals.setValue || (typeof GM_setValue === 'function' ? GM_setValue : null);
    const addValueChangeListener = environmentGlobals.addValueChangeListener || (typeof GM_addValueChangeListener === 'function' ? GM_addValueChangeListener : null);
    const removeValueChangeListener = environmentGlobals.removeValueChangeListener || (typeof GM_removeValueChangeListener === 'function' ? GM_removeValueChangeListener : null);
    const menuRegisterer = environmentGlobals.menuRegisterer || (typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : null);

    this.windowProvider = win;
    this.documentProvider = doc;
    this.isEngineInitialized = false;

    // 1. Configuración
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

    // 2. Métricas del Viewport
    this.viewportMetricsService = new ViewportMetricsService({
      windowProvider: win,
      screenProvider: scr
    });

    // 3. Detector de Vista Dividida (Split View)
    this.splitViewDetectorService = new SplitViewDetectorService({
      viewportMetrics: this.viewportMetricsService,
      windowProvider: win
    });

    // 4. Entorno de Navegador
    this.browserEnvironmentService = new BrowserEnvironmentService({
      windowProvider: win,
      documentProvider: doc
    });

    // 5. Coordenadas y Precisión de Puntero Multimedia
    this.pointerPrecisionService = new PointerPrecisionService({
      windowProvider: win,
      documentProvider: doc,
      unsafeWindowProvider: unsafeWin
    });

    // 6. Sincronización de Scroll Lógico y Visual
    this.scrollSynchronizationService = new ScrollSynchronizationService({
      pointerService: this.pointerPrecisionService,
      windowProvider: win,
      documentProvider: doc
    });

    // 7. Motor de Ejecución de Zoom
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

    // 8. Controlador de Interfaz de Usuario Modal
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
    } catch (e) { }

    try {
      this.zoomExecutionEngine.applyViewportZoomScale();
    } catch (e) { }

    try {
      this.zoomExecutionEngine.initializeStyleMutationProtectionObserver();
    } catch (e) { }

    try {
      this.userInterfaceController.registerMenuCommands();
    } catch (e) { }

    this.bindEvents();
  }

  bindEvents() {
    const win = this.windowProvider;
    const doc = this.documentProvider;
    if (!win || !doc) return;

    win.addEventListener('resize', this.boundHandleViewportResize, { passive: true });
    win.addEventListener('pageshow', this.boundHandlePageShow, { passive: true });
    win.addEventListener('pagehide', this.boundHandlePageHide, { passive: true });
    win.addEventListener('orientationchange', this.boundHandleEnvironmentChange, { passive: true });

    if (win.visualViewport) {
      win.visualViewport.addEventListener('resize', this.boundHandleViewportResize, { passive: true });
    }
    if (win.screen && win.screen.orientation) {
      win.screen.orientation.addEventListener('change', this.boundHandleEnvironmentChange, { passive: true });
    }

    doc.addEventListener('visibilitychange', this.boundHandleVisibilityChange, { passive: true });
    doc.addEventListener('fullscreenchange', this.boundHandleEnvironmentChange, { passive: true });
    doc.addEventListener('webkitfullscreenchange', this.boundHandleEnvironmentChange, { passive: true });
    doc.addEventListener('mozfullscreenchange', this.boundHandleEnvironmentChange, { passive: true });
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
        win.removeEventListener('resize', this.boundHandleViewportResize);
        win.removeEventListener('orientationchange', this.boundHandleEnvironmentChange);
        win.removeEventListener('pageshow', this.boundHandlePageShow);
        win.removeEventListener('pagehide', this.boundHandlePageHide);
        if (win.visualViewport) win.visualViewport.removeEventListener('resize', this.boundHandleViewportResize);
        if (win.screen && win.screen.orientation) {
          win.screen.orientation.removeEventListener('change', this.boundHandleEnvironmentChange);
        }
      }
      if (doc) {
        doc.removeEventListener('visibilitychange', this.boundHandleVisibilityChange);
        doc.removeEventListener('fullscreenchange', this.boundHandleEnvironmentChange);
        doc.removeEventListener('webkitfullscreenchange', this.boundHandleEnvironmentChange);
        doc.removeEventListener('mozfullscreenchange', this.boundHandleEnvironmentChange);
      }
    } catch (e) { }
  }
}
