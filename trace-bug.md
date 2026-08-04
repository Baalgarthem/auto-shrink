# Documento de Seguimiento de Error - trace-bug.md

**Estado Actual del Error**: 🔴 **PENDIENTE / EN PROGRESO**  
**Fecha de Inicio del Rastro**: 2026-08-04  
**Proyecto / Repositorio**: `auto-shrink` (`D:\Scripts\web-userscripts\auto-shrink`)  
**Remoto Oficial**: `git@github.com:Baalgarthem/auto-shrink.git`  
**Rama Principal**: `principal` (sincronizada en remoto con `main` y `master`)

---

## 1. Descripcion del Problema
El usuario reporta que al acceder a la interfaz web de GitHub ([`https://github.com/Baalgarthem/auto-shrink`](https://github.com/Baalgarthem/auto-shrink)), la pagina no muestra ningun commit ni los archivos del proyecto, presentando la apariencia de un repositorio vacio o sin publicaciones, a pesar de que los comandos `git add`, `git commit` y `git push` finalizan sin errores en la terminal local.

---

## 2. Historial de Intentos y Diagnosticos Realizados

### Intento 1: Implementacion de Candados y Script `push-tree.sh` v2.3
- **Accion**: Se creo y mejoro `push-tree.sh` con 5 candados de validacion para submódulos en Windows PowerShell.
- **Resultado**: `push-tree` se ejecutaba localmente pero se detecto un bucle en el descubrimiento ascendente por resolucion descendente de `git rev-parse --show-toplevel`.

### Intento 2: Correccion de Bucle y Reescritura a `push-tree.sh` v3.0 / v3.1 / v3.2
- **Accion**: Se reemplazo `git rev-parse --show-toplevel` por la navegacion fisica canonica (`cd "$dir/.." && pwd -P`) y se agrego `GIT_TERMINAL_PROMPT=0` para evitar bloqueos por credenciales.
- **Resultado**: El script recorre exitosamente los 3 niveles (`auto-shrink` -> `web-userscripts` -> `Scripts`), realizando `git add`, `commit` y `push` en los 3 repositorios.

### Intento 3: Publicacion y Sincronizacion Multirrama (`push-tree.sh` v3.3)
- **Accion**: Se detecto que GitHub suele configurar por defecto la rama `main` o `master` en repositorios nuevos. Se forzo la replicacion automatica de la rama local `principal` hacia `origin/main` y `origin/master`.
- **Resultado**: `git push origin principal:main` y `git push origin principal:master` se ejecutaron con exito (`* [new branch] principal -> main` / `* [new branch] principal -> master`).

### Intento 4: Verificacion Empirica mediante Peticion HTTP en Vivo
- **Accion**: Se realizo una consulta HTTP directa a `https://raw.githubusercontent.com/Baalgarthem/auto-shrink/principal/auto-shrink.user.js`.
- **Resultado**: El servidor de GitHub devolvio en vivo el contenido completo de `Auto-Shrink v3.6.0` (55.5 KB).

### Intento 5: Prueba de Clonado Limpio desde el Servidor Remoto
- **Accion**: Se ejecuto `git clone git@github.com:Baalgarthem/auto-shrink.git` en un directorio temporal aislado (`scratch/clone_test`).
- **Resultado**: **ÉXITO TOTAL EN CLONADO**. El comando descargo exactamente el repositorio con `auto-shrink.user.js`, la carpeta `docs` y el historial de commits. Esto demuestra empiricamente que **el codigo SI reside en los servidores de GitHub**.

---

## 3. Hipotesis en Investigacion Activa (Causas Raiz Pendientes de Confirmacion)

### Hipotesis A: Visibilidad / Permisos de Cuenta en el Navegador Web
- Si el repositorio `Baalgarthem/auto-shrink` esta configurado como **Privado** en GitHub, y el usuario abre la URL en un navegador donde esta sesionado con otra cuenta de GitHub (o sin iniciar sesion), GitHub muestra una pagina de error 404 o la plantilla de inicio de repositorio vacio.

### Hipotesis B: Caché Persistente de Service Workers en la Interfaz Web de GitHub
- La aplicacion web de GitHub utiliza Service Workers y memoria caché local en el navegador. Si el usuario cargo la pagina cuando el repositorio estaba recien creado y vacio, el navegador continua sirviendo la vista en caché hasta hacer una recarga completa (`Ctrl + Shift + R`) o probar en incognito.

### Hipotesis C: Sensibilidad a Mayusculas/Minusculas (Case Sensitivity) en la URL
- La URL en GitHub podria estar creada con variaciones de capitalizacion (ej: `Auto-Shrink` vs `auto-shrink`).

---

## 4. Proximos Pasos y Plan de Pruebas
1. Mantener el estado marcado como **PENDIENTE** hasta obtener la confirmacion explicita del usuario.
2. Continuar realizando verificaciones cruzadas en el entorno local y en los submódulos contenedores.
