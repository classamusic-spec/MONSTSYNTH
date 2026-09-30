import { useEffect } from 'react';
import { boot } from '../store/actions';
import { AppShell } from './shell/AppShell';
import { CrashScreen } from './shell/CrashScreen';

export function App() {
  useEffect(() => {
    void boot();
  }, []);
  return (
    <CrashScreen>
      <AppShell />
    </CrashScreen>
  );
}
