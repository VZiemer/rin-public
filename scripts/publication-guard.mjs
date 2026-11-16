import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const permitted = /\.(?:ts|kt|kts|mjs|json|md|xml|tf|hcl|properties|pro|yml|yaml|toml|example|bat)$/i;
const special = new Set(['.gitignore', '.gitattributes', '.prettierignore', '.prettierrc.json', 'gradlew', 'CODEOWNERS', 'pre-commit', 'pre-push']);
const privatePath = /(?:^|\/)(?:node_modules|build|dist|coverage|\.git|\.terraform|\.gradle|\.kotlin|\.idea|private|local-finance|captures|assets|generated-assets|drawable[^/]*|mipmap[^/]*|raw)(?:\/|$)|(?:google-services|firebase-adminsdk|service-account|accesskeys|tfstate|tfplan|local\.properties|fcm.token)/i;

export function inspectFile(name, data, mode = '100644') {
  const errors = [];
  const base = path.posix.basename(name);
  if (mode === '120000' || mode === '160000') errors.push('symlinks and submodules are forbidden');
  const assetSource = /^backend\/src\/(?:application|adapters\/outbound)\/assets\/[\w-]+\.ts$/.test(name);
  if ((privatePath.test(name) && !assetSource) || (/\.env(?:\.|$)/.test(base) && base !== '.env.example') || /\.tfvars$/.test(base)) errors.push('private or generated path');
  if (!permitted.test(name) && !special.has(base)) errors.push('unapproved file type (media and binaries are forbidden)');
  if (data.length > 1_500_000) errors.push('oversized file requires review');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { errors.push('non-text file'); return errors; }
  if (data.includes(0)) errors.push('binary content');
  if (/version https:\/\/git-lfs.github.com\/spec\/v1/.test(text)) errors.push('LFS pointers are forbidden');
  if (/data:(?:image|audio|video)\/[\w.+-]+;base64,|iVBORw0KGgo[A-Za-z0-9+/]{50}|\/9j\/[A-Za-z0-9+/]{100}/.test(text)) errors.push('embedded media');
  if (/(?:AKIA|ASIA)[A-Z0-9]{16}|AIza[\w-]{30,}|gh[pousr]_[\w]{20,}|github_pat_[\w]{20,}|sk-(?:proj-)?[\w-]{24,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) errors.push('credential pattern');
  if (/[A-Z]:[\\/](?:Users|projetos)[\\/]|\/Users\/[\w.-]+\/|\/home\/[\w.-]+\//i.test(text)) errors.push('personal machine path');
  for (const match of text.matchAll(/[\w.%+-]+@([\w.-]+\.[a-z]{2,})/gi)) {
    if (!/^(?:example\.(?:com|org|net|test)|.*\.(?:example|test|invalid)|users\.noreply\.github\.com)$/.test(match[1])) errors.push('non-example email address');
  }
  for (const match of text.matchAll(/arn:aws(?:-[\w-]+)?:[\w-]+:[\w-]*:(\d{12}):/g)) {
    if (!['000000000000', '123456789012'].includes(match[1])) errors.push('cloud account identifier');
  }
  if (/https?:\/\/[a-z0-9]{10}\.execute-api\.[a-z0-9-]+\.amazonaws\.com|https?:\/\/[a-z0-9]{10,}\.cloudfront\.net|https?:\/\/[\w-]+\.firebasestorage\.app/i.test(text)) errors.push('deployed service endpoint');
  return [...new Set(errors)];
}

export function auditRepository(root, history = false) {
  const git = (args, input) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root, input, maxBuffer: 128 * 1024 * 1024 });
  const failures = [];
  const seen = new Set();
  const versions = [];
  const inspectTree = ref => {
    const entries = git(ref ? ['ls-tree', '-rz', '--full-tree', ref] : ['ls-files', '-sz']).toString().split('\0').filter(Boolean);
    for (const entry of entries) {
      const [meta, name] = entry.split('\t');
      const parts = meta.split(' ');
      const mode = parts[0], hash = ref ? parts[2] : parts[1];
      const key = name + ':' + hash;
      if (seen.has(key)) continue;
      seen.add(key);
      if (mode === '160000') { failures.push(`${name}: submodule forbidden`); continue; }
      versions.push({name, hash, mode});
    }
  };
  inspectTree(null);
  if (history) for (const ref of git(['rev-list', '--all']).toString().trim().split('\n').filter(Boolean)) {
    inspectTree(ref);
    const metadata = git(['show', '-s', '--format=%an%n%ae%n%cn%n%ce%n%B', ref]);
    for (const error of inspectFile('commit.md', metadata)) failures.push(`commit ${ref.slice(0, 12)}: ${error}`);
  }
  // Batch object reads to keep full-history checks fast on Windows as well as CI.
  for (let start = 0; start < versions.length; start += 100) {
    const batch = versions.slice(start, start + 100);
    const output = git(['cat-file', '--batch'], batch.map(v => v.hash).join('\n') + '\n');
    let offset = 0;
    for (const {name, mode} of batch) {
      const end = output.indexOf(10, offset);
      const size = Number(output.subarray(offset, end).toString().split(' ')[2]);
      if (end < offset || !Number.isSafeInteger(size)) throw new Error('Invalid Git object response');
      const bytes = output.subarray(end + 1, end + 1 + size);
      for (const error of inspectFile(name, bytes, mode)) failures.push(`${name}: ${error}`);
      offset = end + size + 2;
    }
  }
  return { checked: seen.size, failures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = auditRepository(process.cwd(), process.argv.includes('--history'));
  // Never print source lines, matches, tokens, or personal data in CI logs.
  for (const failure of result.failures) console.error(failure);
  console.log(`Publication guard: ${result.checked} file versions checked; ${result.failures.length} violations.`);
  process.exitCode = result.failures.length ? 1 : 0;
}
