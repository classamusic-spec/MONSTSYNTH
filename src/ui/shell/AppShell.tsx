import { useEffect } from 'react';
import { setOverlay } from '../../store/actions';
import { getState, labFace, useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { BlocksScreen } from '../blocks/BlocksScreen';
import { useReducedMotion } from '../hooks/useCaps';
import { LabScreen } from '../lab/LabScreen';
import { MagicPanel } from '../lab/MagicPanel';
import { MonsterTray } from '../lab/MonsterTray';
import { PaintScreen } from '../paint/PaintScreen';
import { ParentSpace } from '../parent/ParentSpace';
import { LearnScreen } from '../learn/LearnScreen';
import { SongsScreen } from '../songs/SongsScreen';
import { BubbleLayer } from './BubbleLayer';
import { Coach } from './Coach';
import { Finale } from './Finale';
import { NavDock } from './NavDock';
import { ParentGate } from './ParentGate';
import { RestTime } from './RestTime';
import { RotateHint } from './RotateHint';
import { Sky } from './Sky';
import { TransportRail } from './TransportRail';
import { WakeOverlay } from './WakeOverlay';

export function AppShell() {
  const screen = useApp((s) => s.screen);
  const mode = useApp((s) => s.settings.ageMode);
  const contrast = useApp((s) => s.settings.highContrast);
  const awake = useApp((s) => s.awake);
  const recording = useApp((s) => s.transport.recording || s.transport.armed);
  const overlay = useApp((s) => s.overlay);
  const face = useApp(labFace);
  const reduced = useReducedMotion();

  // Global shortcuts: Space play/stop · R record (not under the grid) · Z undo · Y / ⇧Z redo · Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = getState();
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (e.key === 'Escape' && s.overlay) {
        setOverlay(null);
        return;
      }
      // Lessons have their own buttons and keys.
      if (s.overlay || !s.awake || s.resting || s.screen === 'learn' || e.altKey || e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === ' ' && target?.tagName !== 'BUTTON') {
        e.preventDefault();
        studio.togglePlay();
      } else if (key === 'r' && !e.metaKey && !e.ctrlKey && s.screen === 'lab' && labFace(s) === 'keys') {
        studio.toggleRecord();
      } else if ((key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) || (key === 'y' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        studio.redo();
      } else if (key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        studio.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="app"
      data-screen={screen}
      data-mode={mode}
      data-awake={awake}
      data-rec={recording}
      data-labview={screen === 'lab' ? face : undefined}
      data-motion={reduced ? 'reduce' : 'full'}
      data-contrast={contrast ? 'high' : 'normal'}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Sky />
      <NavDock />
      <main className="screen" aria-live="off">
        {screen === 'lab' && <LabScreen />}
        {screen === 'blocks' && <BlocksScreen />}
        {screen === 'paint' && <PaintScreen />}
        {screen === 'songs' && <SongsScreen />}
        {screen === 'learn' && <LearnScreen />}
      </main>
      {screen !== 'songs' && screen !== 'learn' && <TransportRail />}
      <BubbleLayer />
      <Coach />
      <Finale />
      {overlay === 'tray' && <MonsterTray />}
      {overlay === 'magic' && <MagicPanel />}
      <RestTime />
      <ParentGate />
      {overlay === 'parent' && <ParentSpace />}
      <WakeOverlay />
      <RotateHint />
    </div>
  );
}
