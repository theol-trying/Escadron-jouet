# CLAUDE.md — Escadrille Jouet

## Architecture Overview
- **Full-stack single-service app**: Express + Socket.io (`server.ts`) serves the React/Vite frontend and runs the authoritative 30 Hz game simulation (`server/roomManager.ts`, `server/gameLoop.ts`, `server/bots.ts`).
- **Shared deterministic core (`shared/`)**: Physics (`shared/flightPhysics.ts`), round/team rules (`shared/rules.ts`), plane archetypes (`shared/planes.ts`), power-ups (`shared/powerups.ts`), and 3D map colliders (`shared/maps/`). Used on both server (authority) and client (prediction).
- **3D Client (`src/engine/ThreeGameEngine.ts`)**: Procedural Three.js engine with zero external asset files; React handles menus, lobby, and HUD overlays (`src/components/`).
- **French UI**: All player-facing strings live in `src/i18n/fr.ts`.

## Key Commands
- `npm run dev` — Start Express + Socket.io + Vite middleware on port 3000.
- `npm run lint` — TypeScript strict check (`tsc --noEmit`).
- `npm test` — Run all `node:test` suites across `shared/` and `server/`.
- `npm run build` — Build client (`dist/`) and bundle server (`dist-server/server.js`).
- `npm start` — Run production server (`node dist-server/server.js --prod`).

## Conventions
- Never trust client `dt`, `cosmetics` mid-match, or unvalidated socket payloads.
- Always use `Object.hasOwn(...)` when indexing lookup maps with untrusted keys (`PLANE_ARCHETYPES`, `MAPS`, etc.).
- Keep `KeyboardEvent.code` for AZERTY/QWERTY physical key compatibility.
- **Scale tuning lives in `shared/constants.ts`**: `ARENA_SCALE` (room size) and `PLANE_SPEED_SCALE` (plane speeds).
  Maps are authored in *design units* (`DESK_MAP_DESIGN`…) and the gameplay exports (`DESK_MAP`, `MAPS`) are
  scaled by `scaleMapDefinition`; the 3D scene builders use the design data inside a group scaled by
  `ARENA_SCALE`. Any new room-related distance (heights, patrol points, vacuum…) must use `map.arenaScale`;
  plane-scale distances (combat ranges, hitboxes, pickup radius) must not.
- Commits: French messages, noreply identity `theol-trying`, privacy hooks via `core.hooksPath ~/.garde-git/hooks`
  (never `--no-verify`). Local autosave: `npm run autosave` (every 2 min on `refs/autosave/latest`).
