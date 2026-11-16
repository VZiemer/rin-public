import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectFile, auditRepository } from './publication-guard.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const check = (name, text, mode) => inspectFile(name, Buffer.from(text), mode);
test('blocks assets even renamed, forced into Git, or embedded in source', () => {
  assert.ok(check('android/avatar.png', 'image').length);
  assert.ok(check('backend/source.ts', '\x89PNG\0binary').length);
  assert.ok(check('docs/demo.md', ['data:image/png', ';base64,'].join('') + 'A'.repeat(200)).length);
  assert.ok(check('assets/catalog.json', '{}').length);
  assert.ok(check('android/app/src/main/res/drawable/avatar.xml', '<vector/>').length);
});
test('blocks sensitive configuration and credentials without logging values', () => {
  for (const file of ['.env', '.env.production', 'android/app/google-services.json', 'infra/prod.tfvars', 'infra/state.tfstate']) assert.ok(check(file, '{}').length);
  assert.ok(check('src/config.ts', 'AK' + 'IA' + 'A'.repeat(16)).length);
  assert.ok(check('docs/setup.md', ['person', 'mail-provider.com'].join('@')).length);
  assert.ok(check('src/link.ts', 'target', '120000').length);
});
test('permits technical code and clearly fictional examples', () => {
  assert.deepEqual(check('backend/src/example.ts', "const email = 'user@example.com';"), []);
  assert.deepEqual(check('backend/.env.example', 'MODEL_PROVIDER=static\n'), []);
  assert.deepEqual(check('android/app/src/main/res/values/strings.xml', '<resources/>'), []);
});
test('checks removed assets in old commits and staged content, not unstaged edits', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rin-guard-'));
  const git = (...args) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], {
    cwd: root,
    env: {...process.env, GIT_AUTHOR_NAME: 'Test', GIT_COMMITTER_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_EMAIL: 'test@example.com'},
    stdio: 'pipe',
  });
  try {
    git('init', '-b', 'main');
    fs.writeFileSync(path.join(root, 'image.png'), 'fixture');
    git('add', '.'); git('commit', '-m', 'Synthetic rejected media');
    git('rm', 'image.png');
    fs.writeFileSync(path.join(root, 'code.ts'), 'export const ok = true;');
    git('add', '.'); git('commit', '-m', 'Remove synthetic media');
    assert.equal(auditRepository(root).failures.length, 0);
    assert.ok(auditRepository(root, true).failures.some(f => f.startsWith('image.png:')));
    fs.writeFileSync(path.join(root, 'code.ts'), 'AK' + 'IA' + 'A'.repeat(16));
    git('add', 'code.ts');
    fs.writeFileSync(path.join(root, 'code.ts'), 'clean working copy');
    assert.ok(auditRepository(root).failures.some(f => f.includes('credential')));
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});
