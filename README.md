# Spotter — Weather-aware truck routing

Application du test **Full Stack Developer / Weather-Aware Truck Routing** : frontend **React 19 + TypeScript**, backend **Django 5.2**, carte **Leaflet**. Le backend réalise les appels aux fournisseurs, l’échantillonnage, les conversions d’unités et le classement. Les clés éventuelles restent côté serveur.

[Aperçu ordinateur](docs/desktop.png) · [Aperçu mobile](docs/mobile.png) · [Vérifications effectuées](docs/VERIFICATION.md)

## Démarrage avec Docker

Prérequis : **Docker Engine avec Docker Compose** sur Linux, ou Docker Desktop pour un poste de développement. Python, Node.js et PowerShell ne sont pas nécessaires sur la machine de déploiement.

```bash
cp .env.example .env
# Remplacer DJANGO_SECRET_KEY par une valeur aléatoire dans .env.
docker compose build backend
docker compose build frontend
docker compose up -d --no-build --wait
```

Ouvrir **http://127.0.0.1:8080** (ou le port `FRONTEND_PORT` de `.env`). Les services sont séparés : `backend/Dockerfile` construit uniquement Django/Gunicorn ; `frontend/Dockerfile` compile React et sert ses fichiers avec Nginx. Le frontend transmet `/api/` au backend sur le réseau Docker.

Les conteneurs fonctionnent en arrière-plan. Les deux commandes de construction sont séparées pour limiter la mémoire utilisée. Aux lancements suivants, réutiliser les images avec `docker compose up -d --no-build --wait`. Après modification du code, reconstruire les images concernées.

```bash
docker compose logs -f
docker compose down
```

La cible de déploiement en ligne est Linux. Les anciens lanceurs PowerShell ont été retirés ; la CI utilise les mêmes commandes Docker que ci-dessus.

Le mode **Demo trip** fonctionne sans API externe pour les itinéraires et la météo : trois tracés routiers OSRM enregistrés entre Chicago et Detroit et un front météo simulé déterministe. Les fonds cartographiques et la police web nécessitent Internet ; les tracés, les calculs et la police de secours restent disponibles sans ces ressources. **Ce mode ne présente jamais sa météo comme une prévision réelle.**

Dans **Live planning**, sélectionner une origine et une destination dans les suggestions, puis calculer les routes. Ce mode utilise les services externes et affiche une erreur explicite s’ils sont indisponibles ; il ne bascule pas automatiquement en simulation.

## Développement

Deux terminaux, depuis la racine :

```powershell
# Terminal 1
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe backend/manage.py runserver 127.0.0.1:8000
```

```powershell
# Terminal 2
cd frontend
npm ci
npm run dev
```

Frontend : **http://127.0.0.1:5173**. Vite transmet `/api/` à Django. En production, Django/WhiteNoise sert le build React et l’API sur la même origine, sans configuration CORS. Aucune base de données n’est nécessaire : l’application est sans compte utilisateur ni historique persistant.

Sur Linux/macOS, utiliser `python3 -m venv .venv`, puis `.venv/bin/python` au lieu de `.venv/Scripts/python.exe`.

## Fonctionnalités

- Jusqu’à trois itinéraires routiers distincts : alternatives du fournisseur, puis variantes OSRM par points de passage si nécessaire.
- Départ avec fuseau explicite, chargement en livres, points de contrôle tous les 10/25/50 miles, départ et arrivée inclus.
- ETA calculées à partir des durées des segments de la route, pas d’une vitesse uniforme.
- Vent, pluie et neige à l’heure de passage ; risques adaptés au chargement.
- Distances exposées à chaque risque et recommandation lexicographique conforme au sujet.
- Carte interactive : routes sélectionnables, points colorés, détails météo, zoom/recentrage et navigation depuis le tableau.
- Couche météo du corridor : grille 7×7, interpolation visuelle et 49 états horaires, curseur +0 à +48 h et lecture animée. Le changement d’heure est local, sans nouvel appel API.
- Tableau comparatif, export JSON, avertissement des résultats périmés après modification du formulaire.
- Interface responsive, navigation clavier de la recherche, états de chargement et d’erreur.

## Sources de données

