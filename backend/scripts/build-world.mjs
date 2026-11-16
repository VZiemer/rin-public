import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';

await build({
  entryPoints: ['src/bootstrap/world-refresh.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'dist/world-refresh.cjs',
  sourcemap: true,
});
await writeFile(
  'dist/world-refresh.zip',
  zipSync({
    'world-refresh.cjs': [
      await readFile('dist/world-refresh.cjs'),
      { mtime: new Date('2020-01-01T00:00:00Z') },
    ],
  }),
);
