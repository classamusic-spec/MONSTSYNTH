export function Logo({ tagline = true, size = 'l' }: { tagline?: boolean; size?: 'l' | 'm' }) {
  return (
    <div className={`logo logo-${size}`}>
      <div className="logo-word" role="img" aria-label="Monster Synth">
        <span className="logo-1" aria-hidden>
          MONSTER
        </span>
        <span className="logo-2" aria-hidden>
          SYNTH
        </span>
      </div>
      {tagline && <p className="logo-tag">Make Noise. Make Monsters. Make Music.</p>}
    </div>
  );
}
