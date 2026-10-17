# Déploiement Linux : deux services

Le frontend et le backend sont deux images et processus indépendants. Aucun script PowerShell n'est requis. Le dépôt reste un monorepo : conserver sa racine comme contexte de construction pour les deux services.

## Railway

Créer un projet avec deux services nommés **backend** et **frontend**, depuis le dépôt GitHub ou avec le CLI Railway connecté au compte souhaité.

| Service | Fichier de configuration | Dockerfile | Santé |
| --- | --- | --- | --- |
| backend | `/deploy/railway/backend.json` | `backend/Dockerfile` | `/api/health/` |
| frontend | `/deploy/railway/frontend.json` | `frontend/Dockerfile` | `/healthz` |

Dans les paramètres Railway de chaque service, sélectionner son fichier « Config as Code » ci-dessus. Ces chemins sont relatifs à la racine du dépôt ; ne pas définir `backend/` ou `frontend/` comme racine du contexte Docker. Les fichiers de configuration déclarent les Dockerfiles, contrôles de santé et politiques de redémarrage.

Variables du **backend** :

```dotenv
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=<secret aléatoire propre au déploiement>
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
PORT=8000
RAILWAY_DOCKERFILE_PATH=backend/Dockerfile
```

`RAILWAY_PRIVATE_DOMAIN` et, s'il existe, `RAILWAY_PUBLIC_DOMAIN` sont ajoutés automatiquement aux hôtes Django autorisés. Ne pas utiliser `*`. `ORS_API_KEY` est facultatif : le serveur utilise OSRM si cette clé est absente. Le backend n'a pas besoin de domaine public : Nginx le contacte sur le réseau privé.

Variables du **frontend** :

```dotenv
PORT=8080
BACKEND_UPSTREAM=http://backend.railway.internal:8000
RAILWAY_DOCKERFILE_PATH=frontend/Dockerfile
```

Si le service backend porte un autre nom, utiliser son domaine privé réel à la place de `backend.railway.internal`. Le frontend résout ce nom au moment des requêtes et renouvelle le cache DNS ; le redéploiement du backend ne fige pas son ancienne adresse dans Nginx. Gunicorn et Nginx acceptent IPv4/IPv6. `PORT` est appliqué à l'écoute et au contrôle de santé du frontend.

Déployer le backend, puis le frontend. Générer un domaine Railway public pour **frontend**, sur le port 8080. L'URL HTTPS résultante constitue le lien de l'application à joindre à la candidature. Les appels du navigateur restent sur `/api/` : aucune clé secrète ni URL privée ne doit être intégrée au bundle React.

## Vérification de l'URL publique

```bash
python scripts/smoke-docker.py https://<domaine-public-frontend>
```

Ce contrôle valide le HTML, les assets, l'API à travers Nginx, trois routes de démonstration, la recommandation et le corridor météo. Vérifier ensuite un trajet en mode **Live planning** sur l'URL publique pour valider aussi l'accès sortant aux fournisseurs. La démo ne remplace pas une prévision réelle.

## Configuration de Nginx

`frontend/nginx.conf.template` est généré au démarrage du conteneur par l'entrypoint Nginx. Le script sourcé `frontend/19-spotter-env.envsh` renseigne uniquement `PORT`, `BACKEND_UPSTREAM` et le résolveur DNS. Le même conteneur fonctionne avec les valeurs locales par défaut (`80`, `http://backend:8000`) ou avec les valeurs de l'hébergeur.

Le fichier `render.yaml` et le Dockerfile racine restent une ancienne alternative à service unique ; ils ne représentent pas la séparation Railway décrite ici. Aucun hébergement n'est considéré publié tant que son URL publique n'a pas été obtenue et vérifiée. Les quotas, crédits et éventuels coûts du compte doivent être contrôlés avant de créer les ressources ; aucun abonnement payant n'est souscrit automatiquement par les fichiers du dépôt.

Références : [configuration Railway](https://docs.railway.com/config-as-code), [Dockerfiles](https://docs.railway.com/builds/dockerfiles), [réseau privé](https://docs.railway.com/networking/private-networking), [tarification](https://railway.com/pricing).
