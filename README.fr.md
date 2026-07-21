# Timeline Studio — Éditeur vidéo IA dans le navigateur

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | **Français** | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

Timeline Studio est un éditeur vidéo IA local qui fonctionne dans le navigateur. Il associe une timeline multipiste inspirée de CapCut à la synthèse vocale, aux sous-titres automatiques, aux outils de vision, aux avatars parlants et à un export hors ligne déterministe.

[Ouvrir l’éditeur](https://video-editor.ai-creator.top/) · [Voir la démo](https://www.youtube.com/watch?v=chdRPG2ndMs) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Éditeur Timeline Studio](docs/screenshots/editor-timeline.png)

## Fonctionnalités principales

- Voix multilingues avec Piper/VITS ONNX et Kokoro 82M.
- Sous-titres automatiques avec Whisper small q8 ONNX.
- Cadrage intelligent avec YOLOS tiny et MODNet.
- Séparation voix/musique et avatars via JoyVASA et LivePortrait.
- Montage multipiste avec incrustations, masques, filtres, animations et images clés.
- Export MP4/WebM dans le navigateur avec WebCodecs et mixage audio.
- PWA installable, cache local des modèles et projets `.timeline`.

## Feuille de route

- **Maintenant :** fiabiliser l’export hors ligne déterministe, améliorer la timeline et étendre les tests de bout en bout dans le navigateur.
- **Ensuite :** publier l’exécuteur de commandes headless versionné pour le montage piloté par agent et faciliter le partage de modèles de projet réutilisables.
- **Plus tard :** ajouter la révision collaborative, une interface d’extension et davantage de modèles IA validés localement.

Les priorités sont discutées dans [GitHub Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions).

## Contributions recherchées

Nous recherchons de l’aide sur les médias web, WebCodecs, WebGPU/ONNX, l’UX de la timeline, la localisation, les tests et la documentation. Signalez les bugs reproductibles dans [Issues](https://github.com/MartinDelophy/ai-video-editor/issues), partagez vos idées dans [Discussions](https://github.com/MartinDelophy/ai-video-editor/discussions), ou proposez des correctifs, tests, traductions et exemples ciblés.

## Démarrage rapide

Node.js 20+ et un navigateur Chromium récent sont requis. WebGPU est recommandé.

```bash
git clone https://github.com/MartinDelophy/ai-video-editor.git
cd ai-video-editor
npm install
npm run dev
```

## Validation

```bash
npm test
npm run build
npm run check
```

## Soutien et retours

Si ce projet vous est utile, n'hésitez pas à lui attribuer une ⭐ Star. Si vous rencontrez un problème, [ouvrez une Issue](https://github.com/MartinDelophy/ai-video-editor/issues).

Rejoignez notre [communauté Discord](https://discord.gg/uq2uvUTBr) pour poser des questions, partager vos retours et échanger avec d’autres utilisateurs et contributeurs.

## Licence

[MIT](LICENSE)
