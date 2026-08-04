# Documentacion de Auto-Shrink Userscript

Auto-Shrink es una herramienta de optimizacion visual desarrollada para la extension Violentmonkey (compatible con Tampermonkey y Greasemonkey). Su proposito es ajustar de forma inteligente el tamano de las paginas web cuando la ventana del navegador se reduce.

- **Repositorio Oficial en GitHub**: [https://github.com/Baalgarthem/auto-shrink](https://github.com/Baalgarthem/auto-shrink)
- **URL de Descarga Directa**: [https://raw.githubusercontent.com/Baalgarthem/auto-shrink/principal/auto-shrink.user.js](https://raw.githubusercontent.com/Baalgarthem/auto-shrink/principal/auto-shrink.user.js)
- **Autor**: Baalgarthem

---

## Ventajas y Beneficios Principales

### 1. Multitarea y Pantalla Dividida Sin Esfuerzo
Al trabajar con varias aplicaciones en la misma pantalla (por ejemplo, situar el navegador a la mitad o a un cuarto de la pantalla), muchas paginas web no adaptan su diseno de forma comoda. Auto-Shrink reduce automaticamente la escala del sitio web para que todo el contenido siga siendo visible sin necesidad de desplazarse horizontalmente.

### 2. Cobertura Total de Pantalla Sin Espacios Blancos
A diferencia de otros metodos de reduccion que dejan margenes vacios a los lados, Auto-Shrink emula el comportamiento de reduccion del navegador. La pagina web cubre el 100% de la ventana disponible, garantizando una lectura limpia, fluida y organizada.

### 3. Precision Exacta en Reproductores de Video
En muchos sitios web, ajustar el tamano de la pagina hace que el puntero del raton pierda precision al hacer clic en las barras de progreso de los videos. Auto-Shrink corrige este desfase, asegurando que cada clic sobre la barra de reproduccion (en YouTube o cualquier reproductor web) responda exactamente en la posicion elegida.

### 4. Restauracion Automatica en Pantalla Completa
Cuando el usuario activa el modo de pantalla completa en un video o presentacion, el script restablece el tamano al 100% nativo automaticamente. Al salir de la pantalla completa, la reduccion inteligente se reanuda sin requerir intervencion del usuario.

### 5. Adaptabilidad Personalizada
El usuario puede elegir la forma en que desea que la pagina se reduzca:
- **Modo Continuo**: Ajusta la escala gradualmente en funcion del tamano exacto de la ventana.
- **Modo por Rangos**: Aplica porcentajes de tamano fijos definidos por el usuario cuando la ventana se reduce por debajo de ciertos umbrales (80%, 60%, 40% y 20%).

### 6. Panel de Configuracion Claro y Legible
La ventana emergente de opciones se despliega siempre a tamano completo con letras grandes y legibles, garantizando que el usuario pueda personalizar los ajustes de forma comoda sin importar cuan pequena sea la ventana del navegador.

---

## Guia de Instalacion

1. Instale la extension Violentmonkey en su navegador web.
2. Descargue o copie el codigo fuente desde [auto-shrink.user.js](https://raw.githubusercontent.com/Baalgarthem/auto-shrink/principal/auto-shrink.user.js).
3. En el panel de control de Violentmonkey, seleccione la opcion para crear un nuevo script y pegue el codigo.
4. Guarde el script.

---

## Guia de Configuracion

1. Haga clic en el icono de la extension Violentmonkey en la barra de herramientas del navegador.
2. Seleccione la opcion **Configurar Auto-Shrink**.
3. Personalice el modo de escalado y los limites deseados en la ventana emergente.
4. Presione el boton **Guardar y Aplicar** para almacenar los cambios.
