# Arquitectura Tecnica y Patron de Diseno - Auto-Shrink v3.2.0

Este documento detalla la estructura interna, los modulos de software y las decisiones de diseno aplicadas en el desarrollo del script Auto-Shrink.

---

## Principios de Diseno y Clean Code en Espanol

El codigo esta desarrollado siguiendo los principios de **Clean Code** y **Desacoplamiento Modular**. Todo el script se ejecuta dentro de una expresion de funcion ejecutada inmediatamente (IIFE) para evitar la contaminacion del espacio de nombres global.

---

## Estructura de Modulos y Servicios (v3.2.0)

### 1. Servicio de Configuracion y Saneamiento (ConfigurationService)
Administra el almacenamiento persistente (`GM_getValue`/`GM_setValue`), la cache inmutable en memoria y la validacion cruzada de limites.
- **Cache Inmutable (`getSanitizedConfig`)**: Retorna una instantanea inmutable y con validacion de tipos en tiempo de ejecucion.
- **Validacion Cruzada (`min <= max`)**: Garantiza que el limite minimo nunca sea mayor que el maximo configurado por el usuario.

### 2. Servicio de Metricas del Viewport (ViewportMetricsService)
Se encarga del calculo matematico de las proporciones de escalado y contexto de vista dividida.
- **Deteccion de Vista Dividida (`detectSplitViewContext`)**: Analiza la proporcion de la ventana frente al monitor e identifica si esta acoplada o dividida (Firefox Split Tabs, Chrome Side-by-Side, Edge, Windows Snap).
- **Limites Dinamicos (`computeDynamicSplitBounds`)**: Recalcula los limites minimo y maximo efectivos para pestañas divididas.

### 3. Servicio de Estabilizacion Visual y Responsiva (VisualStabilizationService) [MODULO ESPECIALIZADO]
Modulo especializado en la contencion de maquetacion y adaptacion responsiva multitarea.
- **Estabilizacion de Contenedores**: Inyecta reglas de maquetacion fluida en `body`, `#app`, `#root`, `main`, `article`, `section`, `header`, `footer`, `nav`, `.container`, `.wrapper`.
- **Contencion de Elementos Anchos**: Ajuste automatico para tablas, bloques de codigo (`pre`, `code`), galerias y contenedores flex/grid.
- **Variables CSS Globales (`updateGlobalCssVariables`)**: Exponen `--auto-shrink-scale`, `--auto-shrink-inv-scale`, `--auto-shrink-viewport-width`, `--auto-shrink-is-split-view` y `--auto-shrink-effective-base`.

### 4. Servicio de Proteccion de Medios y Puntero (MediaProtectionService)
Protege la experiencia en reproductores multimedia y elementos interactivos.
- **Deteccion de Motor (`detectNativeBrowserEngine`)**: Aplica optimizaciones especificas para Gecko (Firefox) y Blink (Chromium/Edge).
- **Precision 1:1 de Puntero**: Inyecta reglas CSS para captura inmediata de eventos en `input[type="range"]`, barras de progreso, canvas y SVG.

### 5. Motor de Ejecucion de Zoom (ZoomExecutionEngine)
Aplica las transformaciones en el DOM de forma eficiente y sin parpadeos.
- **Bloqueo Anti-Sobrescalado (`lockScaleBounds`)**: Detiene y fija el zoom exactamente en el limite configurado si la pagina o el usuario intentan superar el maximo.
- **Sincronizacion por Observadores**: Coordina ejecuciones mediante `requestAnimationFrame`, `MutationObserver` y `ResizeObserver`.

### 6. Controlador de Interfaz de Usuario (UserInterfaceController)
Genera la ventana emergente de configuracion.
- **Contra-Escalado Inverso**: Aplica `zoom: calc(1 / escala)` para mantener la ventana modal a tamano real 100% sin encogerse.
- **Insignias de Estado en Tiempo Real**: Muestra insignias con el motor activo, estado de vista dividida y limites configurados.
