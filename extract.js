const fs = require('fs');
const path = require('path');

const src = fs.readFileSync('auto-shrink.user.js', 'utf8');

// The file has clear comments: 
// // ============================================================================
// // 1. SERVICIO DE CONFIGURACIÓN Y SANEAMIENTO (ConfigurationService)
// // ============================================================================

const sections = src.split('// ============================================================================');

let metadata = sections[0].trim();
let consts = sections[2].trim();
let configSrc = sections[4].trim();
let metricsSrc = sections[6].trim();
let pointerSrc = sections[8].trim();
let scrollSrc = sections[10].trim();
let envSrc = sections[12].trim();
let engineSrc = sections[14].trim();
let uiSrc = sections[16].trim();
let initSrc = sections[18].trim(); 

// Replace module patterns with export
function makeExport(str, varName) {
    return str.replace(`const ${varName} = (function () {`, `export const ${varName} = (function () {`);
}

configSrc = `import { SCALING_MODES, DEFAULT_CONFIGURATION, CONFIGURATION_KEYS } from './constants.js';\nimport { ZoomExecutionEngine } from '../core/engine.js';\n` + makeExport(configSrc, 'ConfigurationService');
metricsSrc = `import { SCALING_MODES, BREAKPOINT_HYSTERESIS } from '../config/constants.js';\n` + makeExport(metricsSrc, 'ViewportMetricsService');
pointerSrc = `import { SCALE_DECIMAL_FACTOR, SCALE_SYNCHRONIZATION_EPSILON } from '../config/constants.js';\n` + makeExport(pointerSrc, 'PointerPrecisionService');
scrollSrc = `import { PointerPrecisionService } from './pointer.js';\nimport { BrowserEnvironmentService } from './environment.js';\n` + makeExport(scrollSrc, 'ScrollSynchronizationService');
envSrc = makeExport(envSrc, 'BrowserEnvironmentService');
engineSrc = `import { SCALE_UPDATE_HYSTERESIS } from '../config/constants.js';\nimport { ConfigurationService } from '../config/configuration.js';\nimport { ViewportMetricsService } from './metrics.js';\nimport { PointerPrecisionService } from './pointer.js';\nimport { ScrollSynchronizationService } from './scroll.js';\nimport { BrowserEnvironmentService } from './environment.js';\nimport { UserInterfaceController } from '../ui/interface.js';\n` + makeExport(engineSrc, 'ZoomExecutionEngine');
uiSrc = `import { MODAL_STYLE_ID, CONFIGURATION_MODAL_OVERLAY_ID, SCALING_MODES } from '../config/constants.js';\nimport { ConfigurationService } from '../config/configuration.js';\nimport { ZoomExecutionEngine } from '../core/engine.js';\n` + makeExport(uiSrc, 'UserInterfaceController');

// fix constants
let constantsExport = consts.replace(/const /g, 'export const ');

fs.mkdirSync('src/config', { recursive: true });
fs.mkdirSync('src/core', { recursive: true });
fs.mkdirSync('src/ui', { recursive: true });

fs.writeFileSync('src/config/constants.js', constantsExport);
fs.writeFileSync('src/config/configuration.js', configSrc);
fs.writeFileSync('src/core/metrics.js', metricsSrc);
fs.writeFileSync('src/core/pointer.js', pointerSrc);
fs.writeFileSync('src/core/scroll.js', scrollSrc);
fs.writeFileSync('src/core/environment.js', envSrc);
fs.writeFileSync('src/core/engine.js', engineSrc);
fs.writeFileSync('src/ui/interface.js', uiSrc);

// Fix initSrc (the bottom of the script)
initSrc = `import { ConfigurationService } from './config/configuration.js';
import { PointerPrecisionService } from './core/pointer.js';
import { ScrollSynchronizationService } from './core/scroll.js';
import { BrowserEnvironmentService } from './core/environment.js';
import { ZoomExecutionEngine } from './core/engine.js';
import { UserInterfaceController } from './ui/interface.js';

${initSrc.replace('})();', '')}`;

const indexJS = `${metadata.replace(/\(function initializeAutoShrinkScriptScope\(\) \{/, '').trim()}

${initSrc.split('\n\n')[0]}

(function initializeAutoShrinkScriptScope() {
  'use strict';
  try {
    if (window.top !== window.self) return;
  } catch (e) {
    return;
  }
  
${initSrc.substring(initSrc.indexOf('\n\n') + 2)}
})();`;

fs.writeFileSync('src/index.js', indexJS);
console.log('done');
