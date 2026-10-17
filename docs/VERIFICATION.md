# Vérifications — 16 octobre 2026

Effectuées dans le dossier du projet sous Windows :

| Contrôle | Résultat |
| --- | --- |
| Tests Django | 14 réussis après les derniers changements métier |
| Build React/TypeScript strict | Réussi ; vérification des variables et paramètres inutilisés activée |
| Playwright Chromium | 3 scénarios réussis sur la version finale ; serveurs démarrés et arrêtés automatiquement |
| Responsive | Aucun débordement horizontal global à 390 px |
| API réelles | Trois routes Chicago–Detroit, météo aux checkpoints et recommandation obtenues |
| Corridor réel | Réponse 200, 49 cellules, 49 heures par cellule |
| Distribution par Django | Page HTML, bundle JS et CSS servis en HTTP 200 après collecte statique |
| Santé API | `/api/health/` renvoie `status: ok` |
| Dépendances npm | Aucun problème signalé par l’audit lors de l’installation |
| Inspection visuelle | Captures ordinateur/mobile ; fond OpenStreetMap et couche météo visibles |

La première compilation du conteneur Docker a été interrompue car la machine manquait de mémoire pendant les vérifications. Les tests locaux et le build frontend ont été relancés séparément et ont réussi après cet incident. Aucun réglage mémoire global de la machine n’a été modifié.

Une configuration Docker Compose sépare maintenant React/Nginx et Django/Gunicorn, avec réseau interne et contrôles de santé. `docker compose config --quiet` a réussi. Le nouvel essai de build local s’est terminé par une perte de connexion au moteur Docker (`rpc error: Unavailable / EOF`) ; le lancement local n’est donc pas validé. La pipeline GitHub Actions construit les images, démarre les services et lance `scripts/smoke-docker.py`, qui contrôle HTML, assets, proxy API, trois routes et grille météo. Consulter l’exécution liée au commit pour son résultat effectif.

Le dépôt privé est [BosterJack/fs-assessment-spotter](https://github.com/BosterJack/fs-assessment-spotter). Aucun déploiement public ni enregistrement Loom n’a été créé.

**Validation Docker sur GitHub Actions : réussie.** [Exécution 38946660290](https://github.com/BosterJack/fs-assessment-spotter/actions/runs/38946660290) : tests Django, build React, scénarios navigateur, construction des deux images, contrôles de santé et test d’intégration Nginx → Django. La limite du moteur Docker local n’empêche donc plus la validation des images et du parcours conteneurisé.

## Lanceur Docker — 17 octobre 2026

`start.ps1` lance désormais Docker Compose par défaut ; `start-local.ps1` conserve le démarrage Python/Node hors conteneurs. Vérifications locales sous Windows PowerShell 5 : démarrage automatique de Docker Desktop depuis un moteur arrêté, construction des images, deux services sains, second lancement avec réutilisation des images et test `scripts/smoke-docker.py` réussi. La CI utilise maintenant `./start.ps1 -Rebuild` avec PowerShell pour vérifier le même point d’entrée. Les constructions sont explicitement exécutées service par service et le lancement final interdit les builds implicites parallèles.

Cette étape Windows est historique : pour la préparation du déploiement Linux, les lanceurs PowerShell ont ensuite été retirés et la CI est revenue aux commandes Docker Compose natives. Les services disposent chacun de leur Dockerfile, et Nginx accepte le port et l'adresse privée du backend fournis par l'hébergeur. L'état effectif de publication doit être vérifié à partir d'une URL publique ; une configuration prête ne constitue pas un déploiement effectué.
