/**
 * Servicio dedicado a sincronizar las métricas de desplazamiento (scrollTop, scrollLeft)
 * entre el viewport visual y la disposición lógica del documento cuando se aplica CSS zoom,
 * implementado con inyección de dependencias.
 */
export class ScrollSynchronizationService {
  /**
   * @param {Object} [dependencies]
   * @param {Object} [dependencies.pointerService] - Instancia de PointerPrecisionService.
   * @param {Window} [dependencies.windowProvider] - Objeto window global.
   * @param {Document} [dependencies.documentProvider] - Objeto document global.
   */
  constructor(dependencies = {}) {
    this.pointerService = dependencies.pointerService || null;
    this.windowProvider = dependencies.windowProvider || (typeof window !== 'undefined' ? window : null);
    this.documentProvider = dependencies.documentProvider || (typeof document !== 'undefined' ? document : null);

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

      const currentScrollY = (win && win.scrollY) || rootElement.scrollTop || 0;
      const currentScrollX = (win && win.scrollX) || rootElement.scrollLeft || 0;

      if (Math.abs(currentScrollY - this.lastScrollY) < 0.5 && Math.abs(currentScrollX - this.lastScrollX) < 0.5) {
        return;
      }

      this.lastScrollY = currentScrollY;
      this.lastScrollX = currentScrollX;

      const scale = (this.pointerService ? this.pointerService.readInlineScale(rootElement) : parseFloat(rootElement.style.getPropertyValue('zoom'))) || 1;
      const visualScrollY = Math.round(currentScrollY / scale);
      const visualScrollX = Math.round(currentScrollX / scale);

      rootElement.style.setProperty('--auto-shrink-scroll-top', `${currentScrollY}px`);
      rootElement.style.setProperty('--auto-shrink-scroll-left', `${currentScrollX}px`);
      rootElement.style.setProperty('--auto-shrink-visual-scroll-top', `${visualScrollY}px`);
      rootElement.style.setProperty('--auto-shrink-visual-scroll-left', `${visualScrollX}px`);
      rootElement.style.setProperty('--auto-shrink-effective-scale', String(scale));
    } catch (e) { }
  }

  onScrollHandler() {
    if (this.frameRequestId === null && this.windowProvider) {
      this.frameRequestId = this.windowProvider.requestAnimationFrame(this.boundSynchronizeScrollMetrics);
    }
  }

  initialize() {
    if (this.isInitialized || !this.windowProvider) return;
    this.isInitialized = true;
    this.windowProvider.addEventListener('scroll', this.boundOnScrollHandler, { capture: true, passive: true });
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
      this.windowProvider.removeEventListener('scroll', this.boundOnScrollHandler, true);
    }
  }
}