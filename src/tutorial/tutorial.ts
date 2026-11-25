import type { PowerUpId } from '../../shared/types';
import type { BindableAction, KeyBindings } from '../input/keyBindings';
import { keysLabel, type LayoutMap } from '../input/keyLabels';
import type { ControlScheme } from '../settings/gameplaySettings';
import { FR } from '../i18n/fr';

/**
 * « Premier vol »: the guided first flight. Each step watches what the pilot does (read from the 3D
 * engine about 10 times a second) and moves on once it has been done. Pure logic, tested.
 */

export type TutorialStepId = 'steer' | 'throttle' | 'boost' | 'roll' | 'shoot' | 'pickup' | 'use' | 'camera' | 'done';

export const TUTORIAL_STEPS: TutorialStepId[] = ['steer', 'throttle', 'boost', 'roll', 'shoot', 'pickup', 'use', 'camera', 'done'];

/** The prop to shoot at in the desk (it drops an item when it breaks). */
export const TUTORIAL_TARGET_PROP = 'piggy_bank';

/** What the engine reports about our plane, each sample. */
export interface TutorialProbe {
  alive: boolean;
  aimX: number;
  aimY: number;
  throttle: number;
  /** Turbo actually burning (key held with fuel left, or a turbo battery) */
  boosting: boolean;
  rolling: boolean;
  secondaryPowerUp: PowerUpId | null;
  secondaryUses: number;
  cockpit: boolean;
  destroyedProps: ReadonlySet<string>;
}

/** What has been seen so far in the current step. */
export interface TutorialMemory {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  faster: boolean;
  slower: boolean;
  boostTime: number;
  rolled: boolean;
  usesAtPickup: number | null;
  itemAtPickup: PowerUpId | null;
  sawCockpit: boolean;
}

export function freshMemory(): TutorialMemory {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    faster: false,
    slower: false,
    boostTime: 0,
    rolled: false,
    usesAtPickup: null,
    itemAtPickup: null,
    sawCockpit: false,
  };
}

/**
 * Takes one sample into account; returns true when the step is done. `dt` is the time since the
 * previous sample (seconds).
 */
export function observe(step: TutorialStepId, m: TutorialMemory, p: TutorialProbe, dt: number): boolean {
  if (!p.alive) return false;
  switch (step) {
    case 'steer':
      if (p.aimX < -0.4) m.left = true;
      if (p.aimX > 0.4) m.right = true;
      if (p.aimY > 0.4) m.up = true;
      if (p.aimY < -0.4) m.down = true;
      return m.left && m.right && m.up && m.down;
    case 'throttle':
      if (p.throttle > 0.5) m.faster = true;
      if (p.throttle < -0.5) m.slower = true;
      return m.faster && m.slower;
    case 'boost':
      m.boostTime = p.boosting ? m.boostTime + dt : Math.max(0, m.boostTime - dt * 0.5);
      return m.boostTime >= 0.95; // about one second (samples are not exact)
    case 'roll':
      if (p.rolling) m.rolled = true;
      return m.rolled;
    case 'shoot':
      return p.destroyedProps.has(TUTORIAL_TARGET_PROP);
    case 'pickup':
      return p.secondaryPowerUp !== null && p.secondaryUses > 0;
    case 'use':
      if (m.itemAtPickup === null && p.secondaryPowerUp) {
        m.itemAtPickup = p.secondaryPowerUp;
        m.usesAtPickup = p.secondaryUses;
      }
      // Used: one use less, or the item gone (single-use items)
      return m.itemAtPickup !== null && (p.secondaryPowerUp === null || p.secondaryUses < (m.usesAtPickup ?? 0));
    case 'camera':
      if (p.cockpit) m.sawCockpit = true;
      return m.sawCockpit && !p.cockpit;
    case 'done':
      return false;
  }
}

/** Instruction text of a step, with the pilot's own main key for each action (named as on this keyboard). */
export function stepText(step: TutorialStepId, scheme: ControlScheme, bindings: KeyBindings, layout?: LayoutMap | null): {
  title: string;
  text: string;
} {
  const s = FR.tutorial.steps[step] as { title: string; text?: string; mouse?: string; keyboard?: string };
  const raw = s.text ?? (scheme === 'keyboard' ? s.keyboard : s.mouse) ?? '';
  const text = raw.replace(/\{(\w+)\}/g, (_, action: string) =>
    action in bindings ? keysLabel(bindings[action as BindableAction].slice(0, 1), layout) : `{${action}}`
  );
  return { title: s.title, text };
}
