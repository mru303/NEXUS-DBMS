// Production build: bundles the app with esbuild, compiles Tailwind, and
// writes ONE self-contained dist/index.html (open it directly in a browser).
import * as esbuild from 'esbuild';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCss } from './css.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const t0 = Date.now();

const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.tsx')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  jsx: 'automatic',
  write: false,
  outdir: 'out',
  define: {
    'process.env.NODE_ENV': '"production"',
    __NEXUS_API_BASE_URL__: JSON.stringify(process.env.VITE_API_BASE_URL || ''),
  },
  legalComments: 'none',
  logLevel: 'warning',
});
const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
const rawCss = await buildCss();
const css = (await esbuild.transform(rawCss, { loader: 'css', minify: true })).code;

const template = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const html = template
  .replace('<!--CSS-->', () => `<style>${css}</style>`)
  .replace('<!--JS-->', () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`✓ dist/index.html (${kb} KB) built in ${Date.now() - t0} ms`);
