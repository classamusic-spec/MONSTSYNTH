import { useMemo } from 'react';
import { keyNames, type NoteName } from '../../magic/noteNames';
import type { NoteNameStyle, ScaleId } from '../../model/types';
import { useApp } from '../../store/store';

/** The grown-up's choice of names on the keys (letters, do re mi, or none). */
export function useNoteNameStyle(): NoteNameStyle {
  return useApp((s) => s.settings.noteNames);
}

/**
 * Names for keys 0..count-1 of the open song. They follow its key and mood
 * live, so picking another mood re-letters the keys straight away. Each value
 * is selected on its own (primitives keep the selectors stable).
 */
export function useKeyNames(count: number): { names: NoteName[]; style: NoteNameStyle; scale: ScaleId; songKey: number } {
  const style = useNoteNameStyle();
  const scale = useApp((s) => s.project.scale);
  const songKey = useApp((s) => s.project.key);
  const names = useMemo(() => keyNames(count, scale, songKey), [count, scale, songKey]);
  return { names, style, scale, songKey };
}
