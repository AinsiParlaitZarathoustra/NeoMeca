# Politique de Sécurité

## Versions Supportées

NeoMeca supporte actuellement les versions suivantes avec mises à jour de sécurité :

| Version | Statut | Sortie | Support jusqu'au |
|---------|--------|--------|------------------|
| 1.2.x   | À venir | 26 mai – 31 décembre 2026 | TBD |
| 1.0.x   | Active | 8 mai 2026 | 31 décembre 2026 |

## Signaler une Vulnérabilité

Si vous découvrez une vulnérabilité de sécurité dans NeoMeca, merci de la signaler **en privé** :

1. **Ne pas ouvrir de rapport public sur GitHub**
2. Utilisez [GitHub Security Advisory](https://github.com/AinsiParlaitZarathoustra/NeoMeca/security/advisories)
3. Ou contactez via la fonctionnalité de rapport de vulnérabilité privée de GitHub

### Chronologie de Réponse

- **Accusé de réception :** Dans les 48 heures
- **Évaluation :** Dans la semaine
- **Correctif & publication :** Selon la gravité
  - Critique : Dans les 2 semaines
  - Haute : Dans le mois
  - Moyenne/Basse : Prochaine version

### Divulgation Publique

Une fois corrigée et publiée, la vulnérabilité sera divulguée publiquement avec crédit au rapporteur (sauf demande contraire).

## Attentes de Sécurité

NeoMeca est un logiciel éducatif conçu pour les professeurs et élèves de physique. Il n'est **pas** destiné aux systèmes de production ou au traitement de données sensibles.

Vulnérabilités que nous prenons au sérieux :
- Dépassements de buffer ou corruption mémoire
- Exécution de code arbitraire
- Escalade de privilèges
- Exfiltration de données

Problèmes que nous pourrions décliner :
- Attaques par déni de service
- Vecteurs d'ingénierie sociale
- Problèmes dans les dépendances tierces (signaler directement à ces projets)

## Dépendances Tierces

NeoMeca utilise des bibliothèques bien maintenues (OpenCV, FFmpeg, CustomTkinter, NumPy, etc.). Pour les vulnérabilités dans ces dépendances, merci de signaler directement aux projets respectifs.

---

*Dernière mise à jour : 22 mai 2026*
