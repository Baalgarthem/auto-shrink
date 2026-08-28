# Guía para agentes

## Descripción del repositorio

Auto-Shrink es un userscript autocontenido que ajusta dinámicamente el zoom de cualquier página según el ancho disponible del viewport. El código fue modularizado con `esbuild` para mejorar el mantenimiento.

## Estructura

- `src/`: Código fuente modular (separado en config, core, ui).
- `docs/`: Documentación técnica (requisitos, funciones, bugs, módulos, diario de desarrollo) y archivo base `legacy_auto-shrink.user.js` como referencia/backup.
- `dist/`: Archivos construidos para distribución (ej. `dist/auto-shrink.user.js` generado por esbuild).

## Convenciones de trabajo

- Mantén el proyecto autocontenido y compatible con gestores como Tampermonkey y Violentmonkey.
- Actualiza `@version` cuando cambie el comportamiento distribuido y mantén coherentes los textos de versión visibles dentro del script en `index.js`.
- Si se añade una API `GM_*`, declárala también mediante `@grant` en el bloque de metadatos.
- Usa JavaScript compatible con navegadores modernos basados en Blink y Gecko.
- Los ajustes persistentes deben pasar por `ConfigurationService`, incluir un valor predeterminado y sanear entradas externas.

## Protocolos Obligatorios

1. **Gestión de Errores (Bug Trace):** Todo bug sin excepción se debe revisar, reportar y analizar desde el archivo `docs/bug-trace.md`, siguiendo estrictamente la estructura tabular y las reglas irrevocables definidas en la cabecera de ese archivo.
2. **Registro de Cambios (Diario de Desarrollo):** Todo cambio en el código se debe documentar obligatoriamente en el archivo `docs/desarrollo.md`. El archivo debe estar seccionado por módulos. Si se crea un nuevo módulo, se añade una nueva sección. Si los módulos se relacionan o interactúan, se debe indicar claramente en este documento el porqué, de qué forma y con qué elementos o funciones del otro módulo se vinculan.

## Verificación

- Ejecuta `npx esbuild` según las instrucciones de `requerimientos.md` para verificar que el código transpila sin errores.
- Prueba manualmente la instalación en Tampermonkey o Violentmonkey.

## Alcance de los cambios

- Solo manipula archivos dentro de `src/` cuando programes características o soluciones.
- Asegúrate de empaquetar ejecutando el comando de build si se solicita antes de dar por terminado un trabajo.
