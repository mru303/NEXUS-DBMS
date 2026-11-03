// Compiles src/index.css with Tailwind CSS v4 (programmatic API).
// Candidate class names are collected by scanning every source file — the
// same idea Tailwind's own scanner uses; unknown tokens are simply ignored.
import { compile } from 'tailwindcss';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const twDir = path.dirname(require.resolve('tailwindcss/package.json'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?|html)$/.test(entry.name)) out.push(p);
  }
  return out;
}

export async function buildCss() {
  const input = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');
  const compiler = await compile(input, {
    base: path.join(root, 'src'),
    loadStylesheet: async (id, base) => {
      let file;
      if (id === 'tailwindcss') file = path.join(twDir, 'index.css');
      else if (id.startsWith('tailwindcss/')) file = path.join(twDir, id.slice('tailwindcss/'.length));
      else file = path.resolve(base, id);
      return { path: file, base: path.dirname(file), content: fs.readFileSync(file, 'utf8') };
    },
  });
  const candidates = new Set();
  const files = [...walk(path.join(root, 'src')), path.join(root, 'index.html')];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/[^<>"'`\s{}]+/g)) {
      const tok = m[0];
      candidates.add(tok);
      // also try without trailing punctuation from code, e.g. "h-9!)," or "text-ink;"
      candidates.add(tok.replace(/[),;:.]+$/, ''));
    }
  }
  return compiler.build([...candidates]);
}
