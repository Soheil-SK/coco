# Coco — carte des prix carburants

Application [Next.js](https://nextjs.org) qui affiche les stations-service en France sur une carte (MapLibre + tuiles OpenStreetMap). Chaque point est coloré du **vert au rouge** selon le prix du carburant sélectionné (normalisé sur les stations affichées).

## Source des données (par défaut **sans clé API**)

Par défaut, Coco utilise le jeu **« Prix des carburants en France — flux instantané »** sur **data.economie.gouv.fr** (API Explore v2.1, **sans authentification**) :

- [Dataset sur data.economie.gouv.fr](https://data.economie.gouv.fr/explore/dataset/prix-des-carburants-en-france-flux-instantane-v2)
- Exemple d’endpoint : `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?limit=100&offset=0`

Les carburants et identifiants **1–6** sont alignés sur l’opendata officiel (Gazole, SP95, E85, GPLc, E10, SP98).

### Option : API 2aaz

Pour utiliser à la place l’API documentée sur [swagger.2aaz.fr](https://swagger.2aaz.fr/) (`api.prix-carburants.2aaz.fr`), définissez dans `.env.local` :

```bash
STATION_SOURCE=twoaaz
FUEL_API_KEY=votre_cle
```

**Swagger UI** ne demande pas de clé pour lire la documentation ; l’API **2aaz** pour les listes de stations exige en pratique une clé valide.

## Prérequis

- Node.js récent (voir la version supportée par Next.js 16).
- **Aucune clé** si vous restez sur `STATION_SOURCE=gouv` (défaut).

## Configuration

Copiez `.env.example` vers `.env.local` si besoin (ex. pour repasser en **twoaaz**).

## Lancer en local

```bash
npm install
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000).

## Comportement

- **Gouv** : récupération paginée (`limit=100`) puis fusion ; cache serveur ~15 min ; bouton « Rafraîchir données » → `?refresh=1`.
- **2aaz** : agrégation par département + en-tête `Range` (voir spec OpenAPI).
- Carte : **clusters** aux zooms faibles.

## Scripts

- `npm run dev` — serveur de développement
- `npm run build` — build production
- `npm run start` — serveur après build
- `npm run lint` — ESLint
