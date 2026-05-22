# NeoMeca
Logiciel de pointage vidéo pour l'analyse du mouvement en physique-chimie

## Présentation

NeoMeca permet de pointer image par image des objets en mouvement sur une vidéo, d'extraire des données cinématiques et de les exporter vers un tableur.

Conçu pour les professeurs de physique-chimie au lycée.

## Formats supportés

- `.mp4`
- `.mov`  
- `.avi`

## Installation

Aucune installation requise. Double-cliquer sur l'exécutable.

**Configuration minimale**

- Windows 10 ou supérieur
- 140 Mo (version PyInstaller) / 200 Mo (version Nuitka)

## Téléchargement

Onglet [Releases](../../releases).

## Utilisation

1. Ouvrir une vidéo
2. Étalonner l'image
3. Pointer les objets image par image
4. Exporter les données (Excel, CSV)

## Signaler un problème

Onglet [Issues](../../issues).

## Licence et dépendances

NeoMeca est distribué gratuitement pour usage personnel et éducatif.

Ce logiciel utilise les bibliothèques suivantes :
- **OpenCV** (licence Apache 2.0)
- **FFmpeg** (licence LGPL 2.1+)
- **PySide6 / Qt6** (licence LGPL 3.0)
- **Numba** (licence BSD)

Les licences complètes de ces dépendances sont disponibles dans le dossier `licenses/`.

Toute redistribution commerciale ou modification sans autorisation explicite de l'auteur est interdite.
