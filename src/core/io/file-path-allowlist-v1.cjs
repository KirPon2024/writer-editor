'use strict';

// R2.4 K1 — file path admission policy in the product plane.
//
// The policy (which root classes may admit a file path, how candidates are
// canonicalized, and the fail-closed containment decision) is product truth
// and lives here. The main process keeps only the Electron source
// acquisition adapter (project root, documents path, userData path) and
// injects the concrete candidates. Containment itself is decided by the
// R2.4 SEC0 capability law on canonical real paths; this module adds no
// second containment truth.

const path = require('node:path');

const { resolveValidatedPath } = require('./path-boundary');
const { resolveWithinCapabilityRoots } = require('./path-capability-v1.cjs');

// A candidate that cannot be validated to an existing canonical path is
// refused by returning the empty string, never by guessing.
function resolveExistingPath(candidate) {
  const normalized = typeof candidate === 'string' ? candidate.trim() : '';
  if (!normalized) return '';
  try {
    return resolveValidatedPath(normalized, { mode: 'any' });
  } catch {
    return '';
  }
}

// Root sources arrive as concrete candidates from the main-process adapter;
// each is validated and resolved to absolute form, and invalid sources drop
// out. Canonical realpath containment is the SEC0 law's job at admission
// time, so alias-spelled roots cannot widen the boundary. An empty root set
// is a fail-closed admission state, not a permit-everything state.
function computeFilePathAllowlistRoots(sourceCandidates) {
  const roots = new Set();
  const candidates = Array.isArray(sourceCandidates) ? sourceCandidates : [];
  for (const candidate of candidates) {
    const resolved = resolveExistingPath(candidate);
    if (resolved) {
      roots.add(resolved);
    }
  }
  return [...roots];
}

// Lexical launch-boundary containment: child must resolve inside parent.
function isPathInsideLaunchBoundary(parentPath, childPath) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  const relative = path.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

// The admission decision: canonicalize the candidate, then decide
// containment on canonical real paths through the SEC0 capability law with
// the no-follow rule. No roots means no admission.
function isAllowedFilePathByLaw(candidatePath, allowlistRoots) {
  const resolvedPath = resolveExistingPath(candidatePath);
  if (!resolvedPath) return false;
  if (!Array.isArray(allowlistRoots) || allowlistRoots.length === 0) return false;
  return allowlistRoots.some((rootPath) => (
    resolveWithinCapabilityRoots(resolvedPath, [rootPath], { noFollow: true }).ok
  ));
}

module.exports = Object.freeze({
  resolveExistingPath,
  computeFilePathAllowlistRoots,
  isPathInsideLaunchBoundary,
  isAllowedFilePathByLaw,
});
