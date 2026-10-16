# Scénario Loom — 7 à 9 minutes

Enregistrer l’écran de l’application et expliquer les décisions avec ses propres mots. Préparer le serveur, un trajet démo et un trajet réel avant l’enregistrement ; ne jamais afficher une clé API.

## 0:00–0:45 — Problème et stack

« Spotter aide un conducteur à comparer ses options selon la météo au moment de son passage, le poids de la charge et la durée. React/TypeScript affiche l’interface et la carte Leaflet ; Django centralise les API et les règles. »

Montrer le formulaire et annoncer que le mode initial est une démonstration à météo simulée, sur des routes enregistrées.

## 0:45–2:15 — Planification et comparaison

Montrer les trois itinéraires Chicago–Detroit. Expliquer le départ local, le poids en lb et l’espacement 10/25/50 miles. Changer l’espacement, montrer l’avertissement de résultats périmés puis recalculer. Sélectionner une autre route sur la carte ou la liste. Ouvrir un point et montrer son ETA et ses conditions météo.

## 2:15–3:30 — Risques et recommandation

Ouvrir l’aide « How it works », expliquer le maximum des trois conditions et les règles de charge. Le seuil 30 000 est strict ; une charge égale au seuil ne passe pas dans le cas supérieur. Expliquer les bornes pluie/neige documentées.

Montrer « Compare routes » et lire l’ordre : Severe, High, moyenne pondérée par les miles, temps. Expliquer qu’une route No Travel est exclue, et qu’aucune recommandation n’est produite si toutes le sont. Ne pas décrire l’algorithme comme une simple préférence pour le plus rapide.

## 3:30–4:30 — Carte météo

Activer/désactiver la couche, déplacer le curseur à +24 puis +48 h, lancer brièvement l’animation. Expliquer la différence entre la couche à une heure commune et les prévisions prises aux ETA des points de passage. Le curseur n’envoie pas de requête météo à chaque mouvement.

## 4:30–5:30 — Données réelles

Passer en « Live planning », rechercher deux villes, choisir les résultats et lancer le calcul. Montrer les données réelles et l’avertissement du profil OSRM standard. Mentionner l’option ORS HGV et sa restriction de distance pour les alternatives publiques. Si un fournisseur est en panne, montrer le message honnête et revenir explicitement au mode démo.

## 5:30–7:00 — Code et tests

Montrer `backend/routing/risk.py` : fonctions pures, règles lisibles, tuple de classement. Montrer `geometry.py` : distance cumulée et durées par segment. Montrer `providers.py` : unités, heure du cumul, cache et refus des données manquantes. Montrer la commande des tests backend, puis les tests Playwright et le build TypeScript.

## 7:00–8:00 — Livraison et limites

Montrer le dépôt GitHub et l’URL déployée une fois créés. Expliquer le Dockerfile, le contrôle `/api/health/` et les variables serveur. Mentionner les limites utiles : API publiques, profils routiers, résolution horaire, absence de trafic/pauses et d’authentification. Terminer par une courte démonstration responsive et l’export JSON.

## Avant soumission

- Renseigner dans le message de livraison : URL GitHub, URL de l’application et URL Loom.
- Vérifier le mode réel sur l’hébergement et l’absence de clé dans le navigateur/dépôt.
- Vérifier les avertissements de simulation et les attributions de carte.
- Relancer les tests et le build, et conserver ce README à jour.
- Expliquer les choix soi-même : la vidéo doit refléter ce que l’on comprend et peut défendre en entretien.
