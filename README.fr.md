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

- **2026-09-20 — Alignement de la tête de lecture :** Glisser la tête blanche affiche un aperçu en direct et l’aligne sur les marqueurs et les extrémités des plages, avec un guide commun et l’heure. Maintenez Alt pour la déplacer librement. Les détails affichent Terminé avant modification, puis Appliquer les modifications.
- **2026-09-17 — Finitions et vérification avec WebMCP :** 21 outils du navigateur couvrent 26 opérations vérifiables, dont le déplacement et la découpe source des clips temporisés, les transformations d’incrustations, le style et la position des sous-titres et le format du projet. Les agents peuvent obtenir des images et extraits audio rendus, lancer une voix off ou une transcription locale avec suivi et annulation, puis vérifier les résultats avant insertion. Les nouveaux contrôles et messages sont disponibles dans les 13 langues.
- **2026-09-15 — Exportation du son monté :** l’exportation d’un clip audio respecte désormais la plage découpée et applique la vitesse de lecture, le volume, les fondus et les effets d’espace. Les clips et le mixage de toute la timeline peuvent être exportés en WAV ou MP3. Une option d’exportation audio seule complète l’exportation vidéo.
- **2026-09-14 — Correction de l’exportation et nouvelles tentatives :** les clips avec un fond uni et des images clés d’opacité s’exportent correctement, même sans masque de personne. En cas d’échec, le message d’erreur reste affiché et l’exportation peut être relancée avec les mêmes réglages.
- **2026-09-14 — Performances des grands projets :** l’importation réduit le travail du thread principal. La mise en cache du calcul des pistes audio, le rendu allégé des formes d’onde et la réduction des repositionnements audio diminuent la charge pendant le déplacement de la tête de lecture et la lecture. Les médias, le minutage des clips, les commandes d’édition, les effets et l’export sont préservés. L’importation affiche la progression réelle et permet le montage dès que les médias sont restaurés ; les vignettes continuent de s’affiner en arrière-plan.

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

Ajoutez `--pin v1.0.8` pour installer la version vérifiée plutôt que de suivre la dernière release. Vous pouvez d’abord l’examiner avec `gh skill preview MartinDelophy/ai-video-editor edit-timeline-studio`.

## Feuille de route

- **Maintenant :** fiabiliser l’export hors ligne déterministe, améliorer la timeline et étendre les tests de bout en bout dans le navigateur.
- **Ensuite :** étendre la parité du rendu headless, les commandes WebMCP vérifiables et le partage de modèles de projet.
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
