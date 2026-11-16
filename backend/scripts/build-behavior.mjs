import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';

await build({
  entryPoints: ['src/bootstrap/behavior-feedback.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'dist/behavior-feedback.cjs',
  sourcemap: true,
});
await writeFile(
  'dist/behavior-feedback.zip',
  zipSync({
    'behavior-feedback.cjs': [
      await readFile('dist/behavior-feedback.cjs'),
      { mtime: new Date('2020-01-01T00:00:00Z') },
    ],
  }),
);
