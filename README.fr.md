# Timeline Studio — Éditeur vidéo IA dans le navigateur

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | **Français** | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [ไทย](README.th.md) | [Tiếng Việt](README.vi.md) | [Русский](README.ru.md)

[![skills.sh](https://skills.sh/b/MartinDelophy/ai-video-editor)](https://skills.sh/MartinDelophy/ai-video-editor)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![LINUX DO](https://shorturl.at/ggSqS)](https://linux.do)

## Créez avec Anna

La version Anna associe montage assisté par IA et reprise de vos projets :

- Décrivez votre montage à Anna, examinez un plan fondé sur vos instructions et les métadonnées des médias, puis appliquez les réorganisations de clips et les découpes simples de vidéos à 1× prises en charge.
- Les projets et leurs médias sont enregistrés automatiquement dans le cloud Anna et peuvent être repris avec le même compte dans un autre navigateur. Des points de récupération locaux sont également disponibles.
- Affinez le montage dans la timeline multipiste modifiable, ajoutez des voix IA et des sous-titres manuels, puis exportez en MP4 avec un encodeur disponible dans le navigateur.

Cette préversion est destinée aux ordinateurs. La planification n’analyse ni les images ni le son ; les fonctions IA locales dépendent des capacités du conteneur Anna.

→ [Essayer Timeline Studio sur Anna](https://anna.partners/store/@martindelophy/timeline-studio)

## Utilisation responsable de la synthèse profonde

Cet outil repose sur une technologie de synthèse profonde et est destiné exclusivement à la recherche technique et à l’apprentissage.

Les utilisateurs doivent veiller à :

- utiliser uniquement des images ou vidéos de leur propre visage, ou celles de personnes ayant donné une autorisation légale ;
- ne créer ni diffuser aucun contenu illégal, contrefaisant, faux ou trompeur ;
- ne pas présenter le contenu généré comme une séquence authentique et ne pas usurper l’identité d’une autre personne sans son consentement.

L’utilisateur assume seul toute responsabilité juridique découlant du non-respect de ces exigences.

## Actualités du projet

- **2026-10-10** — Prototype sandbox sur `/paypal` : devis fixe, commande serveur et paiement vérifié avant l’assistant. Identifiants et validation réelle de l’IA en attente ; livraison manuelle.
- **2026-10-10** — Aperçu du concours sur `/nebius` : adaptateur Token Factory pour NVIDIA Nemotron côté serveur, métadonnées seules et modifications vérifiées. Inférence réelle en attente de clé et de crédits gratuits.
- **2026-10-07** — La durée minimale des clips visuels passe à 0,05 seconde, corrigeant les coupes refusées dans les introductions courtes, par exemple à 0,45 seconde. Le rognage, les changements de vitesse et la restauration partagent cette limite. Correction du gel vidéo à l’ouverture ou à la fermeture du grand aperçu : le nouvel élément vidéo retrouve le temps source, la lecture et les rappels par image.
- **2026-10-05** — La profondeur est échantillonnée à 8, 16 ou 24 images/s selon le mode Rapide, Standard ou Fin. RIFE produit 24 fps en modes Rapide et Standard, avec échantillonnage et encodage simultanés dans une file limitée. Le son original est conservé et l’analyse terminée reste réutilisable après un échec. Des temps d’échantillonnage fixes et la réutilisation des sessions, pixels et tenseurs RIFE réduisent les interpolations inutiles sans diminuer précision, résolution ni nombre d’échantillons. RIFE utilise nos miroirs Hugging Face et ModelScope à versions immuables, avec vérification du hash, bascule automatique et cache partagé.
- **2026-10-04** — Carte de profondeur — Vidéo en profondeur en gris : proche clair, lointain sombre. L’analyse de profondeur superpose décodage et inférence, encode les PNG dans le worker et limite les mises à jour de l’interface. Aperçu et export interpolent les cartes de profondeur, respectent les temps source après recadrage temporel et changement de vitesse et réutilisent les images décodées. Vidéo de profondeur enregistrée dans Mes ressources. Les vidéos de profondeur remplacent leurs clips source, en conservant les médias. La séquence visuelle détermine la durée et corrige le zéro après suppression et réinsertion. Les vidéos de profondeur incluent le son adapté au découpage et à la vitesse ; la vidéo originale conserve son audio. Éclairage éditable basé sur la profondeur, sphère de position, comparaison par appui maintenu et aperçu actualisé après déplacement.
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
