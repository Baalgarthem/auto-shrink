// ==UserScript==
// @name         Auto-Shrink
// @namespace    https://github.com/Baalgarthem/auto-shrink
// @icon         https://github.com/Baalgarthem/auto-shrink/raw/refs/heads/principal/media/main_icon.ico
// @version      5.6.0
// @description  Ajusta automáticamente el zoom al ancho disponible, sincroniza el scroll lógico y visual y corrige coordenadas en controles multimedia y etiquetas de tiempo (XVideos, Pornhub, YouTube, etc.).
// @author       Baalgarthem
// @match        *://*/*
// @noframes
// @updateURL    https://raw.githubusercontent.com/Baalgarthem/auto-shrink/principal/auto-shrink.user.js
// @downloadURL  https://raw.githubusercontent.com/Baalgarthem/auto-shrink/principal/auto-shrink.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-start
// ==UserScript==

/**
 * Auto-Shrink Userscript v5.6.0 - Escalado automático, scroll sincronizado y precisión multimedia
 * ------------------------------------------------------------------------------------------
 * Estructura dividida en 7 servicios modulares especializados:
 * 1. ConfigurationService: Configuración saneada y sincronización real entre pestañas.
 * 2. ViewportMetricsService: Medición del viewport y cálculo proporcional de la escala.
 * 3. PointerPrecisionService: Escala nativa única para pintura, hit-testing y etiquetas de tiempo.
 * 4. ScrollSynchronizationService: Sincronización de desplazamientos lógicos y visuales (scrollTop/scrollLeft).
 * 5. BrowserEnvironmentService: Detección del motor y del estado de pantalla completa.
 * 6. ZoomExecutionEngine: Aplicación idempotente, histéresis y agrupación mediante rAF.
 * 7. UserInterfaceController: Ventana modal emergente con insignias de estado en tiempo real.
 */

import { ConfigurationService } from './config/configuration.js';
import { PointerPrecisionService } from './core/pointer.js';
import { ScrollSynchronizationService } from './core/scroll.js';
import { BrowserEnvironmentService } from './core/environment.js';
import { ZoomExecutionEngine } from './core/engine.js';
import { UserInterfaceController } from './ui/interface.js';

(function initializeAutoShrinkScriptScope() {
  'use strict';
  try {
    if (window.top !== window.self) return;
  } catch (e) {
    return;
  }
  
let isEngineInitialized = false;

  function initializeEngine() {
    if (isEngineInitialized || !document.documentElement) return;
    isEngineInitialized = true;

    ZoomExecutionEngine.rememberOriginalStyle();
    PointerPrecisionService.initializePointerCorrection();
    try {
      ScrollSynchronizationService.initialize();
    } catch (e) { }
    try {
      ZoomExecutionEngine.applyViewportZoomScale();
    } catch (e) { }

    try {
      ZoomExecutionEngine.initializeStyleMutationProtectionObserver();
    } catch (e) { }

    try {
      UserInterfaceController.registerMenuCommands();
    } catch (e) { }
  }

  function destroyEngineLifecycle() {
    if (!isEngineInitialized) return;
    isEngineInitialized = false;
    try {
      ZoomExecutionEngine.destroy();
      PointerPrecisionService.destroy();
      ScrollSynchronizationService.destroy();
      ConfigurationService.destroy();
      window.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('orientationchange', handleEnvironmentChange);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleEnvironmentChange);
      document.removeEventListener('webkitfullscreenchange', handleEnvironmentChange);
      document.removeEventListener('mozfullscreenchange', handleEnvironmentChange);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', handleViewportResize);
      if (window.screen && window.screen.orientation) {
        window.screen.orientation.removeEventListener('change', handleEnvironmentChange);
      }
    } catch (e) { }
  }

  function handleVisibilityChange() {
    if (!document.hidden) ZoomExecutionEngine.scheduleFrameExecution(true);
  }

  function handleViewportResize() {
    ZoomExecutionEngine.scheduleFrameExecution(false);
  }

  function handleEnvironmentChange() {
    ZoomExecutionEngine.scheduleFrameExecution(true);
  }

  function handlePageShow() {
    if (!isEngineInitialized) initializeEngine();
    ZoomExecutionEngine.scheduleFrameExecution(true);
  }

  function handlePageHide(event) {
    if (!event.persisted) destroyEngineLifecycle();
  }

  if (document.documentElement) {
    initializeEngine();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEngine, { once: true });
  } else {
    initializeEngine();
  }

  window.addEventListener('resize', handleViewportResize, { passive: true });
  window.addEventListener('pageshow', handlePageShow, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewportResize, { passive: true });
  }
  if (window.screen && window.screen.orientation) {
    window.screen.orientation.addEventListener('change', handleEnvironmentChange, { passive: true });
  }
  window.addEventListener('orientationchange', handleEnvironmentChange, { passive: true });

  document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });

  document.addEventListener('fullscreenchange', handleEnvironmentChange, { passive: true });
  document.addEventListener('webkitfullscreenchange', handleEnvironmentChange, { passive: true });
  document.addEventListener('mozfullscreenchange', handleEnvironmentChange, { passive: true });

  window.addEventListener('pagehide', handlePageHide, { once: true });
  window.addEventListener('beforeunload', destroyEngineLifecycle, { once: true });

})();