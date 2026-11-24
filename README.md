# Escadrille Jouet

Jeu de combat aérien arcade en 3D, multijoueur en ligne, aux commandes d’avions jouets miniatures (envergure ~10 cm)
dans des pièces de la maison à taille géante. Pensé d’abord pour PC (clavier, souris ou manette).

---

## Sommaire

- [Jouer](#jouer)
- [Commandes](#commandes)
- [Paramètres du joueur](#paramètres-du-joueur)
- [Ajouter tes propres musiques](#ajouter-tes-propres-musiques)
- [Régler l’équilibrage](#régler-léquilibrage)
- [Développement](#développement)
- [Mise en ligne sur Render](#mise-en-ligne-sur-render)

---

## Jouer

### Modes de jeu (choisis par l’hôte dans le salon)

| Mode | Principe |
|---|---|
| **Dernier avion en vol — Chacun pour soi** | Le dernier avion encore en vol gagne la manche. Au bout de 4 minutes, l’aspirateur géant (mort subite) rétrécit la zone. |
| **Dernier avion en vol — Équipes** | Rouges contre Bleus ; la dernière équipe en vol gagne. Les équipes vides sont rééquilibrées automatiquement. |
| **Course d’anneaux** | Passer dans les anneaux dans l’ordre (anneau doré), 2 tours, sans tir. Un crash ramène à l’anneau précédent. Jouable seul ; le meilleur temps de chaque pièce est gardé sur l’appareil. |
| **Roi du ciel** | Rester **seul** dans la zone pour marquer ; le premier à 40 s gagne. La zone change de place toutes les 30 s, réapparitions illimitées. |

Les matchs se jouent en 3 manches. Le salon permet aussi de choisir la pièce, le nombre de vies, le nombre de joueurs,
les bots (et leur niveau : **Facile**, **Normal**, **Expert**) et le tir allié en équipes.

### Les pièces

- **Le bureau** — clavier canyon, tiroir tunnel, tours de briques, ventilateur oscillant.
- **La cuisine** — îlot tunnel, frigo qui s’ouvre quand il veut, courant chaud des plaques, mixeur mortel.
- **Le jardin** — arroseur rotatif, bac à sable, niche, nains de jardin.
- **Le grenier** — charpente à slalomer, malle, cheval à bascule, courant d’air de la lucarne, toile d’araignée mortelle.

Des **événements** surviennent en cours de partie : un chat géant traverse la pièce (obstacle qui bouscule les avions),
ou le courant saute quelques secondes.

### Salon, invitations

- **Partie rapide** : tout le monde arrive dans le même salon public, même en cours de match (on regarde la manche en
  cours, puis on rejoint le combat à la suivante ; en course et au roi du ciel, on vole tout de suite).
- **Salon privé** : un code à 5 lettres. Le bouton **Inviter** partage (ou copie) un lien `…/?salon=CODE` qui fait
  rejoindre directement.

### Progression

Certaines peintures et autocollants se débloquent en jouant (progression enregistrée dans le navigateur ; le hangar
affiche ce qu’il reste à faire pour chaque objet) :

| Objet | Condition |
|---|---|
| Peinture Orange Mandarine | 2 matchs joués |
| Autocollant Cœur | 3 matchs joués |
| Peinture Rose Bonbon | 5 matchs joués |
| Peinture Blanc Nacré | 10 avions abattus |
| Autocollant Flamme | 15 avions abattus |
| Peinture Violet Galaxie | 1 match gagné |
| Autocollant Couronne | 2 matchs gagnés |
| Peinture Or Trophée | 3 matchs gagnés |

En fin de match : podium 3D et titres (As du jour, Kamikaze, Ramasse-tout, Démolisseur, Increvable).
Les seuils se règlent dans [`src/progression.ts`](src/progression.ts).

---

## Commandes

Touches physiques : la disposition **AZERTY** est indiquée, le QWERTY marche aux mêmes emplacements.
Le **mode de contrôle** se choisit dans *Paramètres* ou dans la fenêtre *Commandes*.

| Action | Clavier seul | Clavier + souris |
|---|---|---|
| Diriger | **Z / Q / S / D** | la souris (l’avion vise le curseur) |
| Gaz / frein | **↑ / ↓** | **Z / S** |
| Tirer | **Espace** ou **Entrée** | **clic gauche**, Espace ou Entrée |
| Turbo | **Maj** | **Maj** |
| Missile / objet spécial | **Ctrl** | **Ctrl** ou **clic droit** |
| Tonneau à gauche / à droite | **A / E** | **A / E** |
| Vue poursuite ↔ cockpit | **V** | **V** |
| Tableau des scores | **Tab** | **Tab** |
| Pause | **P** ou **Échap** | **P** ou **Échap** |
| Couper le son | **M** | **M** |

**Manette** : stick gauche pour diriger, gâchette droite pour tirer, A turbo, B objet, LB / RB tonneaux.
Les commandes tactiles restent disponibles sur téléphone et tablette.

> En partie, quitter la page demande une confirmation : sur un clavier QWERTY, Ctrl (objet) + W (monter) forme le
> raccourci « fermer l’onglet », que le navigateur ne laisse pas désactiver.

---

## Paramètres du joueur

Dans **Paramètres** (enregistrés dans le navigateur) :

- volumes : général, effets, ambiance de la pièce, **musique** ;
- **mode de contrôle** (clavier + souris / clavier seul), sensibilité souris ou clavier, axe vertical inversé ;
- **aide à la visée légère** (corrige un peu la trajectoire quand un adversaire est presque dans le viseur) ;
- **vue de la caméra** : poursuite ou **cockpit** (tableau de bord propre à chaque avion, avec horizon artificiel).

---

## Ajouter tes propres musiques

Le jeu joue des musiques synthétisées (« Boîte à musique » au menu, « Marche des jouets » en vol). Pour ajouter les
tiennes :

1. **Crée le dossier `public/music/`** et mets-y le fichier.
   Formats lus par les navigateurs : `.ogg`, `.mp3`, `.m4a`/`.aac`, `.wav`, `.flac`, `.opus`.
   Le plus sûr est de fournir **le même morceau en `.ogg` et en `.mp3`** : chaque navigateur prend le premier qu’il sait lire.
2. **Retire les métadonnées du fichier avant de le committer.** Le garde-fou du dépôt refuse les fichiers audio qui
   contiennent encore des étiquettes ID3, APE ou C2PA (titre, artiste, certificat d’origine…). Avec
   [FFmpeg](https://ffmpeg.org) :

   ```bash
   # OGG (recommandé : pas d’étiquette ID3)
   ffmpeg -i morceau.wav -map_metadata -1 -fflags +bitexact -c:a libvorbis -q:a 5 public/music/mon-titre.ogg

   # MP3 sans aucune étiquette (id3v2_version 0 = ne pas en écrire)
   ffmpeg -i morceau.mp3 -map_metadata -1 -fflags +bitexact -id3v2_version 0 -write_id3v1 0 -c:a copy public/music/mon-titre.mp3
   ```

   Si une étiquette reste, le commit est refusé : il suffit de refaire la conversion.
3. **Déclare le morceau** en ajoutant une ligne dans [`src/audio/musicTracks.ts`](src/audio/musicTracks.ts) :

   ```ts
   { id: 'mon-titre', title: 'Mon titre', moment: 'match', sources: ['/music/mon-titre.ogg', '/music/mon-titre.mp3'] },
   ```

   `moment` vaut `'menu'` (écran titre, salon) ou `'match'` (en vol). Quand plusieurs morceaux existent pour un moment,
   ils s’enchaînent ; un seul morceau tourne en boucle. Si un fichier ne se lit pas, le jeu revient tout seul à la
   musique synthétisée.
4. Le volume se règle dans *Paramètres → Musique*.

---

## Régler l’équilibrage

Les principaux réglages sont regroupés pour être modifiés sans chercher :

| Réglage | Fichier | Valeur actuelle |
|---|---|---|
| Taille des pièces (`ARENA_SCALE`) | [`shared/constants.ts`](shared/constants.ts) | 1,4 (pièces 40 % plus grandes) |
| Vitesse des avions (`PLANE_SPEED_SCALE`) | [`shared/constants.ts`](shared/constants.ts) | 0,85 (15 % plus lents) |
| Caractéristiques des 4 avions | [`shared/planes.ts`](shared/planes.ts) | vitesse, virage, points de vie, cadence, dégâts… |
| Niveaux des bots (`BOT_SKILL`) | [`server/bots.ts`](server/bots.ts) | Facile / Normal / Expert |
| Course et roi du ciel (`RACE_LAPS`, `KING_TARGET`, `KING_ZONE_PERIOD`…) | [`shared/objectives.ts`](shared/objectives.ts) | 2 tours, 40 s, zone qui bouge toutes les 30 s |
| Événements de pièce (fréquence, durées) | [`shared/roomEvents.ts`](shared/roomEvents.ts) | un événement toutes les ~70 s |
| Pièces (obstacles, apparitions, bonus) | [`shared/maps/`](shared/maps) | un fichier par pièce, en « unités de conception » |

Après un changement, `npm test` vérifie notamment que les apparitions et les circuits d’anneaux restent dégagés.

---

## Développement

```bash
npm install
npm run dev        # serveur + client sur http://localhost:3000 (ouvre plusieurs onglets pour le multi)
```

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur Express + Socket.io + Vite (rechargement du client ; relancer après un changement côté serveur) |
| `npm run lint` | vérification TypeScript stricte |
| `npm test` | tests (physique, règles, cartes, modes, bots, réseau, progression) |
| `npm run build` | client dans `dist/`, serveur dans `dist-server/server.js` |
| `npm start` | serveur de production sur `process.env.PORT` (3000 par défaut) |

### Organisation

- `server.ts`, `server/` : serveur autoritaire à 30 Hz (salons, boucle de jeu, bots).
- `shared/` : code commun serveur / client (physique, règles, cartes, modes, événements, format réseau).
- `src/` : client React + moteur Three.js (`src/engine/`), interface (`src/components/`), sons (`src/audio/`),
  textes français (`src/i18n/fr.ts`).
- Le réseau envoie des mises à jour binaires compactes (`shared/snapshotCodec.ts`). Si la forme d’un message change,
  incrémenter `PROTOCOL_VERSION` (`shared/constants.ts`) : les pages restées ouvertes se rechargent après un déploiement.

---

## Mise en ligne sur Render

Le projet se déploie en **un seul Web Service Node.js** (client, API et Socket.io sur la même adresse).

1. Sur [render.com](https://render.com) : **New +** → **Blueprint**, puis choisis ce dépôt : `render.yaml` configure tout.
2. Ou en création manuelle (**New +** → **Web Service**) :
   - **Runtime** : `Node` (version 22, fixée dans `package.json`)
   - **Build Command** : `npm ci --include=dev && npm run build`
   - **Start Command** : `npm start`
   - **Health Check Path** : `/healthz`
   - **Environment Variables** : `NODE_ENV` = `production`
3. Une fois le service **Live**, ouvre son adresse : les joueurs se connectent automatiquement.

Sur l’offre gratuite, le serveur s’endort après ~15 minutes sans joueur et met jusqu’à une minute à repartir ; le jeu
affiche alors « Le serveur se réveille… » et se reconnecte tout seul.
