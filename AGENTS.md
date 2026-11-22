# Instructions du projet NeoMeca2

NeoMeca2 est un remplaçant moderne d'AviMéca : pointage vidéo et analyse mécanique pour la physique-chimie. Pile technique : Tauri v2, Rust, React, TypeScript, Tailwind CSS, shadcn/ui et FFmpeg / FFprobe.

## Langue

- Utiliser le français par défaut pour les commentaires, les messages de commit, la documentation, le changelog, les notes de version et les textes de l'interface, sauf demande explicite de l'utilisateur.
- Les identifiants de code (variables, fonctions, types, fichiers) restent en anglais.

## Ingénierie et vérification

- Lancer les tests Rust avec `cargo nextest` (par exemple `cargo nextest run --workspace` dans `src-tauri/`), et non `cargo test` seul, sauf pour exécuter les doc tests séparément.
- Vérifier aussi `cargo check` et `cargo clippy` dans `src-tauri/` sans erreur bloquante.
- Limiter strictement les modifications au périmètre de la demande. Lors d'un refactoring, supprimer les modules morts et le code inutilisé au lieu de laisser du code hérité.
- Pour toute modification importante du code ou du flux de travail, faire une passe de vérification par un sous-agent avant de conclure.
- Garder le code multiplateforme : toute API propre à un OS doit être isolée derrière `#[cfg(...)]`.
- Ne jamais lancer `git commit` ou `git push` sans l'accord explicite de l'utilisateur.

## Interface frontend (React)

- Les agents doivent utiliser les composants officiels shadcn/ui pour React et consulter le serveur MCP shadcn lors de l'ajout ou de la modification de composants d'interface.
- Utiliser strictement les composants officiels shadcn/ui (`@/components/ui/*`) et les icônes `lucide-react` dans toute l'interface, y compris pour les boutons et les animations. Ne pas créer de primitives d'interface maison quand un composant shadcn/ui existe.
- Vérifier React, TypeScript et les tests unitaires à la racine du projet avec `npm run check && npm run test:types && npm run test:unit`. Tant que ces scripts n'existent pas dans `package.json`, utiliser au minimum `npx tsc --noEmit`.

## Style de la documentation et des notes de version

- Écrire la documentation et les notes de version dans un français simple, direct, concis, exact et naturel.
- Organiser la documentation en sections claires et limiter le jargon technique.
- Ne jamais utiliser de tiret cadratin (—) dans la documentation, le changelog ou les notes de version.
- Rédiger les notes de version à la première personne du singulier (« je » et non « nous ») et garder la section « Méthodologie et vérifications de la publication automatique » brève.

## Commits Git

- Formater les titres de commit selon la convention à crochets : `[Type : portée] <verbe à l'infinitif> <ce qui a été fait>`. Omettre ` : portée` uniquement quand le changement concerne tout le dépôt (par exemple `[Docs] mettre à jour le README`).
- Pour un changement cassant, ajouter `!` au début, à l'intérieur des crochets : `[!Type : portée] <verbe à l'infinitif> <ce qui a été fait>`.
- Ne pas utiliser d'en-têtes en minuscules avec parenthèses comme `perf(UI): ...`.
- Types de commit autorisés :
  - `Feat` : ajout d'une fonctionnalité visible par l'utilisateur (exemple : `[Feat : ui] ajouter le mode sombre`)
  - `Fix` : correction d'un bug (exemple : `[Fix : video] gérer l'absence de ffprobe`)
  - `Docs` : documentation uniquement (exemple : `[Docs] mettre à jour le README`)
  - `Refactor` : restructuration sans changement de comportement (exemple : `[Refactor : calibration] simplifier le calcul d'échelle`)
  - `Style` : mise en forme, espaces ou indentation uniquement (exemple : `[Style : css] supprimer les marges inutilisées`)
  - `Test` : ajout ou correction de tests (exemple : `[Test : pointage] ajouter des tests unitaires`)
  - `Chore` : maintenance ou configuration hors code livré (exemple : `[Chore] mettre à jour .gitignore`)
  - `Ci` : workflows et scripts d'intégration continue (exemple : `[Ci] mettre en cache les artefacts cargo`)
  - `Build` : outillage de build ou dépendances (exemple : `[Build : deps] mettre à jour tauri en 2.x`)
  - `Perf` : amélioration des performances (exemple : `[Perf : video] réduire le temps d'extraction des images`)
- Rédiger le corps du commit en paragraphes courts, directs et efficaces plutôt qu'en longues listes.

## Changelog (CHANGELOG.md)

- Mettre à jour `CHANGELOG.md` à chaque commit.
- Chaque entrée indique le numéro du commit, la date (AAAA/MM/JJ) et un résumé très concis de ce que le commit ajoute ou modifie.

## Versionnage, publications CI et mise à jour automatique

- NeoMeca2 utilise le CalVer. Format `AAAA.M.J` pour les versions officielles (année sur 4 chiffres, sans zéro initial pour que les contrôles SemVer de Cargo, npm et Tauri passent, par exemple `2026.11.15`), et `AAAA.MM.JJ-HHMM` pour les tags Nightly et ODR (publication à la demande).
- Cibler uniquement Windows (priorité) et Linux pour les builds desktop : `.setup.exe` et `.zip` pour Windows, `.AppImage` et `.deb` pour Linux.
- Garder la mise à jour automatique intégrée (`tauri-plugin-updater`) pointée strictement vers les GitHub Releases officielles, jamais vers les pré-versions Nightly ou ODR.
- Conserver dans les descriptions de version l'avertissement de transparence sur les binaires open source non signés.
- Ne jamais committer de secrets (clés d'API, jetons, mots de passe) dans le dépôt ou dans les fichiers de règles.

## Licence

- NeoMeca2 est distribué sous licence Mozilla Public License 2.0 (MPL 2.0). Le texte complet doit figurer dans le fichier `LICENSE` à la racine.
- Les nouveaux fichiers source peuvent porter l'en-tête SPDX `SPDX-License-Identifier: MPL-2.0`.
- Toute dépendance ajoutée doit avoir une licence compatible avec la MPL 2.0.
