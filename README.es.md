# Timeline Studio — Editor de vídeo con IA en el navegador

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | **Español** | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## Uso responsable de la síntesis profunda

Esta herramienta utiliza tecnología de síntesis profunda y está destinada exclusivamente a la investigación técnica y el aprendizaje.

Los usuarios deben asegurarse de:

- utilizar únicamente imágenes o vídeos de su propio rostro o de personas que hayan otorgado una autorización legal;
- no crear ni difundir contenido ilegal, infractor, falso o engañoso;
- no presentar el contenido generado como imágenes reales ni suplantar la identidad de otra persona sin su consentimiento.

El usuario será el único responsable de cualquier consecuencia legal derivada del incumplimiento de estos requisitos.

## Novedades del proyecto

- **2026-10-19** — Los flujos permiten descargar e importar proyectos completos y guardar o restaurar copias editables en Anna, con nodos, enlaces, instrucciones y medios. Los dos lienzos comparten el manejo de gestos del panel táctil. Se corrigió la reproducción repetida de la vista comparativa de eliminación de marcas de agua con IA.
- **2026-10-18** — Se añadieron pistas sincronizadas de acciones y cámara, con un carrusel de guion editable que sigue la reproducción. El diálogo 3D reutiliza ChatCut con historial, recuperación de borradores, referencias a objetos y revisión de cambios. El guion gráfico usa GPT Image 2 (fal) por defecto. Se corrigieron las preferencias de enrutamiento del modelo conversacional y la conservación de contexto; se verificaron respuestas reales al cambiar de modelo. El vídeo con fotograma inicial y final espera una ampliación de Anna: docs/storyboard-anna-video-contract.md. Los fallos de carga de flujos quedan aislados del editor, con reintento, regreso y compatibilidad entre actualizaciones de borradores Anna. El lienzo infinito añade cables direccionales, entradas compatibles resaltadas y un menú que crea y conecta el siguiente nodo en una sola edición reversible. El chat permite buscar y referenciar nodos con @, etiquetas extraíbles e identificadores explícitos.
- **2026-10-17** — Se añadió el Lienzo infinito con nodos tipados, cambios de Anna revisables, conectores reales, locución y música local, versiones de resultados, recuperación de tareas de vídeo y almacenamiento del grafo y medios por cuenta y proyecto. Los resultados van a Mis recursos y solo se generan mediante una acción explícita. Las dos guías internas solo se adjuntan al generar; no aparecen en recursos, referencias @ ni nodos.
- **2026-10-17** — Procesamiento local de audio con RNNoise, DeepFilterNet3, ecualización, compresión, ganancia y limitador; escucha previa, aplicación y restauración del original. Mejoras en el panel de audio original, alineación y resaltado de subtítulos, fuentes multilingües, edición vinculada y reproducción entre clips. Anna añade narración en la nube basada en catálogo y dictado en ChatCut; guarda en Mis recursos y requiere permisos de la aplicación y del micrófono. Las voces Anna comparten el selector y la acción de síntesis existentes, con tres avatares virtuales generados. Los subtítulos automáticos de Anna y la transcripción ChatCut comparten Anna STT y conservan los vínculos de audio e imagen. ChatCut incorpora estilos de subtítulos, movimientos vinculados, pegatinas, audio espacial y procesamiento local; la narración Anna usa el TTS preferido. Cada subtítulo permite resaltar texto seleccionado, elegir color y borrar su resaltado. Las tarjetas Anna reproducen muestras oficiales correspondientes; se eliminaron acciones de subtítulos duplicadas. Anna añade un asistente de voz superior para consultar capacidades, abrir paneles y editar con ChatCut, con silencio, interrupción y confirmación de generación. Los subtítulos automáticos procesan todos los clips por defecto, con selección individual opcional. Atenuación automática ante otras voces para audio original, voz y música, desactivada por defecto, con Silero local y la misma curva en vista previa y exportación. Las llamadas de Anna usan una onda integrada en la barra superior con silencio, interrupción y cierre, sin panel flotante. Los cortes conservan el último fotograma decodificado hasta mostrar el siguiente, evitando destellos vacíos. La atenuación muestra las fases de carga y su curva de volumen en la línea de tiempo. Nueva mejora de voz con tres intensidades, comparación y restauración del original. La atenuación reutiliza el modelo cargado y muestra el progreso desde 0 %. Saludos y órdenes de interfaz precisas responden localmente; las ediciones complejas conservan la validación. Los flujos incluyen un prototipo 3D editable con transformaciones, planos, reproducción, deshacer y cambios Anna revisados; las voces llegarán después. Nuevo espacio de guion gráfico con ChatCut, referencias @, lienzo de nodos inicialmente vacío, preferencias de modelo y recuperación por cuenta y proyecto. Las 16 viñetas forman una sola imagen; el vídeo con fotograma final espera soporte de Anna.
- **2026-10-12** — La reproducción de vídeos largos pausa el refinamiento de miniaturas y dibuja el fotograma exacto del cabezal sin codificar JPEG. Al reanudar se prioriza la última búsqueda. El audio AAC se extrae sin recodificar ni copiar todo el vídeo a WASM; se conservan los efectos y ajustes de exportación. La exportación prioriza codificadores de hardware compatibles y compone directamente los fotogramas sin escala que cumplen las condiciones; las transformaciones y los efectos conservan el renderizado existente. La codificación de audio y la composición del siguiente fotograma avanzan en paralelo con el envío de vídeo, manteniendo una cola limitada.

