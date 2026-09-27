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

/**
 * Auto-Shrink Userscript v5.7.0 - Arquitectura DI & Detección de Vista Dividida
 * ------------------------------------------------------------------------------------------
 * Estructura dividida en 8 servicios interconectados mediante Inyección de Dependencias:
 * 1. ConfigurationService: Configuración saneada e inyección de almacenamiento persistente.
 * 2. ViewportMetricsService: Medición del viewport y métricas del sistema.
 * 3. SplitViewDetectorService: Detección especializada de vista dividida y ampliación al máximo.
 * 4. BrowserEnvironmentService: Detección del motor nativo y pantalla completa.
 * 5. PointerPrecisionService: Corrección de coordenadas y etiquetas multimedia.
 * 6. ScrollSynchronizationService: Sincronización de scroll visual y lógico.
 * 7. ZoomExecutionEngine: Motor central de aplicación de zoom con histéresis y rAF.
 * 8. UserInterfaceController: Ventana modal emergente y menú de comandos.
 * 
 * Contenedor Orquestador: ApplicationContainer (src/container.js).
 */

import { ApplicationContainer } from './container.js';

(function initializeAutoShrinkScriptScope() {
  'use strict';

  // Guardián de seguridad: Evitar ejecución dentro de iFrames anidados o restringidos
  try {
    if (window.top !== window.self) return;
  } catch (e) {
    return;
  }

  // Instanciar el Contenedor de Inyección de Dependencias
  const container = new ApplicationContainer({
    windowProvider: typeof window !== 'undefined' ? window : null,
    documentProvider: typeof document !== 'undefined' ? document : null,
    screenProvider: typeof screen !== 'undefined' ? screen : null,
    unsafeWindowProvider: typeof unsafeWindow !== 'undefined' ? unsafeWindow : null,
    getValue: typeof GM_getValue === 'function' ? GM_getValue : null,
    setValue: typeof GM_setValue === 'function' ? GM_setValue : null,
    addValueChangeListener: typeof GM_addValueChangeListener === 'function' ? GM_addValueChangeListener : null,
    removeValueChangeListener: typeof GM_removeValueChangeListener === 'function' ? GM_removeValueChangeListener : null,
    menuRegisterer: typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : null
  });

  if (document.documentElement) {
    container.initialize();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => container.initialize(), { once: true });
  } else {
    container.initialize();
  }

  window.addEventListener('beforeunload', () => container.destroy(), { once: true });
})();