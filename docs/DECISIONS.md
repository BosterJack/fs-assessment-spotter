# Décisions techniques

## Interprétation des règles

Toutes les valeurs de calcul restent en pleine précision. L’arrondi ne s’applique qu’à l’affichage.

| Niveau | Score | Vent mph | Pluie in/h | Neige in/h |
| --- | --- | --- | --- | --- |
| Low | 0 | <25 | <0,10 | <0,5 |
| Moderate | 1 | [25,35[ | [0,10;0,25[ | [0,5;1[ |
| High | 2 | [35,45[ | [0,25;0,50[ | [1;2[ |
| Severe | 3 | [45,55[ | [0,50;1,00] | [2;3] |
| No Travel | 4 | ≥55 | >1,00 | >3 |

Les plages entières de vent sont prolongées continûment pour traiter 34,8 ou 54,9 mph. Aux bornes pluie/neige partagées, le niveau le plus conservateur s’applique, tout en conservant les signes stricts du dernier niveau. Les seuils de charge sont stricts : 30 000 lb n’est pas « >30 000 », et 40 000 lb n’est pas « >40 000 ».

Les règles de charge modifient le risque de vent, puis le maximum des trois conditions détermine le risque global. Une condition ne peut pas faire diminuer le risque d’une autre. Le sujet impose ces règles même si un camion chargé peut se comporter différemment en conditions réelles ; nous n’inversons pas les seuils.

## Exposition en miles et classement

La route est divisée par les checkpoints ; le dernier intervalle peut mesurer moins que l’espacement choisi. Chaque intervalle reçoit le pire des risques de ses deux extrémités. Ce choix conservateur évite de compter un point isolé comme une distance entière et garantit que la somme des miles par risque égale la distance de la route.

Le risque moyen vaut `somme(score_intervalle × miles_intervalle) / miles_totaux`. Une route qui contient un point No Travel n’est jamais recommandée, même si ce point est au départ ou à l’arrivée. Si toutes sont interdites, `recommended_id` vaut `null`.

Le classement des routes admissibles utilise un tuple : `(miles Severe, miles High, risque moyen, durée)`. Le tuple garantit l’ordre du PDF. Une faible différence de Severe prévaut donc sur une grande différence de durée ; il s’agit d’un ordre lexicographique, pas d’une somme pondérée subjective.

## Positions et temps

Les géométries sont complètes, et les distances/durées des segments viennent du fournisseur. On interpole la position sur le segment qui contient la distance cible et l’ETA à partir des durées cumulées. Les annotations OSRM peuvent omettre les pénalités de virage présentes dans le résumé : on réconcilie les totaux en conservant les proportions entre segments. Le dernier point conserve ainsi la distance et la durée totales annoncées. ORS utilise les durées de chaque instruction, réparties sur sa géométrie, puis la même réconciliation.

Les dates HTTP sont ISO 8601 avec fuseau ; Django calcule en UTC et React affiche les temps dans le fuseau local du navigateur. Le formulaire accepte un départ entre maintenant (tolérance 10 minutes pour la saisie) et J+7. Les ETA au-delà de la couverture disponible provoquent une erreur : on n’utilise pas la dernière heure connue comme remplacement.

Open-Meteo fournit des cumuls sur l’heure précédente. Une arrivée à 10:15 utilise donc le cumul de l’heure se terminant à 11:00. Le vent et la température sont également sélectionnés à cette heure pour conserver un jeu cohérent. Cela constitue une résolution horaire, pas une prévision à la minute.

Conversions : pluie `(rain + showers) / 25,4` depuis des mm ; neige `snowfall / 2,54` depuis des cm ; vent demandé directement en mph. Les données manquantes ne valent jamais zéro : elles empêchent le classement plutôt que de donner un faux niveau Low.

## Carte et performance

La carte affiche les trois routes et les checkpoints de la route sélectionnée ; les coordonnées et prévisions de toutes les routes restent disponibles dans le comparatif et l’export. Une sélection sur une ligne ou une carte de trajet synchronise le tableau. La sélection d’un checkpoint dans le tableau centre la carte.

La grille météo 7×7 couvre l’enveloppe des routes avec une marge. Elle est volontairement bornée à 49 points pour maîtriser le coût réseau. C’est une couverture du corridor par son enveloppe rectangulaire, pas une météo haute résolution sur chaque mètre de chaussée. L’interpolation bilinéaire de la couleur produit une couche continue ; elle illustre le risque et n’intervient jamais dans le classement métier. Les calculs de route utilisent uniquement les prévisions effectivement échantillonnées.

Les 49 heures de chaque cellule sont chargées une seule fois ; le curseur et son animation ne déclenchent aucun appel réseau. Les routes et le tableau sont disponibles avant le chargement du corridor ; une panne du corridor laisse les résultats utilisables. Les requêtes météo sont groupées par 35 coordonnées, dédupliquées et mises en cache 20 minutes. Le cache de géocodage dure 24 h, celui du routage 30 minutes. Les requêtes devenues obsolètes sont annulées côté client.

Une route est limitée à 180 checkpoints. L’API refuse les requêtes trop grandes, coordonnées non finies, poids invalides et espacements hors 10/25/50 miles. La limitation IP est un garde-fou local, pas un mécanisme anti-abus distribué.

## Limites assumées

- Trois alternatives distinctes ne sont pas garanties par un réseau routier. OSRM recherche d’abord ses alternatives puis jusqu’à deux variantes via des points de passage. Les doublons spatiaux et détours >1,8 fois le trajet initial sont écartés. Les points de passage peuvent occasionner un détour peu pertinent : le reviewer doit pouvoir le voir sur la carte.
- Le profil OSRM gratuit n’est pas un profil légal poids lourd. ORS HGV est optionnel, avec une tare estimée et la restriction publique de 100 km sur les alternatives.
- Les ETA excluent le trafic en direct, les pauses et les temps de service. Le poids est celui de la charge, pas une mesure du véhicule complet.
- Les risques entre checkpoints peuvent différer. Un espacement plus fin réduit ce risque sans l’éliminer. Le vent transversal, les rafales et le verglas ne figurent pas dans les règles fournies et ne sont pas ajoutés au score.
- Les API et fonds de carte nécessitent Internet et le respect de leurs conditions d’utilisation. La démo utilise des données météo synthétiques et ne fait pas appel à ces API pour le calcul.
- Aucune authentification ou persistance n’était demandée. L’API est publique et sans état, en même origine ; elle ne manipule pas de session ni de cookie d’authentification.

## Contrat API

- `GET /api/health/` : état et fournisseur de routage configuré.
- `GET /api/places/?q=Chicago` : `{places: [{name, coordinate: [lon,lat]}]}`.
- `POST /api/plan/` : `{mode, origin, destination, departure, load_lb, spacing_miles}`. En démo, les lieux sont fixés côté serveur. Réponse : routes, checkpoints avec météo/risque/ETA, résumés, recommandation, avertissements et grille du corridor.
- `POST /api/corridor/` : `{mode, coordinates, base_time, load_lb}`. Réponse : cellules avec 49 scores et vitesses de vent, base UTC. La base doit dater de moins de deux heures.

Codes : 400 pour entrée invalide, 405 pour méthode incorrecte, 429 pour fréquence excessive, 502 pour erreur de fournisseur. Les messages ne dévoilent pas les clés externes.
