# Timeline Studio — Editor de vídeo con IA en el navegador

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | **Español** | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## Crea con Anna

La edición de Anna combina edición asistida por IA y continuidad del proyecto:

- Describe tu edición a Anna, revisa un plan basado en tus instrucciones y los metadatos del material y aplica la ordenación de clips y los recortes sencillos de vídeo a 1× compatibles.
- Los proyectos y sus archivos se guardan automáticamente en la nube de Anna y se pueden retomar con la misma cuenta en otro navegador. También puedes guardar puntos de recuperación locales.
- Perfecciona la línea de tiempo multipista editable, añade voces de IA y subtítulos manuales y exporta MP4 con un codificador disponible en el navegador.

Esta versión preliminar es para escritorio. La planificación no analiza fotogramas ni audio; las funciones de IA local dependen del contenedor de Anna.

→ [Prueba Timeline Studio en Anna](https://anna.partners/store/@martindelophy/timeline-studio)

## Uso responsable de la síntesis profunda

Esta herramienta utiliza tecnología de síntesis profunda y está destinada exclusivamente a la investigación técnica y el aprendizaje.

Los usuarios deben asegurarse de:

- utilizar únicamente imágenes o vídeos de su propio rostro o de personas que hayan otorgado una autorización legal;
- no crear ni difundir contenido ilegal, infractor, falso o engañoso;
- no presentar el contenido generado como imágenes reales ni suplantar la identidad de otra persona sin su consentimiento.

El usuario será el único responsable de cualquier consecuencia legal derivada del incumplimiento de estos requisitos.

## Novedades del proyecto

- **2026-11-08** — En el diálogo Reemplazar clip, arrastra los tiradores para ajustar cada extremo o arrastra el intervalo seleccionado para moverlo sin cambiar su duración ni su velocidad. El icono de cierre queda centrado en ordenador y móvil. El panel de propiedades sigue al clip seleccionado en la línea de tiempo o en la vista previa. Los ajustes de imagen en imagen aprovechan toda la altura disponible y se pueden desplazar. La vista previa resalta los clips visuales seleccionados y los rombos marcan sus fotogramas clave. Los nombres de pistas VFX caben en la columna y la vista previa de efectos es más ligera al arrastrar el cabezal. Añadimos Cartas giratorias, una plantilla cuadrada con una intro de neón, diez cortes sustituibles y música al tempo. Arrastra un rombo de un clip visual o de superposición para ajustar el tiempo de su fotograma clave.
- **2026-11-07** — Añadimos Plantillas después de Efectos especiales. Usa tus imágenes, vídeos y música opcional en el montaje editable de tres paneles y ajusta el tempo antes de añadirlo a la línea de tiempo. Mejoramos la fluidez de la trama y de los paneles en la vista previa. Los ajustes de la plantilla están en el panel derecho y la música incluida sigue el BPM. Haz clic derecho en un clip principal o superpuesto para sustituirlo por un intervalo elegido sin cambiar su posición ni duración. La vista previa decodifica con antelación el siguiente plano y los clips superpuestos para suavizar los cortes. El cuadro de sustitución muestra miniaturas y nombres, una barra horizontal a partir de cinco elementos y la velocidad necesaria para ajustar el intervalo seleccionado.
- **2026-11-07** — Añadimos un montaje rítmico editable de tres paneles y cuatro efectos combinables: destello de fondo, zoom al ritmo, trama de tinta y destello con forma. El ritmo puede seguir un tempo fijo o los marcadores; el destello puede ser un círculo, una estrella o una línea horizontal.
- **2026-11-07** — Nuevo espacio de efectos especiales con ocho efectos de imagen combinables, orejas de cristal y cuernos de rubí que siguen el rostro. Arrastra, recorta y anima los efectos con fotogramas clave en pistas propias. Arrastra los arcos para ajustar la posición; al alargar un efecto se conserva el seguimiento existente. Las tarjetas mantienen el tamaño del catálogo de efectos y la vista previa coincide con la exportación. Nuevo maquillaje de gato con nariz, bigotes y rubor suave; comparte el seguimiento facial y se combina con las orejas. La entrada y el panel de procesamiento se llaman Imagen y vídeo en los 13 idiomas, separados claramente de los efectos especiales. El JavaScript inicial se divide y los módulos de exportación, análisis, voz y conectores se cargan cuando hacen falta.
- **2026-11-06** — Añadida una barra horizontal fina que se puede arrastrar en la línea de tiempo de Windows.
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