Consulta el [Roadmap](ROADMAP.md) para el trabajo planificado, [Releases](https://github.com/MartinDelophy/ai-video-editor/releases) para los cambios publicados e [Issues](https://github.com/MartinDelophy/ai-video-editor/issues) para tareas y errores.

## ¿Qué puede producir?

Explora ejemplos reproducibles de antes y después, y recetas de edición:

→ [AI Video Editing Skills Handbook](https://github.com/MartinDelophy/timeline-studio-handbook)

<p align="center">
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/daily?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/weekly?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
</p>

Timeline Studio es un editor de vídeo con IA, local y ejecutado en el navegador. Combina una línea de tiempo multipista al estilo CapCut con locuciones de IA, subtítulos automáticos, herramientas de visión, avatares parlantes y exportación offline determinista.

[Abrir el editor](https://video-editor.ai-creator.top/) · [Ver la demo](https://www.youtube.com/watch?v=chdRPG2ndMs) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Editor Timeline Studio](docs/screenshots/editor-timeline.png)

## Funciones principales

- Locución multilingüe con Piper/VITS ONNX y Kokoro 82M.
- Música de IA local con Stable Audio 3 Small Q4 ONNX mediante WebGPU, traducción de indicaciones libres, opciones de 30/60/90/120 segundos, bucles largos guiados por la forma de onda, caché persistente del modelo e incorporación automática a Mis recursos.
- Subtítulos automáticos con Whisper small q8 ONNX.
- Encuadre inteligente con YOLOS tiny y MODNet.
- Separación de voz y música, y creación de avatares con JoyVASA y LivePortrait.
- Edición multipista con superposiciones, máscaras, filtros, animaciones y fotogramas clave.
- Exportación MP4/WebM en el navegador con WebCodecs y mezcla de audio.
- PWA instalable, caché local de modelos y archivos de proyecto `.timeline`.

## Demo de locución con IA

https://github.com/user-attachments/assets/304a744e-d620-4380-9c17-19af3726f5a4

## Agent Skill

Este repositorio incluye el Agent Skill [`edit-timeline-studio`](skills/edit-timeline-studio/SKILL.md) para planificar, ejecutar y verificar líneas de tiempo de vídeo editables. Se instala con GitHub CLI 2.90.0 o posterior.

La instalación mediante [skills.sh](https://skills.sh/MartinDelophy/ai-video-editor) requiere Node.js 22.20.0 o posterior.

```bash
npx skills add MartinDelophy/ai-video-editor --skill edit-timeline-studio
```

```bash
# Claude Code
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent claude-code --scope user

# Codex
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent codex --scope user
```

Añade `--pin v1.0.8` para instalar la versión verificada en lugar de seguir la última publicación. Antes de instalar, puedes revisarlo con `gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio`.

## Hoja de ruta

- **Ahora:** reforzar la exportación offline determinista, mejorar la fiabilidad de la línea de tiempo y ampliar las pruebas de extremo a extremo en el navegador.
- **Después:** ampliar la paridad del renderizado headless, los comandos WebMCP revisables y el intercambio de plantillas reutilizables.
- **Más adelante:** añadir revisión colaborativa, una interfaz de extensiones y más modelos de IA verificados localmente.

Las prioridades se deciden en [GitHub Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions).

## Se busca ayuda

Buscamos contribuciones sobre medios en el navegador, WebCodecs, WebGPU/ONNX, UX de la línea de tiempo, localización, pruebas y documentación. Informa de errores reproducibles en [Issues](https://github.com/MartinDelophy/ai-video-editor/issues), comparte ideas en [Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions) o aporta correcciones, pruebas, traducciones y ejemplos concretos.

## Inicio rápido

Requiere Node.js 20+ y un navegador Chromium moderno. Se recomienda WebGPU.

```bash
git clone https://github.com/MartinDelophy/ai-video-editor.git
cd ai-video-editor
npm install
npm run dev
```

## Validación

```bash
npm run build
npm run check
```

## Apoyo y comentarios

Si este proyecto te resulta útil, considera darle una ⭐ Star. Si encuentras algún problema, [abre un Issue](https://github.com/MartinDelophy/ai-video-editor/issues).

Únete a nuestra [comunidad de Discord](https://discord.gg/uq2uvUTBr) para hacer preguntas, compartir comentarios y conectar con otros usuarios y colaboradores.

## Licencia

[MIT](LICENSE)
