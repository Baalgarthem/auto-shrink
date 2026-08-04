# Arquitectura Tecnica y Patron de Diseno - Auto-Shrink

Este documento detalla la estructura interna, los modulos de software y las decisiones de diseno aplicadas en el desarrollo del script Auto-Shrink.

---

## Principios de Diseno

El codigo esta desarrollado siguiendo los principios de **Clean Code** y **Desacoplamiento Modular**. Para evitar la contaminacion del espacio de nombres global de la pagina web, todo el script se ejecuta dentro de una expresion de funcion ejecutada inmediatamente (IIFE).

---

## Modulos y Servicios

### 1. Servicio de Configuracion (ConfigurationService)
Administra la lectura y escritura de parametros mediante la API de la extension (`GM_getValue` y `GM_setValue`).
- **Cache Local**: Mantiene los valores de configuracion en memoria para evitar llamadas redundantes de lectura al almacenamiento de la extension.
- **Saneamiento de Datos**: La funcion `sanitizeNumeric` verifica que todos los valores introducidos por el usuario sean numeros finitos validos dentro de rangos seguros.

### 2. Servicio de Metricas del Viewport (ViewportMetricsService)
Se encarga del calculo matematico de las proporciones de escalado.
- **Calculo de Pantalla Base**: Obtiene la resolucion del monitor del usuario o utiliza el valor fijo configurado.
- **Formulas de Zoom**: Calcula la relacion `ancho_actual / ancho_base` para el modo continuo, o selecciona el nivel de zoom correspondiente en el modo por umbrales.

### 3. Servicio de Proteccion de Medios (MediaProtectionService)
Protege la experiencia de usuario en reproductores multimedia y elementos interactivos.
- **Parche de Coordenadas**: Modifica los accessores de lectura (`clientX`, `clientY`, etc.) en el prototipo `MouseEvent` y `PointerEvent` para corregir la distorsion causada por el zoom.
- **Inyeccion de Estilos**: Aplica reglas de maquetacion dinamicas en el documento.

### 4. Motor de Ejecucion de Zoom (ZoomExecutionEngine)
Aplica los cambios de transformacion en el DOM de forma eficiente.
- **Emulacion de Zoom Nativo**: Asigna `width: 100% / escala` y `min-height: 100vh / escala` en `document.documentElement` para eliminar espacios en blanco laterales e inferiores.
- **Sincronizacion por Observadores**: Utiliza `ResizeObserver` para detectar cambios en el diseno de aplicaciones de una sola pagina (SPAs) y `MutationObserver` para evitar sobreescrituras no deseadas.
- **Cuadros de Animacion**: Coordina la aplicacion de estilos usando `requestAnimationFrame` para maximizar el rendimiento visual.

### 5. Controlador de Interfaz de Usuario (UserInterfaceController)
Genera la ventana emergente de configuracion.
- **Contra-Escalado Inverso**: Aplica `zoom: calc(1 / escala)` al contenedor del modal para que la ventana permanezca a tamano real 100% (sin encogerse) independientemente del nivel de zoom de la pagina.
- **Destruccion Limpia**: Elimina los escuchadores de eventos y el elemento modal del DOM al cerrar la ventana.
