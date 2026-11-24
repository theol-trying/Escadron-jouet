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

export function sanitizeNickname(raw: unknown): string {
  if (typeof raw !== 'string') return 'Pilote';
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

/**
 * Before a new Teams round: if a team became empty mid-match (someone left, bots off), move as
 * few pilots as possible — bots first — so both teams are populated again. Returns false when
 * that is impossible (fewer than 2 pilots left): the match must then end.
 */
export function ensureBothTeams<T extends { isBot: boolean; team: TeamId }>(players: T[]): boolean {
  const hasRed = players.some((p) => p.team === 'red');
  const hasBlue = players.some((p) => p.team === 'blue');
  if (hasRed && hasBlue) return true;
  if (players.length < 2) return false;

  const targetTeam: TeamId = hasRed ? 'blue' : 'red';
  const movable = players.filter((p) => p.team !== targetTeam);
  const toMove = Math.floor(players.length / 2);
  const ordered = [...movable.filter((p) => p.isBot).reverse(), ...movable.filter((p) => !p.isBot).reverse()];
  for (const p of ordered.slice(0, toMove)) {
    p.team = targetTeam;
  }
  // Any leftover unassigned pilot joins the other team
  const otherTeam: TeamId = targetTeam === 'red' ? 'blue' : 'red';
  for (const p of players) {
    if (p.team !== 'red' && p.team !== 'blue') p.team = otherTeam;
  }
  return true;
}

export function pickBotToRemoveForBalance<T extends { isBot: boolean; team: TeamId }>(
  players: T[],
  mode: GameModeId
): T | undefined {
  const bots = players.filter((p) => p.isBot);
  if (bots.length === 0) return undefined;
  if (mode !== 'last_plane_teams') return bots[bots.length - 1];

  let redCount = 0;
  let blueCount = 0;
  for (const p of players) {
    if (p.team === 'red') redCount++;
    else if (p.team === 'blue') blueCount++;
  }

  if (redCount > blueCount) {
    for (let i = bots.length - 1; i >= 0; i--) {
      if (bots[i].team === 'red') return bots[i];
    }
  } else if (blueCount > redCount) {
    for (let i = bots.length - 1; i >= 0; i--) {
      if (bots[i].team === 'blue') return bots[i];
    }
  }
  return bots[bots.length - 1];
}

export function rebalanceBotTeams<T extends { isBot: boolean; team: TeamId }>(players: T[]): void {
  let redCount = 0;
  let blueCount = 0;
  const bots: T[] = [];
  for (const p of players) {
    if (p.isBot) {
      bots.push(p);
    } else if (p.team === 'red') {
      redCount++;
    } else if (p.team === 'blue') {
      blueCount++;
    }
  }
  for (const bot of bots) {
    if (redCount <= blueCount) {
      bot.team = 'red';
      redCount++;
    } else {
      bot.team = 'blue';
      blueCount++;
    }
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
  roundTimerRemaining: number,
  suddenDeathElapsed = 0,
  options?: { hadBothTeams?: boolean }
): RoundOutcome {
  const activeContenders = players.filter((p) => p.alive || p.lives > 0);
  const suddenDeathTimedOut = roundTimerRemaining <= 0 && suddenDeathElapsed >= 65;

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
    if (suddenDeathTimedOut) {
      // Highest remaining lives/alive wins on sudden-death hard cap tiebreak
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
  const hadBothTeams =
    options?.hadBothTeams ??
    (players.some((p) => p.team === 'red') && players.some((p) => p.team === 'blue'));
  const redAlive = activeContenders.some((p) => p.team === 'red');
  const blueAlive = activeContenders.some((p) => p.team === 'blue');

  if ((players.length > 1 || options?.hadBothTeams === true) && hadBothTeams && (!redAlive || !blueAlive)) {
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

  if (suddenDeathTimedOut) {
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
): { eliminated: boolean; lostRound: boolean; shieldBlocked: boolean } {
  if (!sim.alive || sim.invulnTimer > 0) {
    return { eliminated: false, lostRound: false, shieldBlocked: false };
  }

  // Bubble shield absorbs incoming combat/crash damage (but not sudden-death vacuum or OOB 9999 kills)
  if (sim.shieldTimer > 0 && sim.shieldHp > 0 && damage < 9000) {
    sim.shieldHp = Math.max(0, sim.shieldHp - damage);
    sim.hitFlashTimer = 0.12;
    if (sim.shieldHp <= 0) {
      sim.shieldTimer = 0;
    }
    return { eliminated: false, lostRound: false, shieldBlocked: true };
  }

  sim.hp = Math.max(0, sim.hp - damage);
  sim.hitFlashTimer = 0.14;
  if (sim.hp > 0) {
    return { eliminated: false, lostRound: false, shieldBlocked: false };
  }
  sim.alive = false;
  sim.lives = Math.max(0, sim.lives - 1);
  sim.secondaryPowerUp = null;
  sim.secondaryUses = 0;
  sim.shieldTimer = 0;
  sim.shieldHp = 0;
  sim.turboTimer = 0;
  sim.glueTimer = 0;
  sim.magnetTimer = 0;
  if (sim.lives > 0) {
    sim.respawnTimer = 2.6;
    return { eliminated: true, lostRound: false, shieldBlocked: false };
  }
  sim.respawnTimer = 0;
  return { eliminated: true, lostRound: true, shieldBlocked: false };
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

export type MatchTitleId = 'ace' | 'kamikaze' | 'collector' | 'wrecker' | 'survivor';

export interface MatchTitle {
  id: MatchTitleId;
  playerId: string;
  nickname: string;
  value: number;
}

type TitleEntry = Pick<
  MatchScoreEntry,
  'playerId' | 'nickname' | 'kills' | 'deaths' | 'crashes' | 'pickups' | 'propsBroken' | 'score'
>;

/**
 * Fun end-of-match titles. Each goes to the best pilot for its stat (ties: higher score wins);
 * a title is skipped when nobody earned it (e.g. no kill at all → no "As du jour").
 */
export function computeMatchTitles(entries: TitleEntry[]): MatchTitle[] {
  const titles: MatchTitle[] = [];
  const pick = (
    id: MatchTitleId,
    stat: (e: TitleEntry) => number,
    opts: { lowest?: boolean; tieBreak?: (e: TitleEntry) => number } = {}
  ) => {
    const tieBreak = opts.tieBreak ?? ((x: TitleEntry) => x.score);
    let best: TitleEntry | null = null;
    for (const e of entries) {
      if (!best) {
        best = e;
        continue;
      }
      const a = stat(e);
      const b = stat(best);
      const better = opts.lowest ? a < b : a > b;
      if (better || (a === b && tieBreak(e) > tieBreak(best))) best = e;
    }
    if (!best) return;
    const value = stat(best);
    if (!opts.lowest && value <= 0) return;
    titles.push({ id, playerId: best.playerId, nickname: best.nickname, value });
  };

  pick('ace', (e) => e.kills);
  pick('kamikaze', (e) => e.crashes);
  pick('collector', (e) => e.pickups);
  pick('wrecker', (e) => e.propsBroken);
  if (entries.length >= 2) {
    pick('survivor', (e) => e.deaths, { lowest: true, tieBreak: (e) => e.kills * 1000 + e.score });
  }
  return titles;
}
