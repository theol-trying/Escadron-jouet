# PROGRESS.md — Escadrille Jouet

## ➜ REPRENDRE ICI (24/11/2026 — chantier « correctifs + arènes plus grandes / avions plus lents »)
Sauvegarde locale : `npm run autosave` (instantané toutes les 2 min sur `refs/autosave/latest`,
restaurer avec `git checkout refs/autosave/latest -- .`). Commit + push à chaque étape.

1. [x] Tir à la souris rétabli sur les PC à écran tactile (interface tactile seulement si le pointeur principal
       est un doigt, ou dès qu'on touche l'écran ; la souris la masque).
2. [x] Mode équipes : une équipe qui se vide en cours de match ne bloque plus la manche suivante
       (`ensureBothTeams` : on déplace le moins de pilotes possible, bots d'abord ; seul pilote → fin de match).
3. [ ] Détails : commandes tactiles masquées en spectateur, retours de tir sur avion invulnérable, favicon, config Vite.
4. [ ] Arènes agrandies et avions ralentis (réglage demandé après essai : cartes trop petites, avions trop rapides).
5. [ ] Vérification complète (lint, tests, build, sondes réseau, navigateur bureau + mobile), puis propositions.

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
