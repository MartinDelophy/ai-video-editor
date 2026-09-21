# Timeline Studio — KI-Videoeditor im Browser

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | **Deutsch** | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## Verantwortungsvolle Nutzung von Deep-Synthesis-Technologie

Dieses Tool basiert auf Deep-Synthesis-Technologie und ist ausschließlich für technische Forschung und Lernzwecke bestimmt.

Nutzer müssen sicherstellen, dass sie:

- nur eigene Gesichtsaufnahmen oder Bilder und Videos von Personen verwenden, deren rechtsgültige Einwilligung vorliegt;
- keine rechtswidrigen, rechtsverletzenden, falschen oder irreführenden Inhalte erstellen oder verbreiten;
- generierte Inhalte nicht als echte Aufnahmen ausgeben und sich ohne Einwilligung nicht als eine andere Person ausgeben.

Für sämtliche rechtlichen Folgen eines Verstoßes gegen diese Anforderungen ist allein der Nutzer verantwortlich.

## Projektneuigkeiten

- **2026-09-21 — Pausen entfernen:** Smart erkennt lange Sprechpausen lokal mit Silero VAD. Schnitte im ausgewählten Hauptvideo und Originalton lassen sich prüfen und auswählen. Mindestpause, verbleibender Abstand, Ripple-Schnitt, Abbruch und Rückgängig sind verfügbar; die Oberfläche unterstützt 13 Sprachen.
- **2026-09-20 — Abspielkopf an Markern einrasten:** Beim Ziehen des weißen Abspielkopfs wird das Bild live angezeigt. Er rastet an Markern und Bereichsgrenzen ein, mit gemeinsamer Hilfslinie und Zeitanzeige. Alt ermöglicht freies Verschieben. Markerdetails zeigen zunächst Fertig und nach Bearbeitung Änderungen anwenden.
- **2026-09-17 — Feinschnitt und Prüfung mit WebMCP:** 21 Browserwerkzeuge unterstützen 26 prüfbare Bearbeitungen, darunter das Verschieben und Zuschneiden zeitgesteuerter Clips, Overlay-Transformationen, Untertitelstil und -position sowie das Projektformat. Agents können gerenderte Bild- und Audioproben anfordern, lokale Sprechertexte oder Transkriptionen mit Fortschritt und Abbruch ausführen und Ergebnisse vor dem Einfügen prüfen. Neue Bedienelemente und Meldungen unterstützen alle 13 Oberflächensprachen.
- **2026-09-15 — Bearbeitetes Audio exportieren:** Beim Export eines Audioclips werden jetzt der Zuschnitt, die Wiedergabegeschwindigkeit, die Lautstärke, Ein- und Ausblendungen sowie Raumeffekte berücksichtigt. Einzelne Clips und die Mischung der gesamten Timeline lassen sich als WAV oder MP3 exportieren. Neben dem Videoexport steht ein reiner Audioexport zur Verfügung.
- **2026-09-14 — Exportkorrektur und erneuter Versuch:** Clips mit einfarbigem Hintergrund und Deckkraft-Keyframes lassen sich jetzt auch ohne Personenmaske korrekt exportieren. Bei einem Fehler bleibt die Meldung sichtbar und der Export kann mit denselben Einstellungen erneut gestartet werden.

