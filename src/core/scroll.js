import { PointerPrecisionService } from './pointer.js';
import { BrowserEnvironmentService } from './environment.js';
/**
   * Servicio dedicado a sincronizar las métricas de desplazamiento (scrollTop, scrollLeft)
   * entre el viewport visual y la disposición lógica del documento cuando se aplica CSS zoom.
   */
  export const ScrollSynchronizationService = (function () {
    let isInitialized = false;
    let frameRequestId = null;
    let lastScrollY = -1;
    let lastScrollX = -1;

    function synchronizeScrollMetrics() {
      frameRequestId = null;
      if (document.hidden) return;

      try {
        const rootElement = document.documentElement;
        if (!rootElement) return;

        const currentScrollY = window.scrollY || rootElement.scrollTop || 0;
        const currentScrollX = window.scrollX || rootElement.scrollLeft || 0;

        if (Math.abs(currentScrollY - lastScrollY) < 0.5 && Math.abs(currentScrollX - lastScrollX) < 0.5) {
          return;
        }

        lastScrollY = currentScrollY;
        lastScrollX = currentScrollX;

        const scale = PointerPrecisionService.readInlineScale(rootElement) || 1;
        const visualScrollY = Math.round(currentScrollY / scale);
        const visualScrollX = Math.round(currentScrollX / scale);

        rootElement.style.setProperty('--auto-shrink-scroll-top', `${currentScrollY}px`);
        rootElement.style.setProperty('--auto-shrink-scroll-left', `${currentScrollX}px`);
        rootElement.style.setProperty('--auto-shrink-visual-scroll-top', `${visualScrollY}px`);
        rootElement.style.setProperty('--auto-shrink-visual-scroll-left', `${visualScrollX}px`);
        rootElement.style.setProperty('--auto-shrink-effective-scale', String(scale));
      } catch (e) { }
    }

    function onScrollHandler() {
      if (frameRequestId === null) {
        frameRequestId = requestAnimationFrame(synchronizeScrollMetrics);
      }
    }

    function initialize() {
      if (isInitialized) return;
      isInitialized = true;
      window.addEventListener('scroll', onScrollHandler, { capture: true, passive: true });
      synchronizeScrollMetrics();
    }

    function destroy() {
      if (!isInitialized) return;
      isInitialized = false;
      if (frameRequestId !== null) {
        cancelAnimationFrame(frameRequestId);
        frameRequestId = null;
      }
      window.removeEventListener('scroll', onScrollHandler, true);
    }

    return {
      initialize,
      synchronizeScrollMetrics,
      destroy
    };
  })();