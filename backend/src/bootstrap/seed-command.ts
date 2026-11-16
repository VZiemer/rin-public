import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { contextRepositories } from './repositories.js';
import { parseSeed } from '../adapters/outbound/seed/parser.js';
import { seedContext } from '../adapters/outbound/seed/seed.js';
import { parseUserId } from '../domain/model/user-id.js';
const config = loadConfig();
if (config.environment !== 'dev') throw new Error('Seed command is dev-only');
const seedUserId = parseUserId(config.internalUserId);
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--overwrite')) throw new Error('Supported option: --overwrite');
const names = [
  'persona/personality.md',
  'persona/behavior-rules.md',
  'persona/relationship.md',
  'persona/yui-relationship.md',
  'assistants/rin.md',
  'assistants/yui.md',
  'user-context/profile.md',
  'user-context/routine.md',
  'user-context/relationships.md',
];
const files = Object.fromEntries(
  await Promise.all(
    names.map(async (name) => [name, await readFile(resolve('seed', name), 'utf8')]),
  ),
);
const bundle = parseSeed(files, seedUserId, new Date().toISOString());
console.info(
  await seedContext(
    bundle,
    contextRepositories(),
    args.includes('--overwrite') ? 'overwrite' : 'insert-missing',
  ),
);
