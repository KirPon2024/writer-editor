import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const rawArgs = process.argv.slice(2);
const outputArg = rawArgs.find((arg) => arg.startsWith('--output='));
const outputPath = outputArg ? outputArg.slice('--output='.length) : null;
const exclusionArgs = rawArgs.filter((arg) => !arg.startsWith('--output='));
if (exclusionArgs.length === 0) throw new Error('E_EXCLUSIONS_REQUIRED');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const emptyDigest = sha256(Buffer.alloc(0));
const normalizePath = (value) => value.normalize('NFC');
const pathIdentity = (value) => sha256(Buffer.from(`YALKEN_WORKTREE_PATH_ID_V2\0${normalizePath(value)}`, 'utf8'));
const branchIdentity = (value) => value === null ? null : sha256(Buffer.from(`YALKEN_WORKTREE_BRANCH_ID_V2\0${value.normalize('NFC')}`, 'utf8'));

function runGit(args) {
  const result = spawnSync('git', args, { encoding: null, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`E_GIT:${args.join(' ')}:${result.stderr?.toString('utf8') ?? ''}`);
  }
  return result.stdout;
}

const exclusions = exclusionArgs.map((arg) => {
  const split = arg.indexOf('=');
  if (split <= 0 || split === arg.length - 1) throw new Error(`E_EXCLUSION_FORMAT:${arg}`);
  return { role: arg.slice(0, split), path: normalizePath(arg.slice(split + 1)) };
});
if (new Set(exclusions.map((item) => item.role)).size !== exclusions.length) {
  throw new Error('E_DUPLICATE_EXCLUSION_ROLE');
}
if (new Set(exclusions.map((item) => item.path)).size !== exclusions.length) {
  throw new Error('E_DUPLICATE_EXCLUSION_PATH');
}

const raw = runGit(['worktree', 'list', '--porcelain', '-z']);
const fields = raw.toString('utf8').split('\0');
const worktrees = [];
let current;
for (const field of fields) {
  if (!field) continue;
  if (field.startsWith('worktree ')) {
    current = { path: normalizePath(field.slice('worktree '.length)) };
    worktrees.push(current);
    continue;
  }
  if (!current) throw new Error('E_WORKTREE_RECORD_ORDER');
  const space = field.indexOf(' ');
  const key = space === -1 ? field : field.slice(0, space);
  const value = space === -1 ? true : field.slice(space + 1);
  current[key] = value;
}

const byPath = new Map(worktrees.map((entry) => [entry.path, entry]));
for (const exclusion of exclusions) {
  if (!byPath.has(exclusion.path)) throw new Error(`E_EXCLUDED_WORKTREE_NOT_REGISTERED:${exclusion.role}`);
}

const excludedTaskWorktrees = exclusions
  .map((exclusion) => {
    const entry = byPath.get(exclusion.path);
    return {
      role: exclusion.role,
      pathIdentitySha256: pathIdentity(exclusion.path),
      head: entry.HEAD,
      detached: entry.detached === true,
      branchRefSha256: branchIdentity(typeof entry.branch === 'string' ? entry.branch : null)
    };
  })
  .sort((left, right) => left.role.localeCompare(right.role));

const excludedPaths = new Set(exclusions.map((item) => item.path));
const entries = worktrees
  .filter((entry) => !excludedPaths.has(entry.path))
  .map((entry) => {
    const present = fs.existsSync(entry.path);
    const status = present
      ? runGit(['-C', entry.path, 'status', '--porcelain=v1', '--untracked-files=all', '-z'])
      : Buffer.alloc(0);
    return {
      pathIdentitySha256: pathIdentity(entry.path),
      present,
      head: entry.HEAD,
      detached: entry.detached === true,
      branchRefSha256: branchIdentity(typeof entry.branch === 'string' ? entry.branch : null),
      locked: entry.locked === true || typeof entry.locked === 'string',
      prunable: entry.prunable === true || typeof entry.prunable === 'string',
      dirty: status.length > 0,
      statusByteLength: status.length,
      statusSha256: status.length > 0 ? sha256(status) : emptyDigest
    };
  })
  .sort((left, right) => left.pathIdentitySha256.localeCompare(right.pathIdentitySha256));

const protectedDirtySet = entries
  .filter((entry) => entry.dirty)
  .map((entry) => ({
    pathIdentitySha256: entry.pathIdentitySha256,
    head: entry.head,
    statusByteLength: entry.statusByteLength,
    statusSha256: entry.statusSha256
  }));

const payload = {
  schemaVersion: 'YALKEN_PROTECTED_WIP_SNAPSHOT_V2',
  algorithm: {
    id: 'YALKEN_PROTECTED_WIP_SNAPSHOT_ALGORITHM_V2',
    worktreeSource: 'GIT_WORKTREE_LIST_PORCELAIN_Z',
    dirtyStateSource: 'GIT_STATUS_PORCELAIN_V1_ALL_UNTRACKED_Z',
    pathNormalization: 'NFC',
    pathDisclosure: 'SHA256_DOMAIN_SEPARATED_IDENTITY_ONLY',
    branchDisclosure: 'SHA256_DOMAIN_SEPARATED_IDENTITY_ONLY',
    entryOrdering: 'PATH_IDENTITY_SHA256_ASCII_ASCENDING',
    canonicalization: 'UTF8_JSON_FIXED_KEY_ORDER_TRAILING_LF',
    hash: 'SHA256'
  },
  excludedTaskWorktrees,
  completeDenominator: entries.length,
  presentDenominator: entries.filter((entry) => entry.present).length,
  prunableDenominator: entries.filter((entry) => entry.prunable).length,
  dirtyDenominator: protectedDirtySet.length,
  protectedDirtySet,
  entries
};
const canonicalBytes = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8');
const result = { ...payload, snapshotSha256: sha256(canonicalBytes) };
const resultBytes = `${JSON.stringify(result)}\n`;
if (outputPath) fs.writeFileSync(outputPath, resultBytes, { encoding: 'utf8', mode: 0o600 });
process.stdout.write(resultBytes);
