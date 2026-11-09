# Timeline Studio — KI-Videoeditor im Browser

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | **Deutsch** | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## Mit Anna gestalten

Die Anna-Version verbindet KI-gestützten Schnitt mit der Fortsetzung Ihrer Projekte:

- Beschreiben Sie Anna Ihren Schnitt, prüfen Sie einen Plan auf Basis Ihrer Vorgaben und Medienmetadaten und wenden Sie unterstützte Clip-Sortierungen sowie einfache Videozuschnitte bei 1× an.
- Projekte und Medien werden automatisch in der Anna-Cloud gespeichert und lassen sich mit demselben Konto in einem anderen Browser fortsetzen. Lokale Projektprüfpunkte bieten eine weitere Wiederherstellungsoption.
- Verfeinern Sie die bearbeitbare Mehrspur-Timeline, ergänzen Sie KI-Stimmen und manuelle Untertitel und exportieren Sie MP4 mit einem verfügbaren Browser-Encoder.

Diese Vorschau ist für Desktopgeräte bestimmt. Die Planung analysiert keine Videobilder oder Audiodaten; lokale KI-Funktionen hängen vom Anna-Container ab.

→ [Timeline Studio auf Anna ausprobieren](https://anna.partners/store/@martindelophy/timeline-studio)

## Verantwortungsvolle Nutzung von Deep-Synthesis-Technologie

Dieses Tool basiert auf Deep-Synthesis-Technologie und ist ausschließlich für technische Forschung und Lernzwecke bestimmt.

Nutzer müssen sicherstellen, dass sie:

- nur eigene Gesichtsaufnahmen oder Bilder und Videos von Personen verwenden, deren rechtsgültige Einwilligung vorliegt;
- keine rechtswidrigen, rechtsverletzenden, falschen oder irreführenden Inhalte erstellen oder verbreiten;
- generierte Inhalte nicht als echte Aufnahmen ausgeben und sich ohne Einwilligung nicht als eine andere Person ausgeben.

Für sämtliche rechtlichen Folgen eines Verstoßes gegen diese Anforderungen ist allein der Nutzer verantwortlich.

## Projektneuigkeiten

- **2026-11-09** — Zwei bearbeitbare Taktvorlagen sind neu. Die 3D-Perspektivvorlage enthält vier Streifenblenden und 16 einzeln austauschbare Bild-im-Bild-Karten. Der Erinnerungsstrudel beginnt mit einem Buntglastunnel und führt durch 48 austauschbare Aufnahmen. Die Desktop-Farbräder enthalten jetzt eine RGB-Parade zur Kontrolle der SDR-Pegel nach der Farbkorrektur. Der 4K-Offlineexport lädt Medien bei Bedarf und senkt den Speicherbedarf beim Schreiben großer MP4- und MOV-Dateien.
- **2026-11-08** — Im Dialog zum Ersetzen eines Clips lassen sich Anfang und Ende einzeln an den Griffen ziehen. Ziehe den markierten Bereich, um ihn bei gleicher Länge und Wiedergabegeschwindigkeit zu verschieben. Das Schließsymbol ist auf Desktop und Mobilgeräten mittig. Das Eigenschaftenfenster zeigt den in der Timeline oder Vorschau gewählten Clip. Die Bild-im-Bild-Einstellungen nutzen die verfügbare Höhe und lassen sich scrollen. Die Vorschau umrandet ausgewählte Bildclips, und Rauten markieren ihre Keyframes. Die VFX-Spurnamen bleiben in der Spalte, und beim Ziehen des Abspielkopfs braucht die Effektvorschau weniger Rechenleistung. Neu ist die quadratische Vorlage Rotierende Spielkarten mit Neon-Intro, zehn austauschbaren Schnitten und Musik im Takt. Ziehe eine Raute auf einem Bild- oder Overlay-Clip, um den Keyframe zeitlich zu verschieben. Jede rotierende Spielkarte kann ein Foto oder Video zeigen. Vier bearbeitbare Vorlagen ergänzen das Angebot: sieben Felder, Neon-Filmkarussell, konzentrische Wellen und versetzte Masken. WebMCP kann Taktvorlagen prüfen und anhängen, Timeline-Effekte auslesen und Maskenübergänge setzen. Der Timeline Studio Skill dokumentiert den Ablauf.
- **2026-11-07** — Nach den Spezialeffekten gibt es jetzt den Bereich Vorlagen. Verwende eigene Bilder, Videos und optionale Musik in der editierbaren dreiteiligen Montage und stelle vor dem Einfügen das Tempo ein. Raster- und Mehrfachbildvorschauen laufen flüssiger. Die Vorlageneinstellungen stehen rechts, die mitgelieferte Musik folgt dem BPM-Wert. Per Rechtsklick lässt sich ein Haupt- oder Bild-im-Bild-Clip durch einen gewählten Quellbereich ersetzen; Position und Dauer bleiben erhalten. Die Vorschau dekodiert die nächste Einstellung und kommende Bild-im-Bild-Clips im Voraus, damit Schnitte flüssiger ablaufen. Der Ersetzen-Dialog zeigt Vorschaubilder und Dateinamen, eine horizontale Bildlaufleiste ab fünf Medien und das für den Quellbereich nötige Wiedergabetempo.
- **2026-11-07** — Neu sind eine editierbare dreiteilige Beatmontage und vier kombinierbare Effekte: Hintergrundblitz, Zoom im Takt, Rastertinte und Formblitz. Das Timing folgt einem festen Tempo oder Timeline-Markierungen. Beim Formblitz stehen Kreis, Stern und horizontale Linie zur Auswahl.
- **2026-11-07** — Neuer Bereich für Spezialeffekte mit acht stapelbaren Bildeffekten sowie verfolgten Kristall-Katzenohren und Rubinhörnern. Effekte lassen sich in eigenen Spuren ziehen, kürzen und mit Keyframes versehen. Ziehbare Bögen passen den Sitz an; beim Verlängern bleibt die bisherige Verfolgung erhalten. Die Karten haben die gewohnte Größe und zeigen eine Live-Vorschau; der Browserexport übernimmt die Effekte. Neu: Katzen-Make-up mit Nase, Schnurrhaaren und sanftem Rouge; es nutzt dieselbe Gesichtsverfolgung und lässt sich mit Katzenohren kombinieren. Der bisherige Effektbereich und seine Eigenschaften heißen nun Bild und Video, klar von den Spezialeffekten getrennt und in allen 13 Sprachen. Das JavaScript des Editors ist aufgeteilt; Export, Analyse, Spracherzeugung und Konnektoren laden bei Bedarf.
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