Geplante Arbeiten stehen in der [Roadmap](ROADMAP.md), veröffentlichte Änderungen in den [Releases](https://github.com/MartinDelophy/ai-video-editor/releases) und einzelne Aufgaben in den [Issues](https://github.com/MartinDelophy/ai-video-editor/issues).

## Was kann es produzieren?

Entdecke reproduzierbare Vorher-Nachher-Beispiele und Schnittrezepte:

→ [AI Video Editing Skills Handbook](https://github.com/MartinDelophy/timeline-studio-handbook)

<p align="center">
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/daily?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/weekly?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
</p>

Timeline Studio ist ein lokaler KI-Videoeditor für den Browser. Er verbindet eine mehrspurige Timeline im CapCut-Stil mit KI-Sprachausgabe, automatischen Untertiteln, Bildanalyse, sprechenden Avataren und deterministischem Offline-Export.

[Editor öffnen](https://video-editor.ai-creator.top/) · [Demo ansehen](https://www.youtube.com/watch?v=chdRPG2ndMs) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Timeline-Studio-Editor](docs/screenshots/editor-timeline.png)

## Hauptfunktionen

- Mehrsprachige Sprachausgabe mit Piper/VITS ONNX und Kokoro 82M.
- Lokale KI-Musik mit Stable Audio 3 Small Q4 ONNX über WebGPU, übersetzten freien Prompts, 30/60/90/120-Sekunden-Optionen, wellenformbasierten langen Loops, persistentem Modellcache und automatischer Ablage in „Meine Assets“.
- Automatische Untertitel mit Whisper small q8 ONNX.
- Intelligenter Bildausschnitt mit YOLOS tiny und MODNet.
- Gesangs-/Musiktrennung und Avatare mit JoyVASA und LivePortrait.
- Mehrspurbearbeitung mit Overlays, Masken, Filtern, Animationen und Keyframes.
- MP4/WebM-Export im Browser mit WebCodecs und Audiomischung.
- Installierbare PWA, lokaler Modellcache und `.timeline`-Projektdateien.

## KI-Voiceover-Demo

https://github.com/user-attachments/assets/304a744e-d620-4380-9c17-19af3726f5a4

## Agent Skill

Dieses Repository enthält den Agent Skill [`edit-timeline-studio`](skills/edit-timeline-studio/SKILL.md) zum Planen, Ausführen und Prüfen editierbarer Video-Timelines. Die Installation erfordert GitHub CLI 2.90.0 oder neuer.

Für die Installation über [skills.sh](https://skills.sh/MartinDelophy/ai-video-editor) ist Node.js 22.20.0 oder neuer erforderlich.

```bash
npx skills add MartinDelophy/ai-video-editor --skill edit-timeline-studio
```

```bash
# Claude Code
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent claude-code --scope user

# Codex
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent codex --scope user
```

Füge `--pin v1.0.8` hinzu, um die geprüfte Version statt der jeweils neuesten Release zu installieren. Vor der Installation kannst du den Skill mit `gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio` prüfen.

## Roadmap

- **Jetzt:** Deterministischen Offline-Export stabilisieren und die Timeline zuverlässiger machen.
- **Als Nächstes:** Die Übereinstimmung von Headless-Rendering und Browserexport, prüfbare WebMCP-Befehle und das Teilen von Projektvorlagen ausbauen.
- **Später:** Kollaborative Reviews, eine Plugin-Schnittstelle und weitere lokal verifizierte KI-Modelle ergänzen.

Die Prioritäten werden in [GitHub Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions) gemeinsam festgelegt.

## Hilfe gesucht

Wir suchen Beiträge zu Browser-Medien, WebCodecs, WebGPU/ONNX, Timeline-UX, Lokalisierung und Dokumentation. Melde reproduzierbare Fehler in [Issues](https://github.com/MartinDelophy/ai-video-editor/issues), teile Ideen in [Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions) oder sende fokussierte Fixes, Übersetzungen und Beispiele.

## Schnellstart

Benötigt Node.js 20+ und einen modernen Chromium-Browser. WebGPU wird empfohlen.

```bash
git clone https://github.com/MartinDelophy/ai-video-editor.git
cd ai-video-editor
npm install
npm run dev
```

## Prüfung

```bash
npm run build
npm run check
```

## Unterstützung und Feedback

Wenn dir dieses Projekt hilft, gib ihm gerne einen ⭐ Star. Wenn du auf ein Problem stößt, [erstelle bitte ein Issue](https://github.com/MartinDelophy/ai-video-editor/issues).

Tritt unserer [Discord-Community](https://discord.gg/uq2uvUTBr) bei, um Fragen zu stellen, Feedback zu teilen und dich mit anderen Nutzern und Mitwirkenden auszutauschen.

## Lizenz

[MIT](LICENSE)
