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

- **2026-10-10** — Sandbox-Prototyp unter `/paypal`: Festpreisangebot, Serverbestellung und geprüfte Zahlung vor dem Schnittassistenten. Zugangsdaten und echte KI-Prüfung ausstehend; manuelle Lieferung.
- **2026-10-10** — Wettbewerbsvorschau unter `/nebius`: serverseitiger Token-Factory-Adapter für NVIDIA Nemotron, nur Metadaten und geprüfte Änderungen. Live-Inferenz wartet auf API-Schlüssel und Gratisguthaben.
- **2026-10-07** — Visuelle Clips unterstützen jetzt eine Mindestdauer von 0,05 Sekunden. Schnitte in kurzen Intros, etwa bei 0,45 Sekunden, werden nicht mehr abgelehnt. Trimmen, Tempoänderungen und Projektwiederherstellung verwenden dieselbe Untergrenze. Eingefrorene Videos beim Öffnen oder Schließen der großen Vorschau behoben: Quellzeit, Wiedergabe und Frame-Callbacks werden am neuen Videoelement wiederhergestellt.
- **2026-10-05** — Die Tiefenanalyse verwendet 8, 16 oder 24 Bilder/s für Schnell, Standard und Fein. Schnell und Standard erzeugen mit RIFE 24 fps; Abtastung und Kodierung laufen über eine begrenzte Pipeline überlappend. Originalton bleibt erhalten, abgeschlossene Analysen sind nach einem Fehler wiederverwendbar. Feste Abtastzeiten und die Wiederverwendung von RIFE-Sitzungen, Pixeln und Tensoren reduzieren unnötige Interpolation bei gleicher Präzision, Auflösung und Abtastzahl. RIFE nutzt eigene unveränderliche Hugging-Face- und ModelScope-Versionen mit Hash-Prüfung, automatischem Wechsel und gemeinsamem Cache.
- **2026-10-04** — Tiefenkarte — Video als Graustufen-Tiefe: nah hell, fern dunkel. Die Tiefenanalyse überlappt Bilddekodierung und Inferenz, kodiert PNGs im Worker und begrenzt UI-Aktualisierungen. Tiefenkarten in Vorschau und Export interpolieren zwischen Bildern, berücksichtigen Quellzeiten bei Zuschnitt und Tempoänderung und verwenden dekodierte Bilder erneut. Tiefenkartenvideo in Meine Medien gespeichert. Erzeugte Tiefenvideos ersetzen ihre Quellclips; Medien bleiben erhalten. Die Bildsequenz bestimmt die Wiedergabedauer und behebt die Nullanzeige nach Löschen und erneutem Einfügen. Tiefenvideos enthalten jetzt zum Zuschnitt und Tempo passende Originaltöne; das Originalvideo mit Ton bleibt erhalten. Editierbare tiefenbasierte Beleuchtung mit Lichtpositionskugel, gedrücktem Originalvergleich und aktualisierter Vorschau nach dem Ziehen.
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
