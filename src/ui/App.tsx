import { useEffect } from 'react';
import { boot } from '../store/actions';
import { AppShell } from './shell/AppShell';

export function App() {
  useEffect(() => {
    void boot();
  }, []);
  return <AppShell />;
}
