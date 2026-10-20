// Bundles the Electron main process, preload script and render worker into apps/desktop/dist.
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const out = 'apps/desktop/dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const common = { bundle: true, platform: 'node', format: 'cjs', logLevel: 'info', legalComments: 'none', sourcemap: false };
await build({
  ...common,
  entryPoints: ['apps/desktop/electron/main.ts'],
  outfile: `${out}/main.cjs`,
  external: ['electron'],
  target: 'node22',
});
await build({
  ...common,
  entryPoints: ['apps/desktop/electron/preload.ts'],
  outfile: `${out}/preload.cjs`,
  external: ['electron'],
  target: 'node22',
});
await build({
  ...common,
  entryPoints: ['packages/render-adapter/src/worker.ts'],
  outfile: `${out}/render-worker.cjs`,
  external: ['playwright-core'],
  target: 'node22',
});
if (!existsSync('apps/web/dist/index.html')) throw new Error('Build the web app first: npm run build');
cpSync('apps/web/dist', `${out}/web`, { recursive: true });
console.log('Desktop bundle written to', out);
