import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const IGNORE = new Set(['node_modules', '.git', 'dist', 'out', 'build']);

const BLOCKED_PREFIXES = ['@tiptap-pro/', '@tiptap-cloud/'];
const BLOCKED_STRINGS = ['registry.tiptap.dev', 'TIPTAP_PRO_TOKEN'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (IGNORE.has(e.name)) continue;
      walk(path.join(dir, e.name), out);
    } else {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

function fail(msg) {
  console.error('\n❌ OSS policy violation:\n' + msg + '\n');
  process.exit(1);
}

function scanText(file, txt) {
  for (const s of BLOCKED_STRINGS) if (txt.includes(s)) fail(`Found "${s}" in ${file}`);
  for (const p of BLOCKED_PREFIXES) if (txt.includes(p)) fail(`Found "${p}" in ${file}`);
}

function scanPackageJson(file) {
  const raw = fs.readFileSync(file, 'utf8');
  scanText(file, raw);
  const json = JSON.parse(raw);

  const buckets = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
  for (const b of buckets) {
    const deps = json[b] || {};
    for (const name of Object.keys(deps)) {
      if (BLOCKED_PREFIXES.some((p) => name.startsWith(p))) {
        fail(`Forbidden dep ${name} in ${file}`);
      }
    }
  }
}

const files = walk(ROOT);
for (const f of files.filter((f) => path.basename(f) === 'package.json')) scanPackageJson(f);

for (const f of files.filter((f) =>
  ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', '.npmrc', '.yarnrc.yml'].includes(path.basename(f))
)) {
  scanText(f, fs.readFileSync(f, 'utf8'));
}

console.log('✅ OSS policy OK: no Tiptap Pro / no private registry');
