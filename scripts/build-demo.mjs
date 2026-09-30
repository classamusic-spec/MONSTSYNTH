// Build the embeddable single-file web demo: one HTML fragment with all CSS, JS
// and fonts inlined (no <html>/<head>/<body>; the host adds the document shell).
// Usage: node scripts/build-demo.mjs [outFile]
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const out = process.argv[2] || 'dist-demo/monster-synth.html';
execSync('npx vite build', { stdio: 'inherit', env: { ...process.env, VITE_DEMO: '1' } });
const dir = 'dist-demo/assets';
const files = readdirSync(dir);
const js = files.filter((f) => f.endsWith('.js'));
const css = files.filter((f) => f.endsWith('.css'));
if (js.length !== 1) throw new Error(`expected one JS chunk, got ${js.join(', ')}`);
const script = readFileSync(join(dir, js[0]), 'utf8').replace(/<\/script/gi, '<\\/script');
const style = css.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
const html = `<title>Monster Synth</title>
<meta name="theme-color" content="#141646">
<meta name="color-scheme" content="dark">
<style>${style}</style>
<div id="root"></div>
<script type="module">${script}</script>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`demo written: ${out} (${(html.length / 1024).toFixed(0)} KB)`);
