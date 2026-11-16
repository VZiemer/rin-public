import { expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}
test('architecture keeps AWS and adapters out of core and centralizes environment access', () => {
  for (const file of files('src').filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(file, 'utf8');
    if (/[/\\](domain|application)[/\\]/.test(file))
      expect(source, file).not.toMatch(
        /from\s+['"](?:@aws-sdk|firebase-admin|.*adapters\/|node:fs)/,
      );
    if (!file.endsWith(join('bootstrap', 'config.ts')))
      expect(source, file).not.toContain('process.env');
    if (!file.includes('seed')) expect(source, file).not.toMatch(/readFile.*seed\//);
  }
});
