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

- **2026-10-18** — Synchronisierte Figurenaktions- und Kameraspuren sowie ein bearbeitbares, der Wiedergabe folgendes Drehbuchkarussell hinzugefügt. Der Blockout-Dialog nutzt ChatCut mit Verlauf, Entwurfswiederherstellung, Objektreferenzen und Änderungsprüfung. Das Storyboard verwendet standardmäßig GPT Image 2 (fal). Routing-Hinweise und längerer Gesprächskontext wurden korrigiert; echte Modellwechsel wurden anhand der Antworten geprüft. Videos mit Start- und Endbild benötigen weiterhin eine Anna-API-Erweiterung: docs/storyboard-anna-video-contract.md. Workflow-Ladefehler bleiben vom Editor isoliert, mit Wiederholung, Rückkehr und begrenzter Laufzeitkompatibilität bei Anna-Updates. Der unendliche Canvas bietet gerichtete Verbindungen, hervorgehobene kompatible Eingänge und ein Menü, das den nächsten Knoten in einem rückgängig machbaren Schritt erstellt und verbindet. Der Canvas-Chat unterstützt durchsuchbare @-Knotenreferenzen mit entfernbaren Tags und eindeutigen Knoten-IDs.
- **2026-10-17** — Die unendliche Leinwand bietet typisierte Knoten, überprüfbare Anna-Änderungen, echte Generierungsconnectoren, Sprache und lokale Musik, Ergebnisversionen, erneute Videoauftragsabfragen und konten- sowie projektbezogene Browser-Wiederherstellung. Ergebnisse landen in Meine Medien; Generierung erfolgt nur auf ausdrücklichen Wunsch. Die beiden internen Bildvorlagen werden nur bei Generierungen angehängt und erscheinen weder in Medien, @-Vorschlägen noch auf dem Knoten-Hintergrund.
- **2026-10-17** — Lokale Audioverarbeitung mit RNNoise, DeepFilterNet3, EQ, Kompression, Verstärkung und Limiter; Vorhören, Anwenden und Wiederherstellen des Originals. Verbesserte Quelltonansicht, Untertitelausrichtung und Schlüsselworthervorhebung, mehrsprachige Schriften, verknüpfte Bearbeitung und Wiedergabe an Clipgrenzen. Anna ergänzt katalogbasierte Cloud-Sprachausgabe in Meine Medien und ChatCut-Diktat mit App- und Mikrofonberechtigungen. Anna-Stimmen nutzen nun die bestehende Stimmenauswahl und Syntheseaktion mit drei generierten virtuellen Avataren. Alle automatischen Anna-Untertitel und ChatCut-Transkriptionen nutzen denselben Anna-STT-Dienst und behalten Audio-/Bildverknüpfungen. ChatCut unterstützt Untertitelstile, verknüpfte Bewegungen, Sticker, Raumklang und lokale Audiobearbeitung; Anna-Erzählstimmen nutzen den bevorzugten TTS-Dienst. Textauswahlen lassen sich pro Untertitel hervorheben, einfärben und löschen. Anna-Stimmkarten spielen passende offizielle Hörproben direkt ab; doppelte Untertitelaktionen wurden entfernt. Anna ergänzt einen Sprachassistenten für Funktionsabfragen, Panelnavigation und ChatCut-Bearbeitung mit Stummschaltung, Unterbrechung und Generierungsbestätigung. Automatische Untertitel verarbeiten standardmäßig alle Videoclips; einzelne Clips sind weiterhin auswählbar. Automatische Sprachabsenkung für Quellton, Audio und Musik ist standardmäßig aus und nutzt lokales Silero sowie eine gemeinsame Vorschau-/Exportkurve. Anna-Sprachanrufe nutzen eine Wellenform in der Kopfleiste mit Stummschaltung, Unterbrechung und Auflegen ohne überlagerndes Fenster. Videoschnitte halten das letzte dekodierte Bild bis zum Zielbild des nächsten Clips und vermeiden Leerbildblitze. Automatische Absenkung zeigt Ladephasen und ihre Lautstärkekurve in der Zeitleiste. Neu: Stimmverbesserung mit drei Stärken, Originalvergleich und Wiederherstellung. Die Absenkung nutzt geladene Modelle erneut und zeigt den Fortschritt ab 0 %. Begrüßungen und eindeutige Sprachbefehle reagieren lokal; komplexe Schnitte behalten die ChatCut-Prüfung. Workflows enthalten einen editierbaren 3D-Prototyp mit Transformationen, Kameraaufnahmen, Wiedergabe, Rückgängig und geprüften Anna-Änderungen; Stimmen folgen später. Storyboard mit ChatCut-Eingabe, @-Medienreferenzen, anfangs leerer verschiebbarer Knotenfläche, Modellpräferenzen und Wiederherstellung pro Konto und Projekt ergänzt. Die 16 Bilder bleiben eine Bilddatei; Endbild-Videoerzeugung wartet auf Anna-API-Unterstützung.
- **2026-10-12** — Bei langen Videos pausiert die Wiedergabe die Hintergrundverfeinerung der Vorschaubilder und zeichnet das genaue Bild am Abspielkopf ohne JPEG-Kodierung. Beim Fortsetzen hat die letzte Suchposition Vorrang. AAC-Audio wird ohne Neukodierung oder vollständige Videokopie in WASM extrahiert; Effekte und Exporteinstellungen bleiben erhalten. Der Export bevorzugt unterstützte Hardware-Encoder und führt geeignete Videoframes in Originalgröße direkt der Komposition zu. Transformationen und Effekte behalten den bisherigen Renderpfad. Audio-Encoding und die Komposition des nächsten Frames laufen parallel zur Videoübergabe mit begrenzter Warteschlange.
- **2026-10-07** — Visuelle Clips unterstützen jetzt eine Mindestdauer von 0,05 Sekunden. Schnitte in kurzen Intros, etwa bei 0,45 Sekunden, werden nicht mehr abgelehnt. Trimmen, Tempoänderungen und Projektwiederherstellung verwenden dieselbe Untergrenze. Eingefrorene Videos beim Öffnen oder Schließen der großen Vorschau behoben: Quellzeit, Wiedergabe und Frame-Callbacks werden am neuen Videoelement wiederhergestellt.

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
