import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LAG_COMPENSATION_MS,
  REMOTE_INTERP_DELAY_MS,
  computeLagCompensationMs,
} from './constants';
import {
  applyDamageToSim,
  assignBalancedTeam,
  canDamageTarget,
  checkRoundWinner,
  computeMatchTitles,
  ensureBothTeams,
  generateRoomCode,
  isMatchOver,
  pickBotToRemoveForBalance,
  rebalanceBotTeams,
  sanitizeNickname,
} from './rules';
import type { PlaneSimState, TeamId } from './types';

test('computeLagCompensationMs adds ping/2 and client interpolation delay capped at 250ms', () => {
  assert.equal(REMOTE_INTERP_DELAY_MS, 95);
  assert.equal(MAX_LAG_COMPENSATION_MS, 250);
  assert.equal(computeLagCompensationMs(0), 95);
  assert.equal(computeLagCompensationMs(80), 135);
  assert.equal(computeLagCompensationMs(400), 250);
});

test('generateRoomCode returns 5 uppercase letters', () => {
  const code = generateRoomCode();
  assert.match(code, /^[A-Z]{5}$/);
});

test('sanitizeNickname enforces clean readable names and handles non-strings', () => {
  assert.equal(sanitizeNickname('  As du Ciel!  '), 'As du Ciel');
  assert.equal(sanitizeNickname(''), 'Pilote');
  assert.equal(sanitizeNickname(12345), 'Pilote');
  assert.equal(sanitizeNickname(null), 'Pilote');
});

test('assignBalancedTeam keeps red and blue balanced', () => {
  assert.equal(assignBalancedTeam([{ team: 'red' }, { team: 'red' }, { team: 'blue' }]), 'blue');
  assert.equal(assignBalancedTeam([{ team: 'red' }, { team: 'blue' }]), 'red');
});

test('pickBotToRemoveForBalance removes bots from oversized team first and rebalanceBotTeams evens teams', () => {
  const players = [
    { id: 'h1', isBot: false, team: 'red' as const },
    { id: 'h2', isBot: false, team: 'red' as const },
    { id: 'b1', isBot: true, team: 'red' as const },
    { id: 'b2', isBot: true, team: 'blue' as const },
  ];
  const removed = pickBotToRemoveForBalance(players, 'last_plane_teams');
  assert.equal(removed?.id, 'b1');

  const skewed: Array<{ isBot: boolean; team: TeamId }> = [
    { isBot: false, team: 'red' },
    { isBot: false, team: 'red' },
    { isBot: true, team: 'red' },
    { isBot: true, team: 'red' },
  ];
  rebalanceBotTeams(skewed);
  assert.equal(skewed.filter((p) => p.team === 'red').length, 2);
  assert.equal(skewed.filter((p) => p.team === 'blue').length, 2);
});

test('ensureBothTeams refills an emptied team with as few moves as possible, bots first', () => {
  const twoReds = [
    { id: 'a', isBot: false, team: 'red' as TeamId },
    { id: 'b', isBot: false, team: 'red' as TeamId },
  ];
  assert.equal(ensureBothTeams(twoReds), true);
  assert.deepEqual(twoReds.map((p) => p.team).sort(), ['blue', 'red']);

  const mixed = [
    { id: 'h1', isBot: false, team: 'blue' as TeamId },
    { id: 'h2', isBot: false, team: 'blue' as TeamId },
    { id: 'b1', isBot: true, team: 'blue' as TeamId },
  ];
  assert.equal(ensureBothTeams(mixed), true);
  assert.equal(mixed.find((p) => p.id === 'b1')?.team, 'red', 'the bot moves before any human');
  assert.equal(mixed.filter((p) => p.team === 'red').length, 1);

  const alreadyOk = [
    { id: 'r', isBot: false, team: 'red' as TeamId },
    { id: 'u', isBot: false, team: 'blue' as TeamId },
  ];
  assert.equal(ensureBothTeams(alreadyOk), true);
  assert.deepEqual(alreadyOk.map((p) => p.team), ['red', 'blue']);

  const alone = [{ id: 'solo', isBot: false, team: 'red' as TeamId }];
  assert.equal(ensureBothTeams(alone), false);
});

test('canDamageTarget blocks friendly fire in teams mode when disabled', () => {
  assert.equal(canDamageTarget('last_plane_teams', false, 'a', 'red', 'b', 'red'), false);
  assert.equal(canDamageTarget('last_plane_teams', true, 'a', 'red', 'b', 'red'), true);
  assert.equal(canDamageTarget('last_plane_teams', false, 'a', 'red', 'b', 'blue'), true);
  assert.equal(canDamageTarget('last_plane_ffa', false, 'a', 'none', 'b', 'none'), true);
});

