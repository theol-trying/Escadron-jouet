# Escadrille Jouet

Jeu de combat aérien arcade 3D multijoueur en ligne aux commandes d’avions jouets miniatures (envergure ~10 cm), dans l’esprit Micro Machines.

## Démarrage local

```bash
npm install
npm run dev
```

Ouvre ensuite `http://localhost:3000` dans plusieurs onglets pour tester le multijoueur localement.

## Commandes de développement

- `npm run dev` : lance le serveur Express + Socket.io + Vite sur le port 3000.
- `npm run lint` : vérifie les types TypeScript.
- `npm test` : exécute les tests unitaires de la physique de vol et des règles de manche.
- `npm run build` : compile le client dans `dist/` et le serveur dans `dist-server/server.js`.
- `npm start` : démarre le serveur de production sur `process.env.PORT` (ou `3000` par défaut).

## Déploiement sur Render (étape par étape depuis GitHub)

Ce projet se déploie en **un seul Web Service Node.js** (client statique + API + WebSockets Socket.io sur la même origine).

1. **Pousser le dépôt sur GitHub**
   - Crée un nouveau dépôt GitHub et pousse l’ensemble du projet à la racine.
2. **Créer un Web Service sur Render**
   - Connecte-toi sur [render.com](https://render.com) puis clique sur **New +** → **Web Service** (ou **Blueprint** pour utiliser directement `render.yaml`).
   - Sélectionne ton dépôt GitHub.
3. **Configurer le service (si création manuelle)**
   - **Runtime** : `Node`
   - **Build Command** : `npm install && npm run build`
   - **Start Command** : `npm start`
   - **Health Check Path** : `/healthz`
   - **Environment Variables** :
     - `NODE_ENV` = `production`
4. **Déployer et jouer**
   - Clique sur **Create Web Service**.
   - Une fois le statut **Live**, ouvre l’URL Render dans ton navigateur : les clients se connectent automatiquement en Socket.io sur la même origine.
