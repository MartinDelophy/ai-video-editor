# How is Timeline Studio different from FFmpeg, CapCut, and Remotion?

| Tool | Best fit | Editable timeline | Agent interface | Rendering model |
|---|---|---:|---|---|
| Timeline Studio | Local-first AI-assisted editing that must remain human-editable | Yes, portable `.timeline` | Versioned JSON runner plus browser Skill | Browser WebCodecs/offline composition; compatibility fallback |
| FFmpeg | Deterministic media conversion, filtering, probing, and batch processing | No editor timeline by default | Excellent CLI/filter graph | Native command-line processing |
| CapCut | Polished manual short-form editing and a large template/effect ecosystem | Yes, proprietary editor project | Primarily human UI automation | Desktop/cloud application pipeline |
| Remotion | Code-defined React video systems and template-driven rendering | Source code is the project | Strong programmatic API | React frames rendered through Chromium/server tooling |

Choose Timeline Studio when the Agent result must reopen as a normal visual timeline, use local browser AI tools, and remain adjustable by a non-programmer. Choose FFmpeg for low-level codecs, muxing, probing, or simple deterministic batch transforms. Choose CapCut when its manual UX, assets, and proprietary effects matter more than a stable Agent contract. Choose Remotion when video is fundamentally a software template maintained in React.

They can complement each other. An Agent can probe or normalize media with FFmpeg, edit the portable timeline with Timeline Studio, or use Remotion for a code-owned motion-graphics segment. Timeline Studio does not claim to replace FFmpeg's codec breadth, CapCut's commercial ecosystem, or Remotion's programmable composition model.