test('checkRoundWinner detects last plane standing in FFA and Teams without instant win when one team started empty', () => {
  const ffaWin = checkRoundWinner(
    'last_plane_ffa',
    [
      { id: '1', nickname: 'Léo', team: 'none', alive: true, lives: 2 },
      { id: '2', nickname: 'Mia', team: 'none', alive: false, lives: 0 },
    ],
    180
  );
  assert.equal(ffaWin.finished, true);
  assert.equal(ffaWin.winnerId, '1');

  const teamWin = checkRoundWinner(
    'last_plane_teams',
    [
      { id: '1', nickname: 'A', team: 'red', alive: true, lives: 1 },
      { id: '2', nickname: 'B', team: 'red', alive: false, lives: 0 },
      { id: '3', nickname: 'C', team: 'blue', alive: false, lives: 0 },
    ],
    120
  );
  assert.equal(teamWin.finished, true);
  assert.equal(teamWin.winnerTeam, 'red');

  // 2 humans in red, 0 in blue -> must NOT finish immediately
  const allSameTeamNoInstantWin = checkRoundWinner(
    'last_plane_teams',
    [
      { id: '1', nickname: 'A', team: 'red', alive: true, lives: 3 },
      { id: '2', nickname: 'B', team: 'red', alive: true, lives: 3 },
    ],
    240
  );
  assert.equal(allSameTeamNoInstantWin.finished, false);

  // If both teams started the round and opposing team all left mid-round -> Red wins
  const opponentLeftWin = checkRoundWinner(
    'last_plane_teams',
    [{ id: '1', nickname: 'A', team: 'red', alive: true, lives: 3 }],
    200,
    0,
    { hadBothTeams: true }
  );
  assert.equal(opponentLeftWin.finished, true);
  assert.equal(opponentLeftWin.winnerTeam, 'red');
});

test('applyDamageToSim decrements lives and marks final elimination', () => {
  const sim = {
    hp: 20,
    alive: true,
    lives: 2,
    invulnTimer: 0,
    respawnTimer: 0,
    hitFlashTimer: 0,
    shieldTimer: 0,
    shieldHp: 0,
    secondaryPowerUp: null,
    secondaryUses: 0,
    turboTimer: 0,
    glueTimer: 0,
    magnetTimer: 0,
  } as PlaneSimState;

  const first = applyDamageToSim(sim, 25);
  assert.equal(first.eliminated, true);
  assert.equal(first.lostRound, false);
  assert.equal(first.shieldBlocked, false);
  assert.equal(sim.lives, 1);

  sim.alive = true;
  sim.hp = 10;
  const second = applyDamageToSim(sim, 20);
  assert.equal(second.eliminated, true);
  assert.equal(second.lostRound, true);
  assert.equal(sim.lives, 0);
});

test('bubble_shield absorbs normal damage until depleted while vacuum/OOB 9999 bypasses it', () => {
  const sim = {
    hp: 40,
    alive: true,
    lives: 3,
    invulnTimer: 0,
    respawnTimer: 0,
    hitFlashTimer: 0,
    shieldTimer: 6,
    shieldHp: 50,
    secondaryPowerUp: 'rubber_missile',
    secondaryUses: 2,
    turboTimer: 0,
    glueTimer: 0,
    magnetTimer: 0,
  } as PlaneSimState;

  const blocked = applyDamageToSim(sim, 30);
  assert.equal(blocked.shieldBlocked, true);
  assert.equal(blocked.eliminated, false);
  assert.equal(sim.hp, 40);
  assert.equal(sim.shieldHp, 20);

  const lethalVac = applyDamageToSim(sim, 9999);
  assert.equal(lethalVac.shieldBlocked, false);
  assert.equal(lethalVac.eliminated, true);
  assert.equal(sim.secondaryPowerUp, null);
  assert.equal(sim.secondaryUses, 0);
});

test('checkRoundWinner keeps match going during sudden death until 1 survivor or 65s cap', () => {
  const players = [
    { id: '1', nickname: 'Léo', team: 'none' as const, alive: true, lives: 2 },
    { id: '2', nickname: 'Mia', team: 'none' as const, alive: true, lives: 1 },
  ];
  assert.equal(checkRoundWinner('last_plane_ffa', players, 0, 10).finished, false);
  const capped = checkRoundWinner('last_plane_ffa', players, 0, 65);
  assert.equal(capped.finished, true);
  assert.equal(capped.winnerId, '1');
});

test('isMatchOver detects best of 3 victory', () => {
  assert.equal(isMatchOver('last_plane_teams', 2, 3, { red: 2, blue: 0 }, []), true);
  assert.equal(isMatchOver('last_plane_teams', 1, 3, { red: 1, blue: 0 }, []), false);
  assert.equal(isMatchOver('last_plane_ffa', 2, 3, { red: 0, blue: 0 }, [{ roundWins: 2 }]), true);
});

test('computeMatchTitles hands out fun titles to the right pilots and skips unearned ones', () => {
  const base = { deaths: 0, crashes: 0, pickups: 0, propsBroken: 0, score: 0, kills: 0 };
  const entries = [
    { ...base, playerId: 'a', nickname: 'Alice', kills: 5, deaths: 1, score: 600 },
    { ...base, playerId: 'b', nickname: 'Bruno', kills: 2, deaths: 4, crashes: 3, pickups: 1, score: 200 },
    { ...base, playerId: 'c', nickname: 'Chloé', kills: 2, deaths: 2, pickups: 4, propsBroken: 2, score: 250 },
  ];
  const byId = Object.fromEntries(computeMatchTitles(entries).map((t) => [t.id, t]));
  assert.equal(byId.ace?.nickname, 'Alice');
  assert.equal(byId.ace?.value, 5);
  assert.equal(byId.kamikaze?.nickname, 'Bruno');
  assert.equal(byId.collector?.nickname, 'Chloé');
  assert.equal(byId.wrecker?.nickname, 'Chloé');
  assert.equal(byId.survivor?.nickname, 'Alice');

  // Nobody crashed or broke anything: those titles are not awarded
  const calm = computeMatchTitles([
    { ...base, playerId: 'x', nickname: 'X', kills: 1, deaths: 1 },
    { ...base, playerId: 'y', nickname: 'Y', kills: 0, deaths: 1 },
  ]).map((t) => t.id);
  assert.ok(!calm.includes('kamikaze'));
  assert.ok(!calm.includes('wrecker'));
  assert.ok(calm.includes('ace'));
});
