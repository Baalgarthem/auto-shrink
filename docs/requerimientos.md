# Requerimientos del Proyecto y Guía de Instalación

## Herramientas Necesarias
1. **Node.js**: Entorno de ejecución para JavaScript.
2. **NPM**: Gestor de paquetes (Node Package Manager).
3. **esbuild**: Empaquetador ultra rápido para JavaScript.

## Instalación de esbuild paso a paso en Windows 11
1. **Instalar Node.js**: Descarga e instala Node.js desde su página oficial si aún no lo tienes.
2. **Abrir la terminal**: Abre PowerShell o CMD y navega a la carpeta del proyecto.
3. **Inicializar proyecto**: Ejecuta `npm init -y` para crear el archivo `package.json`.
4. **Instalar esbuild**: Ejecuta `npm install esbuild --save-dev` para instalarlo como dependencia de desarrollo.

## Comandos básicos de esbuild
- **Empaquetar script completo:**
  ```powershell
  npx esbuild src/index.js --bundle --outfile=dist/auto-shrink.user.js
  ```
- **Empaquetar y minificar para producción:**
  ```powershell
  npx esbuild src/index.js --bundle --minify --outfile=dist/auto-shrink.user.js
  ```
- **Modo observador (desarrollo activo):**
  ```powershell
  npx esbuild src/index.js --bundle --watch --outfile=dist/auto-shrink.user.js
  ```
