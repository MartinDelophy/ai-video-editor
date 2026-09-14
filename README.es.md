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

- **2026-09-14 — Corrección de la exportación y reintentos:** los clips con fondos de color sólido y fotogramas clave de opacidad se exportan correctamente aunque no tengan una máscara de persona. Si la exportación falla, el error permanece visible y se puede reintentar con los mismos ajustes.
- **2026-09-14 — Rendimiento en proyectos grandes:** la importación reduce el trabajo del hilo principal. La caché del cálculo de pistas de audio, las formas de onda más ligeras y menos saltos de audio reducen la carga al arrastrar el cabezal y reproducir. Se conservan los medios, los tiempos de los clips, los controles de edición, los efectos y la exportación. La importación muestra el progreso real y permite editar una vez restaurados los medios; las miniaturas siguen mejorándose en segundo plano.
- **12 de septiembre de 2026 — Insignia de Best AI Tool:** la pantalla inicial de selección de idioma muestra la insignia de Best AI Tool junto a la marca Timeline Studio. El diseño se adapta a escritorio y móvil, y la insignia abre el sitio externo en una pestaña nueva.
- **11 de septiembre de 2026 — Edición y exportación con WebMCP:** las 15 herramientas del navegador permiten revisar cambios de subtítulos, volumen y fundidos, marcadores, división/eliminación/duplicación del vídeo principal, búsqueda e inserción de recursos existentes e imagen en imagen. Los agentes pueden preparar la exportación, iniciar el exportador real del editor, consultar el progreso y los datos del archivo resultante o cancelar. Las operaciones combinadas conservan las comprobaciones de conflictos, la edición con desplazamiento, los bloqueos y Deshacer; los reintentos no duplican descargas. Herramientas y revisión están traducidas a los 13 idiomas de la interfaz.
- **10 de septiembre de 2026 — WebMCP para el editor abierto:** los navegadores compatibles permiten a los agentes consultar el proyecto con herramientas estructuradas, desplazar la vista previa y revisar planes de reordenación o recorte antes de aplicarlos. El adaptador reutiliza el motor de comandos compartido, detecta cambios concurrentes y conserva Deshacer. Se añaden recursos de descubrimiento y documentación; la URL raíz sigue abriendo directamente el editor.

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
