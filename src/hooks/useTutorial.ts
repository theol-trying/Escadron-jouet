import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { RoomState } from '../../shared/types';
import { soundEngine } from '../audio/soundEngine';
import type { ThreeGameEngine } from '../engine/ThreeGameEngine';
import { TUTORIAL_STEPS, TUTORIAL_TARGET_PROP, freshMemory, observe, type TutorialStepId } from '../tutorial/tutorial';

const DONE_KEY = 'ej_tutorial_done';
const SAMPLE_MS = 100;
/** Pause on « Bien joué ! » before the next step */
const NEXT_STEP_DELAY_MS = 900;

export function tutorialAlreadyDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * « Premier vol »: follows the guided steps while the room is in tutorial mode — samples what the
 * plane does, moves to the next step once it is done, points the screen marker at the prop to
 * shoot / the nearest item, and remembers on this device that the tutorial was completed.
 */
export function useTutorial(engineRef: MutableRefObject<ThreeGameEngine | null>, room: RoomState | null) {
  const active = room?.settings.mode === 'tutorial' && (room.phase === 'playing' || room.phase === 'countdown');
  const [stepIndex, setStepIndex] = useState(0);
  const [justDone, setJustDone] = useState(false);
  const [completed, setCompleted] = useState(tutorialAlreadyDone);
  const memoryRef = useRef(freshMemory());
  const step: TutorialStepId = TUTORIAL_STEPS[Math.min(stepIndex, TUTORIAL_STEPS.length - 1)];

  const goNext = useCallback(() => {
    memoryRef.current = freshMemory();
    setJustDone(false);
    setStepIndex((i) => Math.min(i + 1, TUTORIAL_STEPS.length - 1));
  }, []);

  // A new tutorial starts at the first step
  useEffect(() => {
    if (!active) {
      setStepIndex(0);
      setJustDone(false);
      memoryRef.current = freshMemory();
      engineRef.current?.setGuide(null);
    }
  }, [active, engineRef]);

  // Watch the plane
  useEffect(() => {
    if (!active || justDone || step === 'done') return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const probe = engineRef.current?.getTutorialProbe();
      const dt = (now - last) / 1000;
      last = now;
      if (!probe) return;
      if (observe(step, memoryRef.current, probe, dt)) {
        setJustDone(true);
        soundEngine.playPickup();
        window.setTimeout(goNext, NEXT_STEP_DELAY_MS);
      }
    }, SAMPLE_MS);
    return () => window.clearInterval(timer);
  }, [active, step, justDone, engineRef, goNext]);

  // Screen pointer toward what the step is about
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!active) return;
    engine.setGuide(step === 'shoot' ? { prop: TUTORIAL_TARGET_PROP } : step === 'pickup' ? { nearestPowerUp: true } : null);
  }, [active, step, engineRef]);

  // Last step reached: the tutorial counts as done on this device
  useEffect(() => {
    if (active && step === 'done' && !completed) {
      try {
        localStorage.setItem(DONE_KEY, '1');
      } catch {
        // storage unavailable
      }
      setCompleted(true);
      soundEngine.playVictoryFanfare();
    }
  }, [active, step, completed]);

  return {
    active,
    step,
    stepIndex,
    total: TUTORIAL_STEPS.length,
    justDone,
    completed,
    skip: goNext,
  };
}
