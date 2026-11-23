import type {
  GameModeId,
  MatchScoreEntry,
  PlayerLobbyInfo,
  PlaneSimState,
  TeamId,
} from './types';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateRoomCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function sanitizeNickname(raw: string): string {
  const cleaned = raw.replace(/[^\p{L}\p{N}_\-\s]/gu, '').trim().slice(0, 16);
  return cleaned.length >= 2 ? cleaned : 'Pilote';
}

export function assignBalancedTeam(players: Pick<PlayerLobbyInfo, 'team'>[]): TeamId {
  let redCount = 0;
  let blueCount = 0;
  for (const p of players) {
    if (p.team === 'red') redCount++;
    else if (p.team === 'blue') blueCount++;
  }
  return redCount <= blueCount ? 'red' : 'blue';
}

export function autoBalanceTeams<T extends { id: string; team: TeamId }>(players: T[]): void {
  let toggle = 0;
  for (const p of players) {
    p.team = toggle % 2 === 0 ? 'red' : 'blue';
    toggle++;
  }
}

export interface RoundCheckPlayer {
  id: string;
  nickname: string;
  team: TeamId;
  alive: boolean;
  lives: number;
}

export interface RoundOutcome {
  finished: boolean;
  winnerId: string | null;
  winnerTeam: TeamId;
  winnerName: string;
}

export function checkRoundWinner(
  mode: GameModeId,
  players: RoundCheckPlayer[],
  roundTimerRemaining: number
): RoundOutcome {
  const activeContenders = players.filter((p) => p.alive || p.lives > 0);

  if (mode === 'last_plane_ffa') {
    if (players.length > 1 && activeContenders.length <= 1) {
      const winner = activeContenders[0] ?? null;
      return {
        finished: true,
        winnerId: winner?.id ?? null,
        winnerTeam: 'none',
        winnerName: winner?.nickname ?? 'Égalité',
      };
    }
    if (roundTimerRemaining <= 0) {
      // Highest remaining lives/alive wins on timer tiebreak
      const sorted = [...players].sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        return b.lives - a.lives;
      });
      const top = sorted[0];
      return {
        finished: true,
        winnerId: top?.id ?? null,
        winnerTeam: 'none',
        winnerName: top?.nickname ?? 'Égalité',
      };
    }
    return { finished: false, winnerId: null, winnerTeam: 'none', winnerName: '' };
  }

  // last_plane_teams
  const redAlive = activeContenders.some((p) => p.team === 'red');
  const blueAlive = activeContenders.some((p) => p.team === 'blue');
  const hasRed = players.some((p) => p.team === 'red');
  const hasBlue = players.some((p) => p.team === 'blue');

  if (hasRed && hasBlue && (!redAlive || !blueAlive)) {
    const winningTeam: TeamId = redAlive ? 'red' : blueAlive ? 'blue' : 'none';
    return {
      finished: true,
      winnerId: null,
      winnerTeam: winningTeam,
      winnerName:
        winningTeam === 'red'
          ? 'Équipe Rouge'
          : winningTeam === 'blue'
            ? 'Équipe Bleue'
            : 'Égalité',
    };
  }

  if (roundTimerRemaining <= 0) {
    const redLives = players
      .filter((p) => p.team === 'red')
      .reduce((acc, p) => acc + p.lives + (p.alive ? 1 : 0), 0);
    const blueLives = players
      .filter((p) => p.team === 'blue')
      .reduce((acc, p) => acc + p.lives + (p.alive ? 1 : 0), 0);
    const winningTeam: TeamId =
      redLives > blueLives ? 'red' : blueLives > redLives ? 'blue' : 'none';
    return {
      finished: true,
      winnerId: null,
      winnerTeam: winningTeam,
      winnerName:
        winningTeam === 'red'
          ? 'Équipe Rouge'
          : winningTeam === 'blue'
            ? 'Équipe Bleue'
            : 'Égalité',
    };
  }

  return { finished: false, winnerId: null, winnerTeam: 'none', winnerName: '' };
}

export function canDamageTarget(
  mode: GameModeId,
  friendlyFire: boolean,
  attackerId: string,
  attackerTeam: TeamId,
  targetId: string,
  targetTeam: TeamId
): boolean {
  if (attackerId === targetId) return false;
  if (mode === 'last_plane_teams' && !friendlyFire && attackerTeam !== 'none' && attackerTeam === targetTeam) {
    return false;
  }
  return true;
}

export function applyDamageToSim(
  sim: PlaneSimState,
  damage: number
): { eliminated: boolean; lostRound: boolean } {
  if (!sim.alive || sim.invulnTimer > 0) {
    return { eliminated: false, lostRound: false };
  }
  sim.hp = Math.max(0, sim.hp - damage);
  sim.hitFlashTimer = 0.14;
  if (sim.hp > 0) {
    return { eliminated: false, lostRound: false };
  }
  sim.alive = false;
  sim.lives = Math.max(0, sim.lives - 1);
  if (sim.lives > 0) {
    sim.respawnTimer = 2.6;
    return { eliminated: true, lostRound: false };
  }
  sim.respawnTimer = 0;
  return { eliminated: true, lostRound: true };
}

export function isMatchOver(
  mode: GameModeId,
  roundNumber: number,
  maxRounds: number,
  teamRoundWins: { red: number; blue: number },
  scoreboard: Pick<MatchScoreEntry, 'roundWins'>[]
): boolean {
  const winsNeeded = Math.ceil(maxRounds / 2); // 2 for best of 3
  if (mode === 'last_plane_teams') {
    if (teamRoundWins.red >= winsNeeded || teamRoundWins.blue >= winsNeeded) {
      return true;
    }
  } else {
    if (scoreboard.some((entry) => entry.roundWins >= winsNeeded)) {
      return true;
    }
  }
  return roundNumber >= maxRounds;
}
