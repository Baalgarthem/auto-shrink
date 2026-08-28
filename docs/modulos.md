# Arquitectura y Estructura del Proyecto

Esta guía está diseñada de manera pedagógica para que cualquier persona o agente pueda entender rápidamente cómo está organizado el proyecto, cuál es el propósito de cada pieza y cómo interactúan entre sí.

## Árbol del Proyecto (Tree)

```text
auto-shrink/
├── media/                     # Recursos estáticos
├── src/                       # Código fuente modular (donde programamos)
│   ├── config/                # ⚙️ Configuraciones y Datos Estáticos
│   │   ├── constants.js       # Variables, umbrales, selectores y colores fijos
│   │   └── configuration.js   # Servicio de configuración
│   ├── core/                  # 🧠 El cerebro y la lógica principal
│   │   ├── engine.js          # Acciones finales: lo que sucede cuando se ejecuta el zoom
│   │   ├── environment.js     # Detecta información de entorno del navegador
│   │   ├── pointer.js         # Cálculos de precisión del puntero
│   │   ├── scroll.js          # Calcula la sincronización de scroll
│   │   └── metrics.js         # Extrae métricas
│   ├── ui/                    # 🎨 Interfaz de Usuario (Visual)
│   │   └── interface.js       # Construye el panel modal y notificaciones
│   └── index.js               # 🚀 Punto de Entrada: orquesta todo, observa cambios en la web e inicia el flujo
├── docs/                      # 📚 Documentación técnica y registros (Ignorado en Git)
├── dist/                      # 📦 Código construido listo para usarse (Ignorado en Git)
├── package.json               # Configuración de npm (comandos y dependencias como esbuild)
├── AGENTS.md                  # Reglas irrevocables para los agentes de IA
└── .gitignore                 # Archivos y directorios explícitamente ignorados
```

## Propósito Conceptual de los Módulos y Carpetas

- `src/config/`: Contiene todo lo de configuración, contantes base y almacenamiento.
- `src/core/`: Toda la carga computacional central sobre el escalado visual y el motor.
- `src/ui/`: Construcción de interfaz.
- `dist/`: El archivo final y unificado compilado por esbuild.
- `docs/`: Almacenamiento local para bitácoras y documentación técnica.
