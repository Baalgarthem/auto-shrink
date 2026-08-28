# Compatibilidad de Maquetacion y Precision del Puntero - Auto-Shrink

Este documento analiza los mecanismos tecnicos utilizados para evitar distorsiones en las paginas web y mantener la precision exacta del raton.

---

## 1. Emulacion de Zoom Nativo sin Espacios Blancos

Cuando se aplica una transformacion de zoom en un documento HTML, el tamano visual del documento se reduce. Si no se ajusta el ancho de maquetacion, se forman grandes franjas blancas en la parte derecha e inferior de la pantalla.

Auto-Shrink soluciona este problema expandiendo dinamicamente las dimensiones del contenedor `html`:
- **Ancho de Maquetacion**: `width: calc(100% / escala)`
- **Altura Minima**: `min-height: calc(100vh / escala)`

Al renderizar la pagina web en un espacio expandido y luego aplicar el zoom, el contenido cubre exactamente el 100% de la ventana, igual que el zoom nativo del navegador.

---

## 2. Correccion Matematica del Puntero del Raton

Los reproductores de video y controles deslizantes calculan la posicion de clic restando la posicion del raton (`clientX`) menos la coordenada izquierda del elemento (`getBoundingClientRect().left`).

Dado que `clientX` es reportado en pixeles fisicos sin escalar y `getBoundingClientRect()` entrega valores escalados, se produce un desfase.

Auto-Shrink intercepta la lectura de `clientX`, `clientY`, `pageX`, `pageY`, `offsetX` y `offsetY` en los prototipos `MouseEvent` y `PointerEvent`, dividiendo el valor por la escala activa (`coordenada_fisica / escala`). De este modo, la operacion matematica del reproductor se ejecuta con valores equivalentes, logrando una precision del 100%.
