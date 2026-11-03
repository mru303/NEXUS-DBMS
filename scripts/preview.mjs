// Serves the production build (dist/) at http://localhost:4173
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'dist/index.html');
if (!fs.existsSync(file)) {
  console.error('Run "npm run build" first.');
  process.exit(1);
}
const port = Number(process.env.PORT) || 4173;
http
  .createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`\n  Preview: http://localhost:${port}\n`));
