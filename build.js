const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─────────────────────────────────────────────
// Configuración y Lectura de Archivos
// ─────────────────────────────────────────────
const RUTA_RAIZ = __dirname;
const RUTA_PACKAGE = path.join(RUTA_RAIZ, 'package.json');
const RUTA_INDEX = path.join(RUTA_RAIZ, 'src', 'index.js');
const RUTA_DIST = path.join(RUTA_RAIZ, 'dist', 'auto-shrink.user.js');

const args = process.argv.slice(2);
const isPublish = args.includes('--publish');
const isPush = args.includes('--push');
const isMinify = args.includes('--minify');
const isWatch = args.includes('--watch');

// Obtener versión objetivo si se especifica --version=X.Y.Z
const argVersion = args.find(a => a.startsWith('--version='));
const customVersion = argVersion ? argVersion.split('=')[1] : null;

function leerPackage() {
  return JSON.parse(fs.readFileSync(RUTA_PACKAGE, 'utf8'));
}

function incrementarVersionPatch(versionActual) {
  const partes = versionActual.split('.').map(Number);
  partes[2] = (partes[2] || 0) + 1;
  return partes.join('.');
}

// ─────────────────────────────────────────────
// Plugin para Embellecer Separadores de Módulos
// ─────────────────────────────────────────────
const pluginEmbellecedor = {
  name: 'embellecedor-separadores',
  setup(build) {
    build.onEnd(result => {
      if (isMinify || result.errors.length > 0) return;

      try {
        let contenido = fs.readFileSync(RUTA_DIST, 'utf8');
        const regexSeparador = /^\s*\/\/\s*(src\/[a-zA-Z0-9_/-]+\.js)\s*$/gm;

        contenido = contenido.replace(regexSeparador, (_match, rutaModulo) => {
          const padLength = Math.max(0, 50 - rutaModulo.length);
          const paddingIzquierdo = ' '.repeat(Math.floor(padLength / 2));
          const paddingDerecho = ' '.repeat(Math.ceil(padLength / 2));

          return `
/* ════════════════════════════════════════════════════════════ */
/* ${paddingIzquierdo}MÓDULO: ${rutaModulo}${paddingDerecho} */
/* ════════════════════════════════════════════════════════════ */`;
        });

        contenido = contenido.replace(/\n{3,}\/\* ════/g, '\n\n/* ════');
        fs.writeFileSync(RUTA_DIST, contenido, 'utf8');
      } catch (error) {
        console.error('Error al embellecer separadores:', error);
      }
    });
  }
};

// ─────────────────────────────────────────────
// Proceso Principal de Construcción y Despliegue
// ─────────────────────────────────────────────
async function ejecutarDeploymentManager() {
  let pkg = leerPackage();
  let nuevaVersion = pkg.version;

  if (isPublish) {
    nuevaVersion = customVersion || incrementarVersionPatch(pkg.version);
    console.log(`🚀 Publicando nueva versión: v${pkg.version} -> v${nuevaVersion}`);

    // Actualizar package.json
    pkg.version = nuevaVersion;
    fs.writeFileSync(RUTA_PACKAGE, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

    // Actualizar metadatos en src/index.js
    let contenidoIndex = fs.readFileSync(RUTA_INDEX, 'utf8');
    contenidoIndex = contenidoIndex.replace(
      /\/\/\s*@version\s+[\d\.]+/g,
      `// @version      ${nuevaVersion}`
    );
    fs.writeFileSync(RUTA_INDEX, contenidoIndex, 'utf8');
  }

  // Extraer bloque de metadatos UserScript de src/index.js
  const contenidoIndex = fs.readFileSync(RUTA_INDEX, 'utf8');
  const matchMeta = contenidoIndex.match(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/);
  if (!matchMeta) {
    throw new Error('No se encontró el bloque de metadatos UserScript (// ==UserScript== ... // ==/UserScript==) en src/index.js');
  }
  const metaText = matchMeta[0] + '\n\n';

  const buildOptions = {
    entryPoints: ['src/index.js'],
    bundle: true,
    minify: isMinify,
    outfile: 'dist/auto-shrink.user.js',
    banner: { js: metaText },
    plugins: [pluginEmbellecedor],
    target: ['es2020']
  };

  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log(`👀 Modo Observador (Watch) activo v${nuevaVersion}. Compilando cambios en vivo...`);
  } else {
    await esbuild.build(buildOptions);
    console.log(`✅ Build completado exitosamente: dist/auto-shrink.user.js (v${nuevaVersion})`);
  }

  if (isPublish) {
    console.log(`📦 Preparando commit y staging de git...`);
    try {
      execSync('git add .', { cwd: RUTA_RAIZ, stdio: 'inherit' });
      const argMessage = args.find(a => a.startsWith('--message='));
      const customCommitMsg = argMessage ? argMessage.split('=').slice(1).join('=') : null;
      const msgCommit = customCommitMsg || `chore: release v${nuevaVersion}`;
      execSync(`git commit -m "${msgCommit}"`, { cwd: RUTA_RAIZ, stdio: 'inherit' });
      console.log(`🎉 Commit creado exitosamente: "${msgCommit}"`);
    } catch (err) {
      console.warn(`⚠️ Aviso en Git Commit: ${err.message || 'Sin cambios pendientes'}`);
    }
  }

  if (isPush) {
    console.log(`⬆️ Ejecutando push a origin principal...`);
    try {
      execSync('git push origin principal', { cwd: RUTA_RAIZ, stdio: 'inherit' });
      console.log(`🚀 Git Push completado con éxito a origin/principal`);
    } catch (err) {
      console.error(`❌ Error en Git Push:`, err);
      process.exit(1);
    }
  }
}

ejecutarDeploymentManager().catch(err => {
  console.error('❌ Fallo en Deployment Manager:', err);
  process.exit(1);
});
