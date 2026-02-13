#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'GOVERNANCE_APPROVAL_REGISTRY_VALID_OK';
const DEFAULT_APPROVALS_PATH = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';
const SCHEMA_VERSION = 'v1.0';
const SHA256_HEX_RE = /^[0-9a-f]{64}$/u;
const FAIL_REASON = 'E_GOVERNANCE_APPROVAL_INVALID';

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toIsoUtc(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toISOString();
}

export function normalizeRepoRelativePath(value) {
  const normalized = String(value || '').trim().replaceAll('\\', '/');
  if (!normalized) return '';
  if (path.isAbsolute(normalized)) return '';
  if (normalized.split('/').some((segment) => segment.length === 0 || segment === '..')) return '';
  return normalized;
}

function ensureInsideRoot(rootDir, relativePath) {
  const rootAbs = path.resolve(rootDir);
  const fileAbs = path.resolve(rootAbs, relativePath);
  const rel = path.relative(rootAbs, fileAbs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return '';
  return fileAbs;
}

export function hashRepoFileSha256(repoRoot, relativePath) {
  const normalizedPath = normalizeRepoRelativePath(relativePath);
  if (!normalizedPath) {
    return {
      ok: false,
      sha256: '',
      failDetail: 'PATH_INVALID',
    };
  }

  const fileAbsPath = ensureInsideRoot(repoRoot, normalizedPath);
  if (!fileAbsPath) {
    return {
      ok: false,
      sha256: '',
      failDetail: 'PATH_OUTSIDE_ROOT',
    };
  }
  if (!fs.existsSync(fileAbsPath)) {
    return {
      ok: false,
      sha256: '',
      failDetail: 'FILE_MISSING',
    };
  }

  let stat;
  try {
    stat = fs.statSync(fileAbsPath);
  } catch {
    return {
      ok: false,
      sha256: '',
      failDetail: 'FILE_STAT_ERROR',
    };
  }
  if (!stat.isFile()) {
    return {
      ok: false,
      sha256: '',
      failDetail: 'NOT_A_FILE',
    };
  }

  let data;
  try {
    data = fs.readFileSync(fileAbsPath);
  } catch {
    return {
      ok: false,
      sha256: '',
      failDetail: 'FILE_READ_ERROR',
    };
  }

  return {
    ok: true,
    sha256: createHash('sha256').update(data).digest('hex'),
    failDetail: '',
  };
}

function parseApprovalEntry(rawEntry, index, repoRoot, seenKeys) {
  if (!isObjectRecord(rawEntry)) {
    return {
      ok: false,
      failDetail: `APPROVAL_ITEM_${index}_INVALID`,
      entry: null,
    };
  }

  const filePath = normalizeRepoRelativePath(rawEntry.filePath);
  const sha256 = String(rawEntry.sha256 || '').trim().toLowerCase();
  const approvedBy = String(rawEntry.approvedBy || '').trim();
  const approvedAtUtc = toIsoUtc(rawEntry.approvedAtUtc);
  const rationale = String(rawEntry.rationale || '').trim();

  if (!filePath) {
    return {
      ok: false,
      failDetail: `APPROVAL_FILE_PATH_INVALID_${index}`,
      entry: null,
    };
  }
  if (!SHA256_HEX_RE.test(sha256)) {
    return {
      ok: false,
      failDetail: `APPROVAL_SHA256_INVALID_${index}`,
      entry: null,
    };
  }
  if (!approvedBy) {
    return {
      ok: false,
      failDetail: `APPROVAL_APPROVED_BY_INVALID_${index}`,
      entry: null,
    };
  }
  if (!approvedAtUtc) {
    return {
      ok: false,
      failDetail: `APPROVAL_APPROVED_AT_INVALID_${index}`,
      entry: null,
    };
  }
  if (!rationale) {
    return {
      ok: false,
      failDetail: `APPROVAL_RATIONALE_INVALID_${index}`,
      entry: null,
    };
  }

  const hashState = hashRepoFileSha256(repoRoot, filePath);
  if (!hashState.ok) {
    return {
      ok: false,
      failDetail: `APPROVAL_FILE_HASH_ERROR_${index}_${hashState.failDetail}`,
      entry: null,
    };
  }
  if (hashState.sha256 !== sha256) {
    return {
      ok: false,
      failDetail: `APPROVAL_FILE_HASH_MISMATCH_${index}`,
      entry: null,
    };
  }

  const key = `${filePath}\u0000${sha256}`;
  if (seenKeys.has(key)) {
    return {
      ok: false,
      failDetail: `APPROVAL_DUPLICATE_${index}`,
      entry: null,
    };
  }
  seenKeys.add(key);

  return {
    ok: true,
    failDetail: '',
    entry: {
      filePath,
      sha256,
      approvedBy,
      approvedAtUtc,
      rationale,
    },
  };
}

function buildState({
  ok,
  repoRoot,
  approvalsPath,
  approvals,
  failDetail,
}) {
  return {
    ok,
    tokens: {
      [TOKEN_NAME]: ok ? 1 : 0,
    },
    repoRoot,
    approvals_path: approvalsPath,
    approvals_count: approvals.length,
    approvals,
    failReason: ok ? '' : FAIL_REASON,
    failDetail: ok ? '' : String(failDetail || 'APPROVAL_REGISTRY_INVALID'),
  };
}

export function evaluateGovernanceApprovalState(input = {}) {
  const repoRoot = String(input.repoRoot || process.env.GOVERNANCE_APPROVAL_REPO_ROOT || process.cwd()).trim();
  const approvalsPath = normalizeRepoRelativePath(
    input.approvalsPath || process.env.GOVERNANCE_CHANGE_APPROVALS_PATH || DEFAULT_APPROVALS_PATH,
  );

  if (!approvalsPath) {
    return buildState({
      ok: false,
      repoRoot,
      approvalsPath: '',
      approvals: [],
      failDetail: 'APPROVALS_PATH_INVALID',
    });
  }

  const approvalsAbsPath = ensureInsideRoot(repoRoot, approvalsPath);
  if (!approvalsAbsPath) {
    return buildState({
      ok: false,
      repoRoot,
      approvalsPath,
      approvals: [],
      failDetail: 'APPROVALS_PATH_OUTSIDE_ROOT',
    });
  }
  if (!fs.existsSync(approvalsAbsPath)) {
    return buildState({
      ok: false,
      repoRoot,
      approvalsPath,
      approvals: [],
      failDetail: 'APPROVALS_FILE_MISSING',
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(approvalsAbsPath, 'utf8'));
  } catch {
    return buildState({
      ok: false,
      repoRoot,
      approvalsPath,
      approvals: [],
      failDetail: 'APPROVALS_FILE_INVALID_JSON',
    });
  }

  if (!isObjectRecord(parsed)) {
    return buildState({
      ok: false,
      repoRoot,
      approvalsPath,
      approvals: [],
      failDetail: 'APPROVALS_SCHEMA_INVALID',
    });
  }
  if (String(parsed.version || '').trim() !== SCHEMA_VERSION) {
    return buildState({
      ok: false,
      repoRoot,
      approvalsPath,
      approvals: [],
      failDetail: 'APPROVALS_VERSION_INVALID',
    });
  }
  if (!Array.isArray(parsed.approvals)) {
    return buildState({
      ok: false,
      repoRoot,
      approvalsPath,
      approvals: [],
      failDetail: 'APPROVALS_ARRAY_INVALID',
    });
  }

  const seenKeys = new Set();
  const approvals = [];
  for (let i = 0; i < parsed.approvals.length; i += 1) {
    const parsedEntry = parseApprovalEntry(parsed.approvals[i], i, repoRoot, seenKeys);
    if (!parsedEntry.ok || !parsedEntry.entry) {
      return buildState({
        ok: false,
        repoRoot,
        approvalsPath,
        approvals: [],
        failDetail: parsedEntry.failDetail,
      });
    }
    approvals.push(parsedEntry.entry);
  }

  approvals.sort((a, b) => {
    if (a.filePath === b.filePath) return a.sha256.localeCompare(b.sha256);
    return a.filePath.localeCompare(b.filePath);
  });

  return buildState({
    ok: true,
    repoRoot,
    approvalsPath,
    approvals,
    failDetail: '',
  });
}

function parseArgs(argv) {
  const out = {
    json: false,
    repoRoot: '',
    approvalsPath: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--repo-root' && i + 1 < argv.length) {
      out.repoRoot = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--approvals-path' && i + 1 < argv.length) {
      out.approvalsPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }

  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state.tokens[TOKEN_NAME]}`);
  console.log(`GOVERNANCE_APPROVALS_PATH=${state.approvals_path}`);
  console.log(`GOVERNANCE_APPROVALS_COUNT=${state.approvals_count}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
  if (state.failDetail) {
    console.log(`FAIL_DETAIL=${state.failDetail}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateGovernanceApprovalState({
    repoRoot: args.repoRoot,
    approvalsPath: args.approvalsPath,
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(state.ok ? 0 : 1);
}

const isEntrypoint = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main();
}

export {
  DEFAULT_APPROVALS_PATH,
  TOKEN_NAME,
};
