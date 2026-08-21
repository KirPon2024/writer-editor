// R2.4 SEC0_PATH_CAPABILITY — capability-rooted canonical paths.
// Containment is decided on canonical real paths, never lexical prefixes;
// a symlink component is refused (no-follow); case and Unicode aliases are
// typed ambiguities; identity drift between checks is typed TOCTOU.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

class PathCapabilityError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/u;
const WINDOWS_DRIVE_ABS_RE = /^[a-zA-Z]:\//u;
const RESERVED_BASENAMES = new Set(['CON', 'PRN', 'AUX', 'NUL', 'CLOCK$']);
const RESERVED_DEVICE_RE = /^(COM[1-9]|LPT[1-9])$/i;

function hasForbiddenPlatformForm(candidate) {
  const segments = candidate.split('/').filter((segment) => segment.length > 0);
  return segments.some((segment) => {
    if (segment !== segment.trimEnd() || segment.endsWith('.')) return true;
    const stem = segment.split('.')[0].toUpperCase();
    return RESERVED_BASENAMES.has(stem) || RESERVED_DEVICE_RE.test(stem);
  });
}

const realpathOrResolve = (target) => {
  try {
    return fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
};

function canonicalizeCapabilityRoot(root) {
  if (typeof root !== 'string' || root.trim() === '') throw new PathCapabilityError('E_CAP_ROOT_INVALID');
  const resolved = path.resolve(root);
  const canonical = realpathOrResolve(resolved);
  if (!fs.existsSync(canonical)) throw new PathCapabilityError('E_CAP_ROOT_MISSING', root);
  return canonical;
}

const isInsideResolved = (parentReal, childReal) => {
  const relative = path.relative(parentReal, childReal);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

function deepestExistingAncestor(resolvedPath) {
  let probe = resolvedPath;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  return probe;
}

// The no-follow walk: every existing component of the spelled candidate path
// from the filesystem root down to the candidate must be a real directory
// entry, never a symlink hop. Missing suffix components are skipped until
// they exist; nothing is silently followed.
function assertNoFollowComponents(candidatePath) {
  const resolved = path.resolve(candidatePath);
  const segments = resolved.split(path.sep).filter((segment) => segment.length > 0);
  let cursor = path.parse(resolved).root;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    let stat;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      if (error && error.code === 'ENOENT') break;
      throw new PathCapabilityError('E_CAP_COMPONENT_UNREADABLE', `${cursor}: ${error.message}`);
    }
    if (stat.isSymbolicLink()) {
      throw new PathCapabilityError('E_CAP_NOFOLLOW_SYMLINK', cursor);
    }
  }
  return deepestExistingAncestor(resolved);
}

function resolveWithinCapabilityRoots(candidate, roots, { noFollow = true } = {}) {
  if (typeof candidate !== 'string' || candidate.trim() === '') return { ok: false, reason: 'E_CAP_CANDIDATE_SHAPE' };
  if (CONTROL_CHAR_RE.test(candidate)) return { ok: false, reason: 'E_CAP_CONTROL_CHAR' };
  const normalizedInput = candidate.replaceAll('\\', '/');
  if (normalizedInput.split('/').some((segment) => segment === '..') && !WINDOWS_DRIVE_ABS_RE.test(normalizedInput)) {
    return { ok: false, reason: 'E_CAP_TRAVERSAL' };
  }
  if (hasForbiddenPlatformForm(normalizedInput)) return { ok: false, reason: 'E_CAP_PLATFORM_FORM' };
  if (!Array.isArray(roots) || roots.length === 0) return { ok: false, reason: 'E_CAP_ROOTS_EMPTY' };

  let canonicalRoots;
  try {
    canonicalRoots = roots.map(canonicalizeCapabilityRoot);
  } catch (error) {
    return { ok: false, reason: error.code || 'E_CAP_ROOT_INVALID' };
  }

  const resolved = path.resolve(candidate);
  if (noFollow) {
    try {
      assertNoFollowComponents(resolved);
    } catch (error) {
      return { ok: false, reason: error.code || 'E_CAP_NOFOLLOW', detail: error.message };
    }
  }

  const probe = deepestExistingAncestor(resolved);
  const probeReal = realpathOrResolve(probe);
  const suffix = path.relative(probe, resolved);
  const candidateReal = suffix ? path.join(probeReal, suffix) : probeReal;

  for (const rootReal of canonicalRoots) {
    if (isInsideResolved(rootReal, candidateReal)) {
      return { ok: true, canonicalPath: candidateReal, root: rootReal };
    }
  }
  return { ok: false, reason: 'E_CAP_ESCAPE', detail: candidateReal };
}

const foldForAlias = (name) => name.normalize('NFC').toLowerCase();

// Alias law for existing targets and for new spellings that would collide
// with an existing sibling: multiple directory entries matching the basename
// case-insensitively or via Unicode normalization are a typed ambiguity; a
// single entry with different spelling is a typed mismatch. The check is
// volume-independent: on a case-sensitive volume a wrong-case spelling does
// not resolve, yet it is still refused so projects stay portable to
// case-insensitive volumes. The directory read is injectable so the
// ambiguity branch is provable on deduplicating filesystems too.
function assertAliasSafe(candidatePath, { readDirFn = null } = {}) {
  const resolved = path.resolve(candidatePath);
  const parent = path.dirname(resolved);
  const base = path.basename(resolved);
  const baseFold = foldForAlias(base);
  let entries;
  try {
    entries = typeof readDirFn === 'function' ? readDirFn(parent) : fs.readdirSync(parent);
  } catch (error) {
    if (error && error.code === 'ENOENT') return { ok: true, reason: '' };
    throw new PathCapabilityError('E_CAP_PARENT_UNREADABLE', `${parent}: ${error.message}`);
  }
  if (!Array.isArray(entries)) throw new PathCapabilityError('E_CAP_PARENT_LISTING_INVALID', parent);
  const matches = entries.filter((entry) => foldForAlias(entry) === baseFold);
  if (matches.length > 1) {
    throw new PathCapabilityError('E_CAP_ALIAS_AMBIGUOUS', `${base}: ${matches.join(',')}`);
  }
  if (matches.length === 1 && matches[0] !== base) {
    throw new PathCapabilityError('E_CAP_CASE_MISMATCH', `${base} vs ${matches[0]}`);
  }
  return { ok: true, reason: '' };
}

// TOCTOU law: identity (dev, ino, size, mtimeNs, ctimeNs) must not change
// between two probes around the effect. Inode reuse after unlink must not
// make a replacement invisible, so dev+ino alone is never sufficient. Any
// drift is typed, never silently accepted.
function withStableIdentity(targetPath, effect) {
  if (typeof effect !== 'function') throw new PathCapabilityError('E_CAP_EFFECT_REQUIRED');
  const before = fs.lstatSync(targetPath, { bigint: true });
  const identity = (s) => `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
  const result = effect();
  const after = fs.lstatSync(targetPath, { bigint: true });
  if (identity(before) !== identity(after)) {
    throw new PathCapabilityError('E_CAP_TOCTOU_DRIFT', `${targetPath}: ${identity(before)} -> ${identity(after)}`);
  }
  return result;
}

module.exports = Object.freeze({
  PathCapabilityError,
  assertAliasSafe,
  assertNoFollowComponents,
  canonicalizeCapabilityRoot,
  deepestExistingAncestor,
  isInsideResolved,
  resolveWithinCapabilityRoots,
  withStableIdentity,
});
