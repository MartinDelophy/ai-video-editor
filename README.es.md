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

- **3 de septiembre de 2026 — Interfaces en italiano e indonesio:** Timeline Studio admite ahora 13 idiomas de interfaz. Ambos incluyen diccionarios completos del editor y mensajes de ejecución, terminología revisada para subtítulos, línea de tiempo, Smart Frame, Música IA, diseño vectorial y plugins de generación, además de fuentes y reconocimiento Whisper compatibles.
- **1 de septiembre de 2026 — Vídeo listo antes sin perder sincronía:** las importaciones locales y en línea esperan solo un pequeño conjunto de fotogramas semilla con PTS real, adaptado al equipo, en vez de bloquearse por 120–240 miniaturas. Después, los fotogramas exactos completan primero la vista visible y continúan fuera de pantalla por subdivisión de puntos medios. Cada miniatura usa el último fotograma anterior al tiempo de origen solicitado, el cabezal sigue la previsualización en vivo y las actualizaciones en segundo plano se pausan al desplazarlo.
- **29 de agosto de 2026 — Conectores de generación local:** se añadieron plugins separados para ComfyUI y Stable Diffusion WebUI/Forge. ComfyUI ejecuta flujos API Format en un servicio de bucle local e importa imágenes o vídeos; WebUI usa sus API reales txt2img/img2img. Los resultados entran automáticamente en My assets y se eliminó la integración genérica de Hugging Face Spaces.
- **28 de agosto de 2026 — Reducción de ruido inteligente local:** Visuales → Reparación con IA incorpora DRUNet con comparación del fotograma, cuatro intensidades, audio de origen y aplicación reversible. Los clips completos fluyen ahora a la frecuencia original mediante WebCodecs, solapando decodificación e inferencia, reutilizando la sesión WebGPU y los búferes de lienzo, tensor y píxeles, y reutilizando con cautela el residuo en fotogramas vecinos con pocos cambios; PNG/FFmpeg queda como ruta compatible. Disponible en escritorio y móvil en los 11 idiomas.
- **28 de agosto de 2026 — Preparación de vídeo de alta fidelidad en la línea de tiempo:** los vídeos nuevos permanecen en un estado de carga visible mientras se decodifican los metadatos y las miniaturas PTS reales, evitando bloques provisionales estirados. La tira usa fotogramas fuente de 180px, densidad legible según el zoom, correspondencia temporal exacta bajo el cabezal y recorte centrado sin bandas negras para vídeo vertical.

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

Añade `--pin v1.0.0` para instalar la versión verificada en lugar de seguir la última publicación. Antes de instalar, puedes revisarlo con `gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio`.

## Hoja de ruta

- **Ahora:** reforzar la exportación offline determinista, mejorar la fiabilidad de la línea de tiempo y ampliar las pruebas de extremo a extremo en el navegador.
- **Después:** publicar el ejecutor de comandos headless versionado para edición con agentes y facilitar el intercambio de plantillas reutilizables.
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
