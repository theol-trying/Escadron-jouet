import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDamageToSim,
  assignBalancedTeam,
  canDamageTarget,
  checkRoundWinner,
  generateRoomCode,
  isMatchOver,
  sanitizeNickname,
} from './rules';
import type { PlaneSimState } from './types';

test('generateRoomCode returns 5 uppercase letters', () => {
  const code = generateRoomCode();
  assert.match(code, /^[A-Z]{5}$/);
});

test('sanitizeNickname enforces clean readable names', () => {
  assert.equal(sanitizeNickname('  As du Ciel!  '), 'As du Ciel');
  assert.equal(sanitizeNickname(''), 'Pilote');
});

test('assignBalancedTeam keeps red and blue balanced', () => {
  assert.equal(assignBalancedTeam([{ team: 'red' }, { team: 'red' }, { team: 'blue' }]), 'blue');
  assert.equal(assignBalancedTeam([{ team: 'red' }, { team: 'blue' }]), 'red');
});

test('canDamageTarget blocks friendly fire in teams mode when disabled', () => {
  assert.equal(canDamageTarget('last_plane_teams', false, 'a', 'red', 'b', 'red'), false);
  assert.equal(canDamageTarget('last_plane_teams', true, 'a', 'red', 'b', 'red'), true);
  assert.equal(canDamageTarget('last_plane_teams', false, 'a', 'red', 'b', 'blue'), true);
  assert.equal(canDamageTarget('last_plane_ffa', false, 'a', 'none', 'b', 'none'), true);
});

test('checkRoundWinner detects last plane standing in FFA and Teams', () => {
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
});

test('applyDamageToSim decrements lives and marks final elimination', () => {
  const sim = {
    hp: 20,
    alive: true,
    lives: 2,
    invulnTimer: 0,
    respawnTimer: 0,
    hitFlashTimer: 0,
  } as PlaneSimState;

  const first = applyDamageToSim(sim, 25);
  assert.equal(first.eliminated, true);
  assert.equal(first.lostRound, false);
  assert.equal(sim.lives, 1);

  sim.alive = true;
  sim.hp = 10;
  const second = applyDamageToSim(sim, 20);
  assert.equal(second.eliminated, true);
  assert.equal(second.lostRound, true);
  assert.equal(sim.lives, 0);
});

test('isMatchOver detects best of 3 victory', () => {
  assert.equal(isMatchOver('last_plane_teams', 2, 3, { red: 2, blue: 0 }, []), true);
  assert.equal(isMatchOver('last_plane_teams', 1, 3, { red: 1, blue: 0 }, []), false);
  assert.equal(isMatchOver('last_plane_ffa', 2, 3, { red: 0, blue: 0 }, [{ roundWins: 2 }]), true);
});
