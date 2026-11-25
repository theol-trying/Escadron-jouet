# PROGRESS.md — Escadrille Jouet

## ➜ REPRENDRE ICI (24/11/2026 — grand chantier d'améliorations, priorité au jeu PC)
Sauvegarde locale : `npm run autosave` (instantané toutes les 2 min sur `refs/autosave/latest`,
restaurer avec `git checkout refs/autosave/latest -- .`). Commit + push à chaque étape.
Consigne : jeu PC d'abord (pas de priorité téléphone / tactile).

1. [x] Contrôles 100 % clavier (réglage « Clavier seul » : ZQSD diriger, ↑/↓ gaz) ; dans les deux modes
       Espace/Entrée tirer, Maj turbo, Ctrl objet spécial, A/E tonneaux ; LB/RB tonneaux à la manette ;
       aide à la visée légère ; réglages enregistrés ; confirmation avant de quitter la page en partie.
2. [x] Caméra : poursuite plus éloignée (et bornée par la vraie taille de la pièce) + vue cockpit (touche V ou
       Paramètres) : œil du pilote propre à chaque avion, verrière masquée, tableau de bord à son style
       (jet numérique, biplan laiton et bois, planeur mousse, bombardier acier riveté) avec horizon artificiel.
3. [x] Niveau des bots (Facile / Normal / Expert, réglé par l'hôte), bulle dorée de protection d'apparition,
       titres de fin de match (As du jour, Kamikaze, Ramasse-tout, Démolisseur, Increvable), bouton « Inviter »
       (lien ?salon=CODE qui rejoint directement), bandeau « Le serveur se réveille… ».
4. [x] Son : moteur propre à chaque avion (jet, biplan à ressort, planeur, bombardier) + whoosh de passage,
       son 3D (tirs, touches, explosions, décors des autres), sons tir dévié / bouclier / ruban / bulle qui éclate,
       musique synthétisée (boîte à musique au menu, marche des jouets en vol, accélère en mort subite) +
       lecteur de musiques externes (src/audio/musicTracks.ts, fichiers dans public/music/), volume « Musique ».
5. [x] Graphismes : traînées d'ailes, balles traçantes fluides, accessoires qui éclatent en morceaux, podium 3D,
       peintures/autocollants à débloquer (3 nouvelles peintures, Cœur et Couronne ; src/progression.ts).
6. [x] Modes : Course d'anneaux (2 tours, sans tir, record par pièce sur l'appareil) et Roi du ciel (zone tenue seul,
       40 s, zone qui bouge toutes les 30 s) ; règles dans shared/objectives.ts, repères 3D et HUD dédiés.
7. [x] Pièces : événements (chat qui traverse, panne de courant, frigo capricieux ; shared/roomEvents.ts) et
       4e pièce « Le grenier » (shared/maps/attic.ts + src/engine/maps/buildAtticScene.ts).
