// Bundles the command-line renderer and the render worker into dist/ using esbuild.
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('dist/cli', { recursive: true });
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['playwright-core', 'electron'],
  logLevel: 'info',
  legalComments: 'none',
};
await build({
  ...common,
  entryPoints: ['packages/render-adapter/src/bin.ts'],
  outfile: 'dist/cli/frameforge-render.cjs',
  banner: { js: '#!/usr/bin/env node' },
});
await build({ ...common, entryPoints: ['packages/render-adapter/src/worker.ts'], outfile: 'dist/cli/render-worker.cjs' });
