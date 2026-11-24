# PROGRESS.md — Escadrille Jouet

## ➜ REPRENDRE ICI (24/11/2026 — grand chantier d'améliorations, priorité au jeu PC)
Sauvegarde locale : `npm run autosave` (instantané toutes les 2 min sur `refs/autosave/latest`,
restaurer avec `git checkout refs/autosave/latest -- .`). Commit + push à chaque étape.
Consigne : jeu PC d'abord (pas de priorité téléphone / tactile).

1. [x] Contrôles 100 % clavier (réglage « Clavier seul » : ZQSD diriger, ↑/↓ gaz) ; dans les deux modes
       Espace/Entrée tirer, Maj turbo, Ctrl objet spécial, A/E tonneaux ; LB/RB tonneaux à la manette ;
       aide à la visée légère ; réglages enregistrés ; confirmation avant de quitter la page en partie.
2. [ ] Caméra : poursuite un peu plus éloignée + vue cockpit avec tableau de bord propre à chaque avion (touche V).
3. [ ] Difficulté des bots, bulle de protection visible, titres de fin de match, lien d'invitation,
       écran « le serveur se réveille ».
4. [ ] Son : moteur propre à chaque avion + effet de passage, son spatialisé, sons tir absorbé / bouclier,
       musique procédurale + lecteur prêt pour des musiques externes (mp3/ogg).
5. [ ] Graphismes : traînées et balles visibles, accessoires qui éclatent, podium 3D, peintures/autocollants à débloquer.
6. [ ] Modes : course d'anneaux (jouable seul), roi du ciel.
7. [ ] Pièces : événements (chat, lumière, frigo), 4e pièce « Le grenier ».
8. [ ] Technique : chargement découpé (Three.js à part, cartes à la demande), données réseau compactes.
9. [ ] Salon unique.
10. [ ] Vérification finale.

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
