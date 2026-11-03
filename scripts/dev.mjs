// Development server with live reload: http://localhost:5173
import * as esbuild from 'esbuild';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCss } from './css.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, '.dev');
fs.mkdirSync(outdir, { recursive: true });

const template = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
fs.writeFileSync(
  path.join(outdir, 'index.html'),
  template
    .replace('<!--CSS-->', '<link rel="stylesheet" href="/app.css">')
    .replace(
      '<!--JS-->',
      `<script type="module" src="/main.js"></script>
<script>new EventSource('/esbuild').addEventListener('change', () => location.reload());</script>`,
    ),
);

const cssPlugin = {
  name: 'tailwind',
  setup(build) {
    build.onEnd(async (r) => {
      if (r.errors.length) return;
      try {
        fs.writeFileSync(path.join(outdir, 'app.css'), await buildCss());
      } catch (e) {
        console.error('Tailwind error:', e.message);
      }
    });
  },
};

const ctx = await esbuild.context({
  entryPoints: [path.join(root, 'src/main.tsx')],
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  sourcemap: true,
  outdir,
  define: {
    'process.env.NODE_ENV': '"development"',
    __NEXUS_API_BASE_URL__: JSON.stringify(process.env.VITE_API_BASE_URL || ''),
  },
  plugins: [cssPlugin],
  logLevel: 'info',
});
await ctx.watch();
const port = Number(process.env.VITE_PORT) || 5173;
await ctx.serve({ servedir: outdir, port });
console.log(`\n  NEXUS dev server running at  http://localhost:${port}\n`);