8. [x] Technique : chargement découpé (interface 123 Ko compressés d'abord, 3D ensuite, pièces à la demande) et
       mises à jour réseau binaires (3,5 Ko → 0,8 Ko, -78 %) avec version de protocole.
9. [x] Salon unique : « Partie rapide » mène toujours au même salon public, même en cours de match (spectateur
       jusqu'à la manche suivante en mode élimination, en vol tout de suite en course / roi du ciel).
10. [x] Vérification finale (25/11) : 56/56 tests, build de production, sondes réseau (messages piégés, reconnexion,
        course, roi du ciel), navigateur (grenier + cockpit), 14 CI vertes, scan garde-fou propre.

11. [x] README en français (25/11) : modes, pièces, commandes, paramètres, ajout de musiques (avec retrait des
        métadonnées pour le garde-fou), tableau des réglages d’équilibrage, déblocages, mise en ligne.
12. [x] Audit (25/11) : 56/56 tests, 0 vulnérabilité, 0 erreur console, 5-8 ms de calcul par image.
13. [x] Corrections de l’audit (25/11) :
        - course : plus d’anneau collé à un obstacle ni au-dessus d’un courant chaud (cuisine : robinet,
          plaques) ; bots alignés sur l’axe de l’anneau → la cuisine se boucle en 65 s (bloquée avant) ;
        - Roi du ciel : zones en plein ciel, plein tarif seul / moitié pour le plus proche du centre si
          disputée, objectif 30 s, bots qui tournent dans la zone (duel gagné en 75-112 s) ;
        - motion et autoprefixer retirés, outils de construction en devDependencies, metadata.json supprimé ;
        - image d’aperçu des liens (public/og-image.png, source scripts/og-image.html), adresses absolues
          remplies par le serveur ; /assets en cache un an, index.html jamais en cache ;
        - 60 tests dont des manches complètes jouées par des bots dans chaque pièce ; PROTOCOL_VERSION 3.
        Reste noté : en fenêtre étroite (< 600 px), le panneau du Roi du ciel passe sous celui des vies
        (pas prioritaire, jeu PC d’abord).

14. [x] Améliorations techniques (25/11) : tests côté navigateur (visée, touches, souris, manette,
        réglages, instruments, prédiction, textes du HUD — 90 tests) ; son 3D HRTF réservé aux sons proches
        (8 à la fois) ; découpage : server/gameLoop.ts 1 459 → 121 lignes (étapes dans server/loop/, empreinte
        de 6 matchs simulés identique avant/après), moteur 3D 1 771 → 1 004, App.tsx 994 → 406 (hooks dans
        src/hooks/), HudOverlay 969 → 648 (src/components/hud/) ; chrono de course corrigé (« 0:010.0 ») ;
        Express 5.3 et lucide-react 1.70.

➜ Prochaines étapes : mise en ligne sur Render (Blueprint `render.yaml`, par l'utilisateur), essais à plusieurs,
  réglages éventuels (ARENA_SCALE / PLANE_SPEED_SCALE, niveaux des bots, objectifs KING_TARGET / RACE_LAPS).

### Chantier précédent (terminé) : correctifs d'audit + arènes ×1,4 / avions ×0,85
1. [x] Tir à la souris rétabli sur les PC à écran tactile (interface tactile seulement si le pointeur principal
       est un doigt, ou dès qu'on touche l'écran ; la souris la masque).
2. [x] Mode équipes : une équipe qui se vide en cours de match ne bloque plus la manche suivante
       (`ensureBothTeams` : on déplace le moins de pilotes possible, bots d'abord ; seul pilote → fin de match).
3. [x] Détails : commandes tactiles masquées en spectateur, tirs absorbés (protection d'apparition, bouclier,
       ruban) sans son ni secousse, favicon, config Vite sans `__dirname`, esbuild 0.28.2 (0 vulnérabilité).
4. [x] Arènes agrandies ×1,4 (700 × 518 au lieu de 500 × 370) et avions ralentis ×0,85 (croisière 58 au lieu de 68) :
       traversée ~11 s au lieu de ~6,7 s. Réglages dans `shared/constants.ts` (`ARENA_SCALE`, `PLANE_SPEED_SCALE`).
5. [x] Vérification complète : lint, 41/41 tests, build, CI GitHub verte, sondes réseau (21 messages piégés,
       reconnexion, anti-triche, équipes), navigateur bureau + format iPhone 13 (portrait), scan garde-fou propre.

➜ Mise en ligne sur Render (Blueprint `render.yaml`) : à faire par l'utilisateur.

## Completed Milestones
- **Milestone 1**: Core flight physics (`shared/flightPhysics.ts`), 3D desk arena (`Le bureau`), Socket.io room manager, client-side prediction & reconciliation.
- **Milestone 2**: 4 toy plane archetypes, paints & stickers, Hangar 3D preview, procedural Web Audio sound effects.
- **Milestone 3**: Destructible household props, 8 toy power-ups (`rubber_missile`, `water_bomb`, `firecracker`, `glue_mine`, `turbo_battery`, `bubble_shield`, `repair_tape`, `magnet`), Sudden Death vacuum cleaner, best-of-3 rounds, Teams mode & bots.
- **Milestone 4**: Additional arenas (`La cuisine` with hinged fridge door, stove updraft & blender hazard; `Le jardin` with spinning lawn sprinkler & sandbox).
- **Audit Hardening & Fixes**:
  - Aligned `esbuild` with Vite 8, generated `package-lock.json`, fixed Render `NODE_ENV=production` build, cross-platform `npm start`.
  - Hardened Socket.io payloads, CORS origin validation, per-socket rate limiting, `Object.hasOwn` lookups, and mid-match plane switch prevention.
  - Added client auto-rejoin on reconnect, lobby-to-engine cosmetics sync, real server-measured RTT lag compensation, glue mine TTL expiry, vacuum killfeed credit, team bot balancing, dt-budget anti-speed-cheat, and packet-loss input smoothing.
  - Optimized 20 Hz snapshot payload size and added server unit tests + CI workflow.
