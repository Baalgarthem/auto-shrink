import { MODAL_STYLE_ID, CONFIGURATION_MODAL_OVERLAY_ID, SCALING_MODES } from '../config/constants.js';
import { ConfigurationService } from '../config/configuration.js';
import { ZoomExecutionEngine } from '../core/engine.js';
/**
   * Controlador de la ventana modal de configuración con indicador de estado en tiempo real.
   */
  export const UserInterfaceController = (function () {
    function injectModalStyles() {
      if (document.getElementById(MODAL_STYLE_ID)) return;
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
        const styleElement = document.createElement('style');
        styleElement.id = MODAL_STYLE_ID;
        styleElement.textContent = modalStylesCssText;
        const targetParent = document.head || document.documentElement;
        if (targetParent) targetParent.appendChild(styleElement);
      } catch (e) { }
    }

    function destroyModal(overlayElement, listenerBindings) {
      if (!overlayElement) return;

      if (Array.isArray(listenerBindings)) {
        for (const binding of listenerBindings) {
          if (binding.element && typeof binding.listener === 'function') {
            binding.element.removeEventListener(binding.type, binding.listener);
          }
        }
      }
      overlayElement.remove();
    }

    /**
     * Renderiza la ventana modal con insignias de estado activo en tiempo real.
     */
    function renderModal() {
      try {
        if (document.getElementById(CONFIGURATION_MODAL_OVERLAY_ID)) return;

        injectModalStyles();

        const config = ConfigurationService.getSanitizedConfig();
        const monitorWidth = ViewportMetricsService.getScreenWidth() || 1920;
        const currentViewportWidthPx = window.innerWidth || monitorWidth;
        const isSplitView = config.isSplitViewAdaptationEnabled && (currentViewportWidthPx / monitorWidth) < 0.90;
        const engine = BrowserEnvironmentService.detectNativeBrowserEngine();

        const overlayElement = document.createElement('div');
        overlayElement.id = CONFIGURATION_MODAL_OVERLAY_ID;

        const isThresholdMode = config.scalingMode === SCALING_MODES.THRESHOLDS;
        const isCustomBase = config.referenceBaseWidthSetting !== 'auto';

        overlayElement.innerHTML = `
          <div class="as-dialog-card">
            <h2>
              <span>⚙️ Configuración Auto-Shrink</span>
              <span style="font-size:12px;color:#64748b;font-weight:normal;">v5.5.1</span>
            </h2>

            <!-- Insignias de Estado en Tiempo Real -->
            <div class="as-status-badge-container">
              <div class="as-status-badge">🌐 Motor: ${engine.toUpperCase()}</div>
              <div class="as-status-badge">📱 Vista Dividida: ${isSplitView ? 'ACTIVA' : 'Inactiva (Full)'}</div>
              <div class="as-status-badge">🔒 Límites: ${Math.round(config.minimumZoomScaleLimit * 100)}% - ${Math.round(config.maximumZoomScaleLimit * 100)}%</div>
            </div>

            <!-- SECCIÓN: VISTA DIVIDIDA Y PANTALLA COMPLETA -->
            <div class="as-config-section">
              <div class="as-section-title">Vista Dividida y Pantalla Completa</div>
              <div class="as-field-group">
                <label class="as-checkbox-label">
                  <input type="checkbox" id="as-checkbox-split-view" ${config.isSplitViewAdaptationEnabled ? 'checked' : ''}>
                  📱 Adaptación Inteligente para Vista Dividida (Firefox / Chrome / Edge / Windows Snap)
                </label>
                <label class="as-checkbox-label">
                  <input type="checkbox" id="as-checkbox-reset-fullscreen" ${config.isResetInFullscreenEnabled ? 'checked' : ''}>
                  📺 Restaurar zoom al 100% nativo al poner el video en Pantalla Completa
                </label>
                <label class="as-checkbox-label">
                  <input type="checkbox" id="as-checkbox-media-pointer" ${config.isMediaPointerPrecisionEnabled ? 'checked' : ''}>
                  🎯 Alinear cursor y etiquetas de tiempo en controles multimedia
                </label>
              </div>
            </div>

            <!-- SECCIÓN: MODO DE ESCALADO -->
            <div class="as-config-section">
              <div class="as-section-title">Modo de Escalado</div>
              <div class="as-field-group">
                <select id="as-select-scaling-mode">
                  <option value="${SCALING_MODES.CONTINUOUS}" ${!isThresholdMode ? 'selected' : ''}>Continuo / Proporcional (Dinámico)</option>
                  <option value="${SCALING_MODES.THRESHOLDS}" ${isThresholdMode ? 'selected' : ''}>Por Umbrales de Tamaño (&lt;80%, &lt;60%, &lt;40%, &lt;20%)</option>
                </select>
              </div>
            </div>

            <!-- SECCIÓN: PANTALLA BASE -->
            <div class="as-config-section">
              <div class="as-section-title">Pantalla Base de Referencia (100% Zoom)</div>
              <div class="as-field-group">
                <select id="as-select-base-width-type">
                  <option value="auto" ${!isCustomBase ? 'selected' : ''}>Detección Automática (Monitor Actual)</option>
                  <option value="custom" ${isCustomBase ? 'selected' : ''}>Personalizado (Píxeles fijos)</option>
                </select>
              </div>
              <div class="as-field-group" id="as-container-custom-width" style="display: ${isCustomBase ? 'block' : 'none'};">
                <label for="as-input-custom-width">Ancho en Píxeles (ej: 1920, 2560, 1366):</label>
                <input type="number" id="as-input-custom-width" value="${isCustomBase ? config.referenceBaseWidthSetting : 1920}" min="800" max="7680">
              </div>
            </div>

            <!-- SECCIÓN: UMBRALES (BREAKPOINTS) -->
            <div class="as-config-section" id="as-section-thresholds-container" style="display: ${isThresholdMode ? 'block' : 'none'};">
              <div class="as-section-title">Niveles de Zoom por Tamaño de Ventana</div>
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

            <!-- SECCIÓN: LÍMITES GLOBALES -->
            <div class="as-config-section">
              <div class="as-section-title">Límites de Zoom Absolutos (Anti-Sobrescalado)</div>
              <div class="as-grid-two-columns">
                <div class="as-field-group">
                  <label for="as-input-minimum-zoom">Zoom Mínimo (%):</label>
                  <input type="number" id="as-input-minimum-zoom" value="${Math.round(config.minimumZoomScaleLimit * 100)}" min="10" max="100">
                </div>
                <div class="as-field-group">
                  <label for="as-input-maximum-zoom">Zoom Máximo (%):</label>
                  <input type="number" id="as-input-maximum-zoom" value="${Math.round(config.maximumZoomScaleLimit * 100)}" min="50" max="200">
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

        const targetParent = document.body || document.documentElement;
        if (targetParent) {
          targetParent.appendChild(overlayElement);
        }

        const scalingModeSelect = overlayElement.querySelector('#as-select-scaling-mode');
        const thresholdsContainer = overlayElement.querySelector('#as-section-thresholds-container');
        const baseWidthSelect = overlayElement.querySelector('#as-select-base-width-type');
        const customWidthContainer = overlayElement.querySelector('#as-container-custom-width');
        const buttonReset = overlayElement.querySelector('#as-button-reset');
        const buttonCancel = overlayElement.querySelector('#as-button-cancel');
        const buttonSave = overlayElement.querySelector('#as-button-save');

        const listenerBindings = [];

        const handleModeChange = () => {
          thresholdsContainer.style.display = scalingModeSelect.value === SCALING_MODES.THRESHOLDS ? 'block' : 'none';
        };

        const handleBaseChange = () => {
          customWidthContainer.style.display = baseWidthSelect.value === 'custom' ? 'block' : 'none';
        };

        const handleCancel = () => {
          destroyModal(overlayElement, listenerBindings);
        };

        const handleReset = () => {
          ConfigurationService.resetAll();
          ZoomExecutionEngine.applyViewportZoomScale(true);
          destroyModal(overlayElement, listenerBindings);
        };

        const handleSave = () => {
          const modeVal = scalingModeSelect.value;
          let baseVal = 'auto';

          if (baseWidthSelect.value === 'custom') {
            const parsedWidth = parseInt(overlayElement.querySelector('#as-input-custom-width').value, 10);
            baseVal = (Number.isFinite(parsedWidth) && parsedWidth > 0) ? parsedWidth : 1920;
          }

          const minZoom = ConfigurationService.sanitizeNumeric(
            overlayElement.querySelector('#as-input-minimum-zoom').value,
            20, 5, 100
          );
          const maxZoom = ConfigurationService.sanitizeNumeric(
            overlayElement.querySelector('#as-input-maximum-zoom').value,
            100, minZoom, 200
          );

          const s80 = ConfigurationService.sanitizeNumeric(overlayElement.querySelector('#as-input-threshold-80').value, 85, 10, 150) / 100;
          const s60 = ConfigurationService.sanitizeNumeric(overlayElement.querySelector('#as-input-threshold-60').value, 70, 10, 150) / 100;
          const s40 = ConfigurationService.sanitizeNumeric(overlayElement.querySelector('#as-input-threshold-40').value, 55, 10, 150) / 100;
          const s20 = ConfigurationService.sanitizeNumeric(overlayElement.querySelector('#as-input-threshold-20').value, 35, 10, 150) / 100;

          const isFullscreen = overlayElement.querySelector('#as-checkbox-reset-fullscreen').checked;
          const isSplitView = overlayElement.querySelector('#as-checkbox-split-view').checked;
          const isMediaPointerPrecisionEnabled = overlayElement.querySelector('#as-checkbox-media-pointer').checked;

          ConfigurationService.setMany({
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
            isSplitViewAdaptationEnabled: isSplitView
          });

          ZoomExecutionEngine.applyViewportZoomScale(true);
          destroyModal(overlayElement, listenerBindings);
        };

        scalingModeSelect.addEventListener('change', handleModeChange);
        listenerBindings.push({ element: scalingModeSelect, type: 'change', listener: handleModeChange });

        baseWidthSelect.addEventListener('change', handleBaseChange);
        listenerBindings.push({ element: baseWidthSelect, type: 'change', listener: handleBaseChange });

        buttonCancel.addEventListener('click', handleCancel);
        listenerBindings.push({ element: buttonCancel, type: 'click', listener: handleCancel });

        buttonReset.addEventListener('click', handleReset);
        listenerBindings.push({ element: buttonReset, type: 'click', listener: handleReset });

        buttonSave.addEventListener('click', handleSave);
        listenerBindings.push({ element: buttonSave, type: 'click', listener: handleSave });

      } catch (e) {
        console.error('[Auto-Shrink] Error al renderizar modal:', e);
      }
    }

    function registerMenuCommands() {
      try {
        if (typeof GM_registerMenuCommand === 'function') {
          GM_registerMenuCommand('⚙️ Configurar Auto-Shrink v5.6.0', renderModal);
          GM_registerMenuCommand('🔄 Restablecer Valores', () => {
            ConfigurationService.resetAll();
            ZoomExecutionEngine.applyViewportZoomScale(true);
          });
          GM_registerMenuCommand('🌐 Ver Repositorio en GitHub', () => {
            window.open('https://github.com/Baalgarthem/auto-shrink', '_blank');
          });
        }
      } catch (e) { }
    }

    return {
      renderModal,
      registerMenuCommands
    };
  })();