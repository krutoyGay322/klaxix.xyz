// build.mjs — bundles src/roulette_app.jsx into js/roulette_app.js.
// React and esbuild are resolved from ./node_modules (run `npm install` in
// src/ first if node_modules is missing — see package.json).
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [path.join(__dirname, 'roulette_app.jsx')],
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ['chrome100', 'firefox100', 'safari15'],
  outfile: path.join(__dirname, '..', 'js', 'roulette_app.js'),
  jsx: 'automatic',
  format: 'iife',
});
console.log('Build complete: js/roulette_app.js');
