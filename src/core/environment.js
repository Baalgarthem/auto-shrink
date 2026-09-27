/**
 * Servicio encargado de detectar el motor del navegador y el estado de pantalla completa
 * con inyección de dependencias de ventana y documento.
 */
export class BrowserEnvironmentService {
  /**
   * @param {Object} [dependencies]
   * @param {Window} [dependencies.windowProvider] - Instancia global de window.
   * @param {Document} [dependencies.documentProvider] - Instancia global de document.
   */
  constructor(dependencies = {}) {
    this.windowProvider = dependencies.windowProvider || (typeof window !== 'undefined' ? window : null);
    this.documentProvider = dependencies.documentProvider || (typeof document !== 'undefined' ? document : null);
  }

  /**
   * Identifica el motor nativo del navegador para aplicar optimizaciones específicas.
   * @returns {string} 'gecko' (Firefox), 'blink' (Chrome/Edge/Brave) o 'generic'.
   */
  detectNativeBrowserEngine() {
    try {
      const win = this.windowProvider;
      const userAgent = (win && win.navigator && win.navigator.userAgent)
        ? win.navigator.userAgent.toLowerCase()
        : '';
      if (userAgent.includes('firefox') || userAgent.includes('gecko/')) return 'gecko';
      if (userAgent.includes('chrome') || userAgent.includes('chromium') || userAgent.includes('edg/')) return 'blink';
    } catch (e) { }
    return 'generic';
  }

  /**
   * Verifica si el documento o algún elemento está en pantalla completa nativa.
   * @returns {boolean} True si está en pantalla completa.
   */
  isDocumentInFullscreenMode() {
    try {
      const doc = this.documentProvider;
      if (!doc) return false;
      return !!(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement
      );
    } catch (e) {
      return false;
    }
  }
}