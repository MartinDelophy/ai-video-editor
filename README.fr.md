# Timeline Studio — Éditeur vidéo IA dans le navigateur

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | **Français** | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## Utilisation responsable de la synthèse profonde

Cet outil repose sur une technologie de synthèse profonde et est destiné exclusivement à la recherche technique et à l’apprentissage.

Les utilisateurs doivent veiller à :

- utiliser uniquement des images ou vidéos de leur propre visage, ou celles de personnes ayant donné une autorisation légale ;
- ne créer ni diffuser aucun contenu illégal, contrefaisant, faux ou trompeur ;
- ne pas présenter le contenu généré comme une séquence authentique et ne pas usurper l’identité d’une autre personne sans son consentement.

L’utilisateur assume seul toute responsabilité juridique découlant du non-respect de ces exigences.

## Actualités du projet

- **28 août 2026 — Débruitage intelligent local au navigateur :** Visuels → Réparation IA propose DRUNet avec comparaison d’image, quatre intensités, conservation de l’audio source et application réversible. Les clips complets passent désormais à leur cadence source dans un flux WebCodecs qui chevauche décodage et inférence, conserve la session WebGPU, réutilise canevas, tenseurs et tampons de pixels, et réemploie prudemment le résidu pour les images voisines peu différentes ; PNG/FFmpeg reste disponible en secours. Disponible sur ordinateur et mobile dans les 11 langues.
- **28 août 2026 — Préparation vidéo haute fidélité sur la timeline :** les nouvelles vidéos restent dans un état de chargement visible pendant le décodage des métadonnées et des vignettes PTS réelles, évitant les grands blocs provisoires étirés. La pellicule utilise des images source de 180px, une densité lisible adaptée au zoom, une correspondance temporelle exacte sous la tête de lecture et un recadrage centré sans bandes noires pour les vidéos verticales.
- **28 août 2026 — Progression en direct des modèles intégrés à Chrome :** le montage automatique affiche séparément la progression Chrome réelle, l’état d’achèvement et le numéro d’essai des modèles de compréhension visuelle et de traduction des sous-titres. Si Chrome n’émet aucune progression pendant 45 secondes, l’interface signale le blocage et propose Réessayer le téléchargement, déclenché par l’utilisateur afin de conserver l’activation requise et l’état partiel de Chrome.
- **27 août 2026 — Montage précis sur la timeline :** ajout du coulissement du contenu dans les limites du média source, du coulissement à trois plans avec rognage synchronisé des voisins et de la sélection des points de montage avec ajustement déroulant image par image aux flèches. Tous les modes préservent la continuité de la piste visuelle principale, respectent les verrouillages et les limites source, affichent un retour en direct et sont localisés dans 11 langues. Les vignettes verticales et 9:16 remplissent désormais leur cellule par un recadrage centré, sans bandes noires.
- **26 août 2026 — Montage ripple sensible au verrouillage :** ajout d’un mode ripple explicite dans la barre de la timeline. Le glissement d’un média sur la piste principale ouvre avant le dépôt un emplacement de même durée et décale ensemble les clips suivants et leurs points de transition. Les clips principaux disposent désormais d’une poignée de bord initial en montage déroulant, et les dépôts en incrustation prévisualisent leur durée et leur position réelles sur la ligne cible. L’insertion, la duplication, la suppression et les changements de durée déplacent les clips temporisés admissibles du même écart, préservent les liens actifs entre sous-titres et audio, déduisent l’audio source lié de la séquence visuelle et laissent les pistes verrouillées immobiles.

Consultez la [Roadmap](ROADMAP.md) pour les travaux prévus, les [Releases](https://github.com/MartinDelophy/ai-video-editor/releases) pour les changements publiés et les [Issues](https://github.com/MartinDelophy/ai-video-editor/issues) pour les tâches et anomalies.

## Que peut-il produire ?

Découvrez des exemples avant/après reproductibles et des recettes de montage :

→ [AI Video Editing Skills Handbook](https://github.com/MartinDelophy/timeline-studio-handbook)

<p align="center">
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/daily?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
  <a href="https://trendshift.io/repositories/77422?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-77422" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/77422/weekly?language=JavaScript" alt="MartinDelophy%2Fai-video-editor | Trendshift" width="250" height="55"/></a>
</p>

Timeline Studio est un éditeur vidéo IA local qui fonctionne dans le navigateur. Il associe une timeline multipiste inspirée de CapCut à la synthèse vocale, aux sous-titres automatiques, aux outils de vision, aux avatars parlants et à un export hors ligne déterministe.

[Ouvrir l’éditeur](https://video-editor.ai-creator.top/) · [Voir la démo](https://www.youtube.com/watch?v=chdRPG2ndMs) · [Hugging Face Space](https://huggingface.co/spaces/haixin/timeline-studio)

![Éditeur Timeline Studio](docs/screenshots/editor-timeline.png)

## Fonctionnalités principales

- Voix multilingues avec Piper/VITS ONNX et Kokoro 82M.
- Musique IA locale avec Stable Audio 3 Small Q4 ONNX via WebGPU, traduction des descriptions libres, durées de 30/60/90/120 secondes, boucles longues guidées par la forme d’onde, cache persistant du modèle et ajout automatique à Mes ressources.
- Sous-titres automatiques avec Whisper small q8 ONNX.
- Cadrage intelligent avec YOLOS tiny et MODNet.
- Séparation voix/musique et avatars via JoyVASA et LivePortrait.
- Montage multipiste avec incrustations, masques, filtres, animations et images clés.
- Export MP4/WebM dans le navigateur avec WebCodecs et mixage audio.
- PWA installable, cache local des modèles et projets `.timeline`.

## Démo de voix off IA

https://github.com/user-attachments/assets/304a744e-d620-4380-9c17-19af3726f5a4

## Agent Skill

Ce dépôt comprend l’Agent Skill [`edit-timeline-studio`](skills/edit-timeline-studio/SKILL.md), conçu pour planifier, exécuter et vérifier des timelines vidéo modifiables. Son installation nécessite GitHub CLI 2.90.0 ou une version ultérieure.

L’installation via [skills.sh](https://skills.sh/MartinDelophy/ai-video-editor) nécessite Node.js 22.20.0 ou une version ultérieure.

```bash
npx skills add MartinDelophy/ai-video-editor --skill edit-timeline-studio
```

```bash
# Claude Code
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent claude-code --scope user

# Codex
gh skill install MartinDelophy/ai-video-editor edit-timeline-studio --agent codex --scope user
```

Ajoutez `--pin v1.0.0` pour installer la version vérifiée plutôt que de suivre la dernière release. Vous pouvez d’abord l’examiner avec `gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio`.

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
npm run build
npm run check
```

## Soutien et retours

Si ce projet vous est utile, n'hésitez pas à lui attribuer une ⭐ Star. Si vous rencontrez un problème, [ouvrez une Issue](https://github.com/MartinDelophy/ai-video-editor/issues).

Rejoignez notre [communauté Discord](https://discord.gg/uq2uvUTBr) pour poser des questions, partager vos retours et échanger avec d’autres utilisateurs et contributeurs.

## Licence

[MIT](LICENSE)
