/**
   * Servicio encargado de detectar el motor del navegador y la pantalla completa.
   */
  export const BrowserEnvironmentService = (function () {
    /**
     * Identifica el motor nativo del navegador para aplicar optimizaciones específicas.
     * @returns {string} 'gecko' (Firefox), 'blink' (Chrome/Edge/Brave) o 'generic'.
     */
    function detectNativeBrowserEngine() {
      try {
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('firefox') || userAgent.includes('gecko/')) return 'gecko';
        if (userAgent.includes('chrome') || userAgent.includes('chromium') || userAgent.includes('edg/')) return 'blink';
      } catch (e) { }
      return 'generic';
    }

    /**
     * Verifica si el documento o algún elemento está en pantalla completa nativa.
     * @returns {boolean} True si está en pantalla completa.
     */
    function isDocumentInFullscreenMode() {
      try {
        return !!(
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement
        );
      } catch (e) {
        return false;
      }
    }

    /**
     * Instala una única vez las variables CSS propias del userscript.
     */
    return {
      detectNativeBrowserEngine,
      isDocumentInFullscreenMode
    };
  })();