import { Component, type ErrorInfo, type ReactNode } from 'react';
import { flushSave } from '../../store/persistence';
import { MonsterArt } from '../monsters/MonsterArt';

// If something unexpected breaks, a child sees a sleepy monster and one big
// button — never a blank page. Songs are autosaved, so a restart loses nothing.

interface State {
  broken: boolean;
}

export class CrashScreen extends Component<{ children: ReactNode }, State> {
  override state: State = { broken: false };

  static getDerivedStateFromError(): State {
    return { broken: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Monster Synth crashed', error, info.componentStack);
  }

  private restart = () => {
    void flushSave().finally(() => window.location.reload());
  };

  override render() {
    if (!this.state.broken) return this.props.children;
    return (
      <div className="crash" role="alertdialog" aria-labelledby="crash-title">
        <div className="crash-monster" aria-hidden>
          <MonsterArt kind="grumble" className="is-asleep" />
        </div>
        <h1 id="crash-title">Uh-oh! The monsters tripped.</h1>
        <button className="crash-btn" onClick={this.restart}>
          Wake them up again
        </button>
      </div>
    );
  }
}
