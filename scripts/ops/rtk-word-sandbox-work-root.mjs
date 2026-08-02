import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const WORD_CONTAINER_ID = 'com.microsoft.Word';
export const WORD_SANDBOX_TMP_SEGMENTS = Object.freeze([
  'Library',
  'Containers',
  WORD_CONTAINER_ID,
  'Data',
  'tmp',
  'YalkenWordLab',
]);
export const WORD_HOST_LOCAL_QA_SEGMENTS = Object.freeze([
  'Library',
  'Caches',
  'YalkenWordLab',
]);

function normalizeSegment(segment) {
  const text = typeof segment === 'string' ? segment.trim() : String(segment || '').trim();
  if (!text || text.includes('/') || text.includes('\\') || text === '.' || text === '..') {
    throw new Error(`WORD_SANDBOX_WORK_ROOT_BAD_SEGMENT:${text}`);
  }
  return text;
}

function userHome() {
  const home = process.env.HOME || os.homedir();
  if (!home || home === '/' || home === '/tmp') throw new Error('WORD_SANDBOX_HOME_UNAVAILABLE');
  return home;
}

export function defaultWordSandboxWorkRoot(...segments) {
  return path.join(userHome(), ...WORD_SANDBOX_TMP_SEGMENTS, ...segments.map(normalizeSegment));
}

export function resolveWordSandboxWorkRoot({ defaultSegments, overridePath } = {}) {
  const source = typeof overridePath === 'string' && overridePath.trim() ? 'override' : 'default';
  const selected = source === 'override'
    ? overridePath.trim()
    : defaultWordSandboxWorkRoot(...(defaultSegments || []));
  return assertWordSandboxWorkRoot(selected, { source });
}

export function resolveWordHostLocalQaWorkRoot({ defaultSegments } = {}) {
  const root = path.resolve(userHome(), ...WORD_HOST_LOCAL_QA_SEGMENTS, ...(defaultSegments || []).map(normalizeSegment));
  const allowedRoot = path.resolve(userHome(), ...WORD_HOST_LOCAL_QA_SEGMENTS);
  if (!(root === allowedRoot || root.startsWith(`${allowedRoot}${path.sep}`))) {
    throw new Error(`WORD_HOST_LOCAL_QA_ROOT_OUTSIDE_CACHE:${root}`);
  }
  fs.mkdirSync(root, { recursive: true });
  fs.accessSync(root, fs.constants.W_OK);
  const canonicalAllowedRoot = fs.realpathSync.native(allowedRoot);
  const canonical = fs.realpathSync.native(root);
  if (!(canonical === canonicalAllowedRoot || canonical.startsWith(`${canonicalAllowedRoot}${path.sep}`))) {
    throw new Error(`WORD_HOST_LOCAL_QA_ROOT_CANONICAL_OUTSIDE_CACHE:${canonical}`);
  }
  return {
    source: 'host-local-generated-qa-cache',
    root: canonical,
    containerId: '',
    insideWordContainer: false,
    hostLocalGeneratedQaCache: true,
    plainTmpForbidden: true,
    userDocumentsTouched: false,
    evidenceMirrorRequired: true,
    networkRequired: false,
  };
}

export function assertWordSandboxWorkRoot(workRoot, { source = 'default' } = {}) {
  const resolved = path.resolve(String(workRoot || ''));
  const containerTmp = path.resolve(userHome(), 'Library', 'Containers', WORD_CONTAINER_ID, 'Data', 'tmp');
  const legacyPlainTmp = path.resolve('/tmp', 'YalkenWordLab');
  if (resolved === legacyPlainTmp || resolved.startsWith(`${legacyPlainTmp}${path.sep}`)) {
    throw new Error('WORD_SANDBOX_WORK_ROOT_PLAIN_TMP_FORBIDDEN');
  }
  if (!(resolved === containerTmp || resolved.startsWith(`${containerTmp}${path.sep}`))) {
    throw new Error(`WORD_SANDBOX_WORK_ROOT_OUTSIDE_WORD_CONTAINER:${resolved}`);
  }
  fs.mkdirSync(resolved, { recursive: true });
  fs.accessSync(resolved, fs.constants.W_OK);
  const canonicalContainerTmp = fs.realpathSync.native(containerTmp);
  const canonical = fs.realpathSync.native(resolved);
  if (!(canonical === canonicalContainerTmp || canonical.startsWith(`${canonicalContainerTmp}${path.sep}`))) {
    throw new Error(`WORD_SANDBOX_WORK_ROOT_CANONICAL_OUTSIDE_WORD_CONTAINER:${canonical}`);
  }
  return {
    source,
    root: canonical,
    containerId: WORD_CONTAINER_ID,
    insideWordContainer: true,
    plainTmpForbidden: true,
    userDocumentsTouched: false,
    networkRequired: false,
  };
}
