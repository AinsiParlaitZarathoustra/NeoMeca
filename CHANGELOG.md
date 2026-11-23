# Journal des modifications

Format : `Commit <numéro> (AAAA/MM/JJ) : <résumé concis>`

- Commit 1 (2026/11/22) : publication de la première version de NéoMeca (2026.11.22 / 26.11.22) avec pointage vidéo multi-formats, étalonnage, analyse graphique, exports Excel/CSV/Regressi, mode examen et packaging Windows/Linux.
- Commit 2 (2026/11/22) : sécurisation du workflow de release avec vérification SHA-256, allègement des libellés d'export dans l'interface et simplification du README.
- Commit 3 (2026/11/22) : correction des fins de ligne LF dans `SHA256SUMS-windows.txt` pour la vérification `sha256sum` sous Linux.
- Commit 4 (2026/11/23) : intégration native d'un profil minimal FFmpeg/FFprobe sous licence LGPL v2.1+ dans les paquets Windows et Linux (avec notice `THIRD_PARTY_NOTICES.txt`, script `scripts/build-ffmpeg-minimal.sh` et cache GitHub Actions) et passage en version `26.11.23`.
- Commit 5 (2026/11/23) : normalisation du chemin ressources Linux (`prefix/lib/NeoMeca/bin`) dans la résolution sidecar FFmpeg.
