import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
for (const [entry, name, archive] of [
  ['src/index.ts', 'index', 'api'],
  ['src/bootstrap/scheduled-test-push.ts', 'test-push', 'test-push'],
  ['src/bootstrap/reminder-tick.ts', 'reminder-tick', 'reminder-tick'],
  ['src/bootstrap/proactive-tick.ts', 'proactive-tick', 'proactive-tick'],
  ['src/bootstrap/finance-import.ts', 'finance-import', 'finance-import'],
]) {
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: `dist/${name}.cjs`,
    sourcemap: true,
  });
  await writeFile(
    `dist/${archive}.zip`,
    zipSync({
      [`${name}.cjs`]: [
        await readFile(`dist/${name}.cjs`),
        { mtime: new Date('2020-01-01T00:00:00Z') },
      ],
    }),
  );
}
