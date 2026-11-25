import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectedLabel } from '../../engine/engineTypes';
import { FR } from '../../i18n/fr';
import {
  LABEL_RANGE,
  ZONE_BAR_COLORS,
  escapeHtml,
  formatRaceTime,
  formatTimer,
  objectivePanelText,
  planeLabelsHtml,
  statusBadgesHtml,
} from './hudText';

test('HUD: round timer rounds up, race chrono keeps tenths', () => {
  assert.equal(formatTimer(240), '04:00');
  assert.equal(formatTimer(61.2), '01:02');
  assert.equal(formatTimer(0.2), '00:01', 'the last fraction of a second still shows');
  assert.equal(formatTimer(-3), '00:00');
  assert.equal(formatRaceTime(67.44), '1:07.4');
  assert.equal(formatRaceTime(9.96), '0:10.0');
  assert.equal(formatRaceTime(59.96), '1:00.0');
  assert.equal(formatRaceTime(125), '2:05.0');
});

test('HUD: pilot names cannot inject markup into the name tags', () => {
  assert.equal(escapeHtml('<b>"Zoé" & co</b>'), '&lt;b&gt;&quot;Zoé&quot; &amp; co&lt;/b&gt;');
  const label: ProjectedLabel = {
    id: 'x',
    nickname: '<img src=x onerror=alert(1)>',
    team: 'red',
    hpRatio: 0.5,
    screenX: 100,
    screenY: 100,
    inFront: true,
    onScreen: true,
    angle: 0,
    distance: 50,
    isTarget: false,
  };
  const html = planeLabelsHtml([label], 800, 600);
  assert.ok(!html.includes('<img'), 'tag escaped');
  assert.ok(html.includes('width:50%'), 'health bar at 50 %');
});

test('HUD: far or off-screen pilots get an edge arrow inside the screen instead of a name tag', () => {
  const base: ProjectedLabel = {
    id: 'x',
    nickname: 'Moustique',
    team: 'blue',
    hpRatio: 1,
    screenX: 0,
    screenY: 0,
    inFront: false,
    onScreen: false,
    angle: Math.PI, // toward the left
    distance: 100,
    isTarget: false,
  };
  const off = planeLabelsHtml([base], 800, 600);
  assert.ok(!off.includes('Moustique'), 'no name on the arrow');
  const left = Number(/left:(-?\d+)px/.exec(off)?.[1]);
  assert.ok(left > 0 && left < 400, `arrow on the left half, inside the screen (${left})`);
  const far = planeLabelsHtml([{ ...base, onScreen: true, inFront: true, distance: LABEL_RANGE + 1 }], 800, 600);
  assert.ok(!far.includes('Moustique'), 'too far: arrow only');
});

test('HUD: objective panel texts for the race and the king of the sky', () => {
  const race = objectivePanelText({
    kind: 'race',
    ringsPassed: 4,
    ringsTotal: 20,
    lap: 1,
    laps: 2,
    time: 33.25,
    finished: false,
    best: null,
    newRecord: false,
  });
  assert.equal(race.title, FR.objectives.raceTitle);
  assert.ok(race.main.includes('5 / 20'), race.main);
  assert.equal(race.sub, '0:33.3');
  assert.equal(race.barPct, 20);

  const done = objectivePanelText({
    kind: 'race',
    ringsPassed: 20,
    ringsTotal: 20,
    lap: 2,
    laps: 2,
    time: 70,
    finished: true,
    best: 65,
    newRecord: false,
  });
  assert.ok(done.main.includes('1:10.0'));
  assert.ok(done.sub.includes('1:05.0'), 'shows the record to beat');

  const king = objectivePanelText({
    kind: 'king',
    mine: 12.34,
    target: 30,
    leaderName: 'Trombone',
    leaderValue: 18.6,
    zoneState: 'mine_contested',
    movesIn: 4.2,
  });
  assert.ok(king.main.includes('12.3 / 30 s') && king.main.includes(FR.objectives.zone.mine_contested), king.main);
  assert.ok(king.sub.includes('Trombone (19 s)') && king.sub.endsWith('5 s'), king.sub);
  assert.equal(king.barColor, ZONE_BAR_COLORS.mine_contested);
});

test('HUD: status badges only for the effects in progress', () => {
  assert.equal(statusBadgesHtml({ shielded: false, turboActive: false, magnetActive: false, glued: false }), '');
  const two = statusBadgesHtml({ shielded: true, turboActive: false, magnetActive: false, glued: true });
  assert.ok(two.includes(FR.hud.shieldActive) && two.includes(FR.hud.gluedWarning));
  assert.ok(!two.includes(FR.hud.turboActive));
});
