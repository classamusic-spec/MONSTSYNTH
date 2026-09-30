import { useEffect, useState } from 'react';
import { MODE_CAPS, type ModeCaps } from '../../model/monsters';
import { useApp } from '../../store/store';

export function useCaps(): ModeCaps {
  const mode = useApp((s) => s.settings.ageMode);
  return MODE_CAPS[mode];
}

const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/** Parent setting wins; "system" follows the device's reduced-motion preference. */
export function useReducedMotion(): boolean {
  const pref = useApp((s) => s.settings.motion);
  const [system, setSystem] = useState(() => query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const on = () => setSystem(query.matches);
    query.addEventListener?.('change', on);
    return () => query.removeEventListener?.('change', on);
  }, []);
  return pref === 'reduce' || (pref === 'system' && system);
}

export function isReducedMotion(): boolean {
  const pref = useApp.getState().settings.motion;
  return pref === 'reduce' || (pref === 'system' && !!query?.matches);
}
