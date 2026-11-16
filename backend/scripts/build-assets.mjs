import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';

for (const name of ['rin-assets', 'asset-upload', 'finance-import']) {
  await build({
    entryPoints: [`src/bootstrap/${name}.ts`],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: `dist/${name}.cjs`,
    sourcemap: true,
  });
  await writeFile(
    `dist/${name}.zip`,
    zipSync({
      [`${name}.cjs`]: [
        await readFile(`dist/${name}.cjs`),
        { mtime: new Date('2020-01-01T00:00:00Z') },
      ],
    }),
  );
}
