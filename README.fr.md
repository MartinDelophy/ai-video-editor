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

- **2026-10-19** — Les workflows prennent en charge les projets complets téléchargeables et importables, ainsi que la sauvegarde Anna et la restauration en copie éditable avec nœuds, liens, consignes et médias. Les deux canevas partagent la gestion du pavé tactile. Correction de la relecture après la fin de l’aperçu comparatif de suppression de filigrane par IA.
- **2026-10-18** — Ajout de pistes synchronisées pour les actions et la caméra, avec un carrousel de scénario modifiable suivant la lecture. Le dialogue 3D réutilise ChatCut avec historique, restauration des brouillons, références aux objets et validation des changements. Le storyboard utilise GPT Image 2 (fal) par défaut. Le routage des modèles de dialogue et la conservation du contexte ont été corrigés, avec vérification des réponses réelles après changement de modèle. La vidéo avec images initiale et finale attend une extension Anna : docs/storyboard-anna-video-contract.md. Les erreurs de chargement des flux sont isolées de l’éditeur, avec réessai, retour et compatibilité entre mises à jour Anna. Le canevas infini ajoute des liens directionnels, la mise en évidence des entrées compatibles et un menu pour créer et connecter le nœud suivant en une seule modification annulable. Le chat permet de rechercher et référencer des nœuds avec @, des étiquettes amovibles et des identifiants explicites.
- **2026-10-17** — Ajout du Canevas infini avec nœuds typés, modifications Anna vérifiables, connecteurs réels, voix et musique locale, versions des résultats, reprise des tâches vidéo et restauration navigateur par compte et projet. Les médias vont dans Mes médias ; la génération nécessite une action explicite. Les deux guides internes sont joints uniquement aux générations, sans apparaître dans les médias, les suggestions @ ou le canevas.
- **2026-10-17** — Traitement audio local avec RNNoise, DeepFilterNet3, égalisation, compression, gain et limiteur ; écoute, application et restauration de l’original. Amélioration du panneau audio source, de l’alignement et du surlignage des sous-titres, des polices multilingues, des pistes liées et des transitions de lecture. Anna ajoute une narration cloud basée sur le catalogue, enregistrée dans Mes ressources, et la dictée ChatCut avec autorisations de l’application et du microphone. Les voix Anna partagent désormais le sélecteur et la synthèse existants, avec trois avatars virtuels générés. Les sous-titres automatiques Anna et la transcription ChatCut partagent Anna STT et conservent les liens audio et vidéo. ChatCut intègre styles de sous-titres, déplacements liés, autocollants, audio spatial et traitement local ; Anna utilise le TTS préféré pour la narration. Chaque sous-titre permet de surligner une sélection, choisir sa couleur et effacer le surlignage. Les cartes Anna lisent les extraits officiels correspondants ; les actions de sous-titres en double ont été supprimées. Anna ajoute un assistant vocal pour consulter les fonctions, ouvrir les panneaux et monter avec ChatCut, avec micro coupé, interruption et confirmation de génération. Les sous-titres traitent tous les clips par défaut, avec sélection individuelle possible. Atténuation automatique pour les sons source, voix et musique, désactivée par défaut, avec Silero local et une courbe commune à l’aperçu et à l’export. Les appels Anna utilisent une forme d’onde dans la barre supérieure, avec micro coupé, interruption et fin, sans panneau superposé. Les coupes conservent la dernière image décodée jusqu’à la présentation de la suivante, sans flash vide. L’atténuation affiche les phases de chargement et sa courbe de volume dans la timeline. Amélioration vocale avec trois intensités, comparaison et restauration de l’original. L’atténuation réutilise le modèle chargé et affiche la progression dès 0 %. Les salutations et commandes précises répondent localement ; les montages complexes restent validés. Les workflows incluent une maquette 3D éditable avec transformations, plans, lecture, annulation et modifications Anna vérifiées ; les voix restent à venir. Ajout du storyboard avec saisie ChatCut, références @, canevas de nœuds initialement vide, choix du modèle et restauration par compte et projet. Les 16 cases forment une seule image ; la génération vidéo avec image finale attend le support Anna.
- **2026-10-12** — La lecture des vidéos longues suspend le raffinement des vignettes et dessine directement l’image exacte sous la tête de lecture, sans JPEG. La reprise privilégie le dernier déplacement. L’audio AAC est extrait sans réencodage ni copie complète de la vidéo dans WASM ; les effets et réglages d’export sont conservés. L’export privilégie les encodeurs matériels compatibles et compose directement les images à leur taille native lorsque les conditions le permettent ; les transformations et effets conservent le rendu existant. L’encodage audio et la composition de l’image suivante se chevauchent avec l’envoi vidéo, avec une file bornée.

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
