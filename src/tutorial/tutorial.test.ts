import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BINDINGS, rebind } from '../input/keyBindings';
import { TUTORIAL_STEPS, TUTORIAL_TARGET_PROP, freshMemory, observe, stepText, type TutorialProbe } from './tutorial';

const probe = (o: Partial<TutorialProbe> = {}): TutorialProbe => ({
  alive: true,
  aimX: 0,
  aimY: 0,
  throttle: 0,
  boosting: false,
  rolling: false,
  secondaryPowerUp: null,
  secondaryUses: 0,
  cockpit: false,
  destroyedProps: new Set(),
  ...o,
});

test('first flight: steering needs left, right, up and down', () => {
  const m = freshMemory();
  assert.equal(observe('steer', m, probe({ aimX: -0.8 }), 0.1), false);
  assert.equal(observe('steer', m, probe({ aimX: 0.8 }), 0.1), false);
  assert.equal(observe('steer', m, probe({ aimY: 0.9 }), 0.1), false);
  assert.equal(observe('steer', m, probe({ aimY: -0.2 }), 0.1), false, 'a small push does not count');
  assert.equal(observe('steer', m, probe({ aimY: -0.9 }), 0.1), true);
});

test('first flight: throttle both ways, one second of turbo, a barrel roll', () => {
  const m = freshMemory();
  observe('throttle', m, probe({ throttle: 1 }), 0.1);
  assert.equal(observe('throttle', m, probe({ throttle: -1 }), 0.1), true);
  const b = freshMemory();
  for (let i = 0; i < 9; i++) assert.equal(observe('boost', b, probe({ boosting: true }), 0.1), false);
  assert.equal(observe('boost', b, probe({ boosting: true }), 0.1), true, '1 s of turbo');
  const r = freshMemory();
  assert.equal(observe('roll', r, probe({ rolling: true }), 0.1), true);
});

test('first flight: break the piggy bank, pick an item up, use it', () => {
  assert.equal(observe('shoot', freshMemory(), probe(), 0.1), false);
  assert.equal(observe('shoot', freshMemory(), probe({ destroyedProps: new Set([TUTORIAL_TARGET_PROP]) }), 0.1), true);
  assert.equal(observe('pickup', freshMemory(), probe({ secondaryPowerUp: 'magnet', secondaryUses: 1 }), 0.1), true);
  // Multi-use item: one use less is enough
  const m = freshMemory();
  assert.equal(observe('use', m, probe({ secondaryPowerUp: 'rubber_missile', secondaryUses: 2 }), 0.1), false);
  assert.equal(observe('use', m, probe({ secondaryPowerUp: 'rubber_missile', secondaryUses: 1 }), 0.1), true);
  // Single-use item: gone
  const m2 = freshMemory();
  observe('use', m2, probe({ secondaryPowerUp: 'magnet', secondaryUses: 1 }), 0.1);
  assert.equal(observe('use', m2, probe(), 0.1), true);
});

test('first flight: cockpit view and back; nothing counts while the plane is down', () => {
  const m = freshMemory();
  assert.equal(observe('camera', m, probe({ cockpit: true }), 0.1), false);
  assert.equal(observe('camera', m, probe(), 0.1), true);
  const dead = freshMemory();
  assert.equal(observe('roll', dead, probe({ alive: false, rolling: true }), 0.1), false);
  assert.equal(TUTORIAL_STEPS.at(-1), 'done');
  assert.equal(observe('done', freshMemory(), probe(), 0.1), false, 'the last step waits for the pilot');
});

test('first flight: instructions show the pilot\x27s own keys', () => {
  const t = stepText('boost', 'mouse', DEFAULT_BINDINGS);
  assert.ok(t.text.includes('Maj gauche'), t.text);
  const custom = rebind(DEFAULT_BINDINGS, 'boost', 'KeyB');
  assert.ok(stepText('boost', 'mouse', custom).text.includes('B'));
  const steer = stepText('steer', 'keyboard', DEFAULT_BINDINGS).text;
  assert.ok(steer.includes('Q') && steer.includes('D') && !steer.includes('←'), `main keys only: ${steer}`);
  assert.ok(!stepText('steer', 'mouse', DEFAULT_BINDINGS).text.includes('{'), 'no placeholder left');
  for (const s of TUTORIAL_STEPS) assert.ok(!stepText(s, 'keyboard', DEFAULT_BINDINGS).text.includes('{'), s);
});