| Besoin | Fournisseur | Configuration |
| --- | --- | --- |
| Recherche de villes | [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | Aucune clé pour l’usage d’évaluation |
| Routage par défaut | [OSRM Route API](https://project-osrm.org/docs/v5.22.0/api/) | `OSRM_URL`, serveur public par défaut |
| Routage poids lourd optionnel | [OpenRouteService](https://openrouteservice.org/dev/) | `ORS_API_KEY` côté Django |
| Prévisions horaires | [Open-Meteo](https://open-meteo.com/en/docs) | Vent mph ; pluie mm ; neige cm, converties en pouces |
| Fond de carte | [OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) | Attribution visible ; usage interactif, aucun téléchargement en masse |

Le serveur OSRM public utilise un **profil routier standard** : il ne certifie ni les dimensions du camion, ni les restrictions légales de poids lourd. Le poids saisi est utilisé pour le risque météo. Avec `ORS_API_KEY`, le profil `driving-hgv` est activé et la masse totale est estimée à chargement + 18 000 lb de véhicule, convertie en tonnes métriques. Cette tare est une hypothèse documentée, pas une donnée du sujet.

Les [restrictions publiques ORS](https://openrouteservice.org/restrictions/) limitent les routes alternatives à 100 km. Tester ce profil sur des trajets courts ou utiliser une instance/configuration adaptée. Ne pas activer une clé ORS en supposant qu’elle couvre le long trajet de démonstration. Les fournisseurs peuvent renvoyer moins de trois routes : le nombre réel est indiqué, sans duplication artificielle. Les services publics ont des quotas et ne constituent pas une infrastructure de production garantie.

## Choix de calcul à expliquer au reviewer

Voir [docs/DECISIONS.md](docs/DECISIONS.md) pour les seuils exacts, la pondération des miles, les hypothèses horaires et les limites. Les choix importants :

1. **Risque du point** = maximum du vent, de la pluie et de la neige après règles de charge.
2. **No Travel** exclut entièrement une route de la recommandation. Si toutes sont exclues, aucune route n’est recommandée.
3. Pour les autres routes : minimum de miles **Severe**, puis **High**, risque moyen pondéré par la distance, puis durée. Aucun score arbitraire ne remplace cet ordre.
4. Les bornes pluie/neige qui se chevauchent dans le PDF appartiennent au niveau supérieur ; les seuils No Travel restent strictement `>1` et `>3`.
5. Le curseur représente la météo spatiale à une heure donnée ; la recommandation utilise toujours l’ETA de chaque point. Déplacer le curseur ne recalcule pas le départ.

## Vérifications

```powershell
.\.venv\Scripts\python.exe backend/manage.py test routing --verbosity 2
cd frontend
npm run build
npx playwright install chromium
# Playwright démarre les serveurs si nécessaire
npm run test:e2e
```

Les tests backend couvrent les bornes et les charges exactes, les unités, les données manquantes, les ETA par segment, la conservation du kilométrage, l’ordre du classement, le cas toutes routes interdites, les validations et le parcours démo complet. Les tests navigateur couvrent le plan, la carte, le curseur, le comparatif, l’export, l’aide, le recalcul, le mobile et les échecs API. La recherche et l’échec réseau du dernier test sont simulés pour que ce test soit reproductible.

## Déploiement

Pour la mise en ligne Linux avec **deux services distincts**, suivre [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). `render.yaml` définit deux services Docker Render gratuits ; les configurations Railway alternatives sont dans `deploy/railway/`.

### Docker Compose : deux services

`compose.yaml` démarre **frontend** (React compilé servi par Nginx) et **backend** (Django/Gunicorn). Nginx sert l’interface et transmet `/api/` au backend sur le réseau Docker. Aucun CORS ni serveur Vite n’est nécessaire. Le backend attend une clé d’application, et le frontend attend que son contrôle de santé réussisse. Aucune base de données n’est requise.

Copier `.env.example` vers `.env` au premier lancement, remplacer `DJANGO_SECRET_KEY` par une valeur aléatoire et adapter les variables utiles. Ne pas écraser un `.env` déjà configuré. `.env` est ignoré par Git et exclu du contexte de construction Docker. Compose le charge automatiquement ; Python/Django lancé directement ne le charge pas.

```powershell
docker compose up -d --build --wait
```

Ouvrir **http://localhost:8080**. Le port peut être changé avec `FRONTEND_PORT` dans `.env`. L’écoute est limitée à la machine locale ; pour un serveur public, adapter le binding de port et configurer HTTPS.

```powershell
docker compose ps
python scripts/smoke-docker.py
docker compose logs -f
docker compose down
```

Les images sont reconstruites sans montage du code source. Les contrôles de santé vérifient Django et Nginx ; les conteneurs redémarrent en cas d’arrêt inattendu. Les plafonds mémoire locaux sont 256 Mio pour Django et 128 Mio pour Nginx. Sur une machine modeste, construire les services séparément avec `docker compose build backend`, puis `docker compose build frontend`.

### Image unique : variante pour hébergement autonome

Le **Dockerfile multi-stage** à la racine conserve une variante complète pour un hébergeur à service unique : compilation React, installation Django, collecte statique, lancement Gunicorn sous un utilisateur sans privilèges. Cette variante historique n'est utilisée ni par Compose ni par le déploiement Railway à deux services.

```powershell
docker build -t spotter .
docker run --rm -p 8000:8000 --env-file .env spotter
```

En production : `DJANGO_DEBUG=false`, `DJANGO_SECRET_KEY` aléatoire, `DJANGO_ALLOWED_HOSTS` correspondant exactement au domaine (sans protocole), HTTPS au niveau de l’hébergeur. `PORT` est pris en charge. `/api/health/` sert au contrôle de disponibilité.

Le fichier `render.yaml` prépare deux services Docker sur Render. Renseigner `BACKEND_UPSTREAM` du frontend avec l’URL HTTPS réellement attribuée au backend et laisser `ORS_API_KEY` vide pour OSRM. Django autorise automatiquement son domaine Render. La limite par IP et le cache sont locaux au processus ; pour un service public à grande échelle, utiliser un cache partagé et une limitation au niveau du proxy.

**GitHub** : [BosterJack/fs-assessment-spotter](https://github.com/BosterJack/fs-assessment-spotter). La pipeline vérifie Django, le build React, les tests navigateur et l’intégration Docker. L’URL d’hébergement public et l’enregistrement Loom restent à fournir. Le scénario de vidéo est dans [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).

## Structure

```text
backend/
  config/           Configuration Django, URLs, WSGI
  routing/
    risk.py         Fonctions pures : seuils, exposition et classement
    geometry.py     Échantillonnage, interpolation des ETA, grille spatiale
    providers.py    Adaptateurs API, cache et normalisation des unités
    demo.py         Géométries enregistrées et météo simulée
    views.py        Contrats HTTP, validation et orchestration
    tests.py        Tests métier et API
frontend/
  src/              Interface React/TypeScript, recherche et carte Leaflet
  tests/            Scénarios Playwright
docs/               Décisions techniques et scénario Loom
```
