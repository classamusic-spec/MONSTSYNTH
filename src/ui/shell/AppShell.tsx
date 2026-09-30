import { useEffect } from 'react';
import { setOverlay } from '../../store/actions';
import { getState, redo, undo, useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { BlocksScreen } from '../blocks/BlocksScreen';
import { useReducedMotion } from '../hooks/useCaps';
import { LabScreen } from '../lab/LabScreen';
import { MagicPanel } from '../lab/MagicPanel';
import { MonsterTray } from '../lab/MonsterTray';
import { PaintScreen } from '../paint/PaintScreen';
import { ParentSpace } from '../parent/ParentSpace';
import { SongsScreen } from '../songs/SongsScreen';
import { BubbleLayer } from './BubbleLayer';
import { Coach } from './Coach';
import { Finale } from './Finale';
import { NavDock } from './NavDock';
import { ParentGate } from './ParentGate';
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
  const reduced = useReducedMotion();

  // Global shortcuts: Space play/stop · R record · Z undo · Y / ⇧Z redo · Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = getState();
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (e.key === 'Escape' && s.overlay) {
        setOverlay(null);
        return;
      }
      if (s.overlay || !s.awake || e.altKey || e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === ' ' && target?.tagName !== 'BUTTON') {
        e.preventDefault();
        studio.togglePlay();
      } else if (key === 'r' && !e.metaKey && !e.ctrlKey && s.screen === 'lab') {
        studio.toggleRecord();
      } else if ((key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) || (key === 'y' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        redo();
      } else if (key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        undo();
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
      </main>
      {screen !== 'songs' && <TransportRail />}
      <BubbleLayer />
      <Coach />
      <Finale />
      {overlay === 'tray' && <MonsterTray />}
      {overlay === 'magic' && <MagicPanel />}
      <ParentGate />
      {overlay === 'parent' && <ParentSpace />}
      <WakeOverlay />
      <RotateHint />
    </div>
  );
}
