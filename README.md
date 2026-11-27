# Escadrille Jouet

Jeu de combat aérien arcade en 3D, multijoueur en ligne, aux commandes d’avions jouets miniatures (envergure ~10 cm)
dans des pièces de la maison à taille géante. Pensé d’abord pour PC (clavier, souris ou manette).

---

## Sommaire

- [Jouer](#jouer)
- [Commandes](#commandes)
- [Paramètres du joueur](#paramètres-du-joueur)
- [Graphismes](#graphismes)
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
| **Course d’anneaux** | Passer dans les anneaux dans l’ordre (anneau doré), 2 tours, sans tir. Un crash ramène à l’anneau précédent. Jouable seul ; le meilleur temps de chaque pièce est gardé sur l’appareil, avec son **fantôme** : la course du record revole en avion translucide aux parties suivantes, et le panneau affiche le temps à battre. |
| **Roi du ciel** | Marquer dans la zone : plein tarif seul, **moitié si elle est disputée** (seul l’avion le plus proche du centre marque alors). Le premier à 30 s gagne. La zone, toujours en plein ciel, change de place toutes les 30 s ; réapparitions illimitées. |
| **Survie** | Tous ensemble (bots compris) contre **8 vagues** de mouches (rapides, en zigzag, elles piquent au contact) et de drones jouets (lents, font du surplace pour tirer). Les vagues grossissent avec leur numéro et le nombre de pilotes ; 6 s de répit et 50 points de bonus entre deux vagues. Gagné après la 8e vague, perdu quand plus personne n’a de vie. |

Les matchs se jouent en 3 manches (une seule en Survie). Le salon permet aussi de choisir la pièce, le nombre de vies,
le nombre de joueurs, les bots (et leur niveau : **Facile**, **Normal**, **Expert**) et le tir allié en équipes.

**Premier vol** (bouton de l’écran titre, mis en avant tant qu’il n’a pas été terminé) : vol guidé seul dans le
bureau, en 9 étapes qui avancent dès que le geste est fait (diriger, gaz, turbo, tonneau, casser la tirelire, ramasser
puis utiliser un objet, vue cockpit). Les consignes affichent tes propres touches.

### Les avions

| Avion | Caractère |
|---|---|
| **Jet en plastique** | polyvalent, vif et équilibré |
| **Biplan à remontoir** | ultra maniable, idéal dans les virages serrés |
| **Planeur en mousse** | très rapide mais fragile aux chocs |
| **Bombardier en métal** | lourd, blindé, canons lourds à billes |
| **Hélicoptère jouet** | fait du **surplace** (frein à fond = immobile) et monte à la verticale : parfait pour tenir une zone |
| **Avion en papier** | le plus rapide de tous (turbo 160) mais le plus fragile (62 PV) |

### Les pièces

- **Le bureau** — clavier canyon, tiroir tunnel, tours de briques, ventilateur oscillant.
- **La cuisine** — îlot tunnel, frigo qui s’ouvre quand il veut, courant chaud des plaques, mixeur mortel.
- **Le jardin** — arroseur rotatif, bac à sable, niche, nains de jardin.
- **Le grenier** — charpente à slalomer, malle, cheval à bascule, courant d’air de la lucarne, toile d’araignée mortelle.
- **La chambre d’enfant** — un **mobile qui tourne** au plafond et un **petit train en marche** autour du tapis (des
  obstacles qui bougent : ils cognent), lit, armoire, nounours, coffre à jouets, brise de la fenêtre.
- **La salle de bain** — la **vapeur** du bain fait monter les avions, un **canard** en plastique flotte (il se casse), un
  **vrai miroir** reflète la partie, et gare aux **toilettes** : plonger dans la cuvette est fatal.
- **Le garage** — vélo **suspendu au plafond**, établi et panneau à outils, étagères en métal, et la porte entrouverte sur
  la rue qui laisse entrer des **rafales** (et des feuilles).

Des **événements** surviennent en cours de partie : un chat géant traverse la pièce (obstacle qui bouscule les avions,
et qui **donne des coups de patte** à ceux qui passent devant lui), ou le courant saute quelques secondes.

### Pendant la partie

- **Messages rapides** (touches **1** à **4**) : « Bien joué ! », « Oups ! », « À l’aide ! », « On y va ! », affichés
  quelques secondes pour toute la salle, au nom et à la couleur du pilote.
- **Revoir l’action** (touche **R** une fois abattu) : rediffusion des 5 secondes avant la chute, caméra derrière celui
  qui t’a abattu ; **R** pour revenir au direct.

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
| Messages rapides | **1 / 2 / 3 / 4** | **1 / 2 / 3 / 4** |
| Revoir l’action (une fois abattu) | **R** | **R** |

**Toutes les touches se changent** dans la fenêtre *Commandes* : clic sur une action puis sur la nouvelle touche (une
touche déjà prise est échangée, Échap annule, « Touches par défaut » remet tout). Les noms affichés sont ceux de ton
clavier.

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
- **vue de la caméra** : poursuite ou **cockpit** (tableau de bord propre à chaque avion, avec horizon artificiel) ;
- **qualité graphique** : *Auto* (choisie d’après la carte graphique), *Basse*, *Moyenne* ou *Haute* (voir ci-dessous).

---

## Graphismes

Style dessin animé : contours noirs d’épaisseur égale sur tous les jouets, halos autour des balles traçantes et des
explosions, traits de vitesse au turbo. Les pièces ont des rayons de soleil par les fenêtres (et la lucarne du grenier)
avec de la poussière qui flotte dedans, des coins plus sombres, du bois veiné, du carrelage émaillé et, au jardin, de
l’herbe qui ondule au vent et l’arroseur qui projette de vraies gouttes. Les avions abîmés fument de plus en plus,
perdent des morceaux et prennent feu ; leurs gouvernes bougent quand ils manœuvrent. Les explosions finissent en
confettis de plastique, et un avion qui frôle un mur fait des étincelles.

| Qualité | Pour qui | Ce qui change |
|---|---|---|
| **Basse** | rendu logiciel, très petites machines | pas d’ombres ni de contours sur les meubles, pas de rayons de soleil ni d’herbe, moins d’effets |
| **Moyenne** | puces intégrées (Intel, AMD) — choisie automatiquement sur ce genre de PC | ombres nettes peu coûteuses, 5 000 brins d’herbe, miroir en petite résolution |
| **Haute** | cartes graphiques dédiées, puces Apple | ombres douces et larges, image plus fine, relief du bois et du carrelage, 14 000 brins d’herbe |

*Auto* refait le choix à chaque ouverture ; un niveau choisi à la main est gardé. Le lissage des bords se décide au
lancement : il change au prochain chargement de la page.

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
| Caractéristiques des 6 avions (et des mouches / drones de la Survie) | [`shared/planes.ts`](shared/planes.ts) | vitesse, virage, points de vie, cadence, dégâts… |
| Niveaux des bots (`BOT_SKILL`) | [`server/bots.ts`](server/bots.ts) | Facile / Normal / Expert |
| Course et roi du ciel (`RACE_LAPS`, `KING_TARGET`, `KING_ZONE_PERIOD`…) | [`shared/objectives.ts`](shared/objectives.ts) | 2 tours, 30 s, zone qui bouge toutes les 30 s |
| Survie (`SURVIVAL_WAVES`, `MAX_ENEMIES`, `STING_DAMAGE`, `WAVE_TIME_LIMIT`…) | [`server/survival.ts`](server/survival.ts) | 8 vagues, 14 ennemis au plus, piqûre 9 PV, vague arrêtée après 75 s |
| Événements de pièce (fréquence, durées, coups de patte du chat) | [`shared/roomEvents.ts`](shared/roomEvents.ts) | un événement toutes les ~70 s, un coup de patte toutes les 1,6 s |
| Niveaux de qualité graphique (ombres, herbe, poussière, effets…) | [`src/settings/graphicsQuality.ts`](src/settings/graphicsQuality.ts) | Basse / Moyenne / Haute, détection de la carte graphique |
| Meubles qui bougent (mobile, petit train) | [`shared/maps/movers.ts`](shared/maps/movers.ts) + la pièce | vitesse, rayon, nombre de wagons, dégâts au choc |
| Pièces (obstacles, apparitions, bonus) | [`shared/maps/`](shared/maps) | un fichier par pièce, en « unités de conception » |

Après un changement, `npm test` vérifie notamment que les apparitions, les anneaux et les zones restent dégagés
(ni sous une arche, ni au-dessus d’un courant chaud), puis fait jouer des bots : ils doivent finir une course et
une manche de Roi du ciel dans chaque pièce. Les meubles qui bougent comptent : les anneaux et les zones évitent tout
leur trajet.

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
- **Ajouter une pièce** : une carte dans `shared/maps/` (obstacles, apparitions, bonus, courants d’air…, déclarée dans
  `shared/maps/index.ts` et le type `MapId`) et sa scène 3D dans `src/engine/maps/` (déclarée dans
  `SCENE_LOADERS`, `src/engine/sceneSetup.ts`) ; `src/engine/maps/sceneKit.ts` fournit les briques communes. Les
  tests vérifient automatiquement toute nouvelle pièce de `MAP_ORDER`.
- Image d’aperçu des liens partagés (Discord, WhatsApp…) : `public/og-image.png`, dessinée dans
  [`scripts/og-image.html`](scripts/og-image.html) (la commande pour la régénérer est en tête du fichier). Le serveur
  complète les adresses de l’aperçu avec l’adresse publique du site (`APP_URL` si elle est définie, sinon celle de Render).
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
