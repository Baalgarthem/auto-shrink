# Guia de Uso y Configuracion - Auto-Shrink

Este documento explica de forma propedeutica el funcionamiento del panel de opciones y como ajustar los parametros de Auto-Shrink.

---

## Acceso al Panel de Opciones

Para abrir la ventana emergente de configuracion:

1. Haga clic en el icono de la extension **Violentmonkey** (o Tampermonkey) en la barra del navegador.
2. Seleccione la opcion **Configurar Auto-Shrink v2.6**.

---

## Explicacion de Opciones

### 1. Compatibilidad de Video y Cursor
- **Corregir precision del raton en reproductores y controles**: Activa la intercepcion matematica de coordenadas en barras de reproduccion de video (YouTube, reproductores HTML5) y controles deslizantes.
- **Restaurar zoom al 100% nativo al poner el video en Pantalla Completa**: Ajusta temporalmente el zoom al 100% mientras un video se reproduce en modo Pantalla Completa.

### 2. Modo de Escalado
- **Continuo / Proporcional (Dinamico)**: El zoom se ajusta gradualmente de forma exactamente proporcional al tamano de la ventana.
- **Por Umbrales de Tamano**: Aplica niveles de zoom fijos segun cuatro rangos de ancho de ventana (<80%, <60%, <40%, <20%).

### 3. Pantalla Base de Referencia
- **Deteccion Automatica**: Toma el ancho en pixeles del monitor actual.
- **Personalizado**: Permite ingresar un valor fijo en pixeles (por ejemplo: 1920, 2560, 1366).

### 4. Limites de Zoom Absolutos
- **Zoom Minimo (%)**: Establece el porcentaje minimo permitido para el zoom (por defecto 20%).
- **Zoom Maximo (%)**: Establece el porcentaje maximo permitido para el zoom (por defecto 100%).
