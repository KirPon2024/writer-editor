#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateGovernanceApprovalState } from './governance-approval-state.mjs';

const TOKEN_NAME = 'X2_READINESS_GATE_OK';
const DEFAULT_METRICS_PATH = 'docs/OPS/STATUS/XPLAT_STAGE_METRICS_v3_12.json';
const DEFAULT_BASELINE_PATH = 'docs/OPS/STATUS/XPLAT_PARITY_BASELINE_v3_12.json';
const EVIDENCE_PREFIX = 'docs/OPS/EVIDENCE/X1_RUNTIME_PARITY/';
const EVIDENCE_PLATFORMS = Object.freeze(['ubuntu', 'windows']);
const SHA256_RE = /^[a-f0-9]{64}$/i;

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map((entry) => stableSortObject(entry));
  if (!isObjectRecord(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = stableSortObject(value[key]);
  }
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortObject(value), null, 2);
}

function readJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeRelativePath(value) {
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

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseSha(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return SHA256_RE.test(normalized) ? normalized : '';
}

function pushIssue(issues, code, message) {
  issues.push({
    code: String(code || '').trim(),
    message: String(message || '').trim(),
  });
}

function parseStrictDoctorCmd(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (/[\r\n]/u.test(normalized)) return null;
  if (/[|&;<>()$`]/u.test(normalized)) return null;

  const parts = normalized.split(/\s+/u).filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  return {
    cmd: parts[0],
    args: parts.slice(1),
  };
}

function runStrictDoctorStrict(repoRoot, strictDoctorCmd = '') {
  if (strictDoctorCmd) {
    const parsed = parseStrictDoctorCmd(strictDoctorCmd);
    if (!parsed) {
      return {
        ok: false,
        status: 1,
      };
    }

    const result = spawnSync(parsed.cmd, parsed.args, {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
    });
    return {
      ok: result.status === 0,
      status: Number.isInteger(result.status) ? result.status : 1,
    };
  }

  const result = spawnSync(process.execPath, ['scripts/doctor.mjs', '--strict'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });

  return {
    ok: result.status === 0,
    status: Number.isInteger(result.status) ? result.status : 1,
  };
}

function evaluateScopeDriftFree(repoRoot) {
  const result = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });

  if (result.status !== 0) {
    return {
      ok: false,
      status: Number.isInteger(result.status) ? result.status : 1,
      output: String(result.stderr || '').trim(),
    };
  }

  const output = String(result.stdout || '').trim();
  return {
    ok: output.length === 0,
    status: 0,
    output,
  };
}

function evaluateX1RuntimeParityFrozen({ repoRoot, metricsDoc, baselineDoc, requireEvidenceFiles, hashFile }) {
  const issues = [];

  const x1Evidence = isObjectRecord(metricsDoc?.stageEvidence) && isObjectRecord(metricsDoc.stageEvidence.X1)
    ? metricsDoc.stageEvidence.X1
    : null;
  if (!x1Evidence) {
    pushIssue(issues, 'E_X2_X1_EVIDENCE_MISSING', 'Missing metrics.stageEvidence.X1 object.');
  }

  const parityEvidence = isObjectRecord(x1Evidence?.x1RuntimeParityEvidence)
    ? x1Evidence.x1RuntimeParityEvidence
    : null;
  if (!parityEvidence) {
    pushIssue(
      issues,
      'E_X2_RUNTIME_PARITY_EVIDENCE_MISSING',
      'Missing metrics.stageEvidence.X1.x1RuntimeParityEvidence object.',
    );
  }

  const baselineEvidenceSha = isObjectRecord(baselineDoc?.evidenceSha256)
    ? baselineDoc.evidenceSha256
    : null;
  if (!baselineEvidenceSha) {
    pushIssue(issues, 'E_X2_BASELINE_EVIDENCE_SHA_MISSING', 'Missing baseline.evidenceSha256 object.');
  }

  for (const platform of EVIDENCE_PLATFORMS) {
    const entry = isObjectRecord(parityEvidence?.[platform]) ? parityEvidence[platform] : null;
    if (!entry) {
      pushIssue(issues, 'E_X2_RUNTIME_PARITY_PLATFORM_MISSING', `Missing parity evidence entry for ${platform}.`);
      continue;
    }

    const filePath = normalizeRelativePath(entry.file);
    if (!filePath || !filePath.startsWith(EVIDENCE_PREFIX)) {
      pushIssue(
        issues,
        'E_X2_RUNTIME_PARITY_FILE_INVALID',
        `Evidence file path for ${platform} must be under ${EVIDENCE_PREFIX}.`,
      );
    }

    const metricsSha = parseSha(entry.sha256);
    if (!metricsSha) {
      pushIssue(issues, 'E_X2_RUNTIME_PARITY_SHA_INVALID', `Invalid sha256 in metrics for ${platform}.`);
    }

    const baselineSha = parseSha(baselineEvidenceSha?.[platform]);
    if (!baselineSha) {
      pushIssue(issues, 'E_X2_BASELINE_EVIDENCE_SHA_INVALID', `Invalid baseline evidence sha for ${platform}.`);
    }

    if (metricsSha && baselineSha && metricsSha !== baselineSha) {
      pushIssue(
        issues,
        'E_X2_EVIDENCE_SHA_MISMATCH',
        `Metrics and baseline sha256 mismatch for ${platform}.`,
      );
    }

    if (!filePath || !metricsSha) continue;

    const absoluteEvidencePath = ensureInsideRoot(repoRoot, filePath);
    if (!absoluteEvidencePath || !fs.existsSync(absoluteEvidencePath)) {
      if (requireEvidenceFiles) {
        pushIssue(
          issues,
          'E_X2_EVIDENCE_FILE_MISSING',
          `Evidence file for ${platform} not found: ${filePath}.`,
        );
      }
      continue;
    }

    let stat;
    try {
      stat = fs.statSync(absoluteEvidencePath);
    } catch {
      pushIssue(issues, 'E_X2_EVIDENCE_FILE_UNREADABLE', `Evidence file is not readable: ${filePath}.`);
      continue;
    }

    if (!stat.isFile()) {
      pushIssue(issues, 'E_X2_EVIDENCE_FILE_NOT_REGULAR', `Evidence path is not a file: ${filePath}.`);
      continue;
    }

    const observedSha = parseSha(hashFile(absoluteEvidencePath));
    if (!observedSha || observedSha !== metricsSha) {
      pushIssue(
        issues,
        'E_X2_EVIDENCE_FILE_SHA_MISMATCH',
        `Evidence file sha256 mismatch for ${platform}.`,
      );
    }
  }

  return {
    ok: issues.length === 0,
    issues: issues.sort((a, b) => {
      if (a.code !== b.code) return a.code.localeCompare(b.code);
      return a.message.localeCompare(b.message);
    }),
  };
}

export function evaluateX2ReadinessGateState(input = {}) {
  const repoRoot = String(input.repoRoot || process.env.X2_READINESS_REPO_ROOT || process.cwd()).trim();
  const metricsPath = String(input.metricsPath || process.env.X2_READINESS_METRICS_PATH || DEFAULT_METRICS_PATH).trim();
  const baselinePath = String(
    input.baselinePath || process.env.X2_READINESS_BASELINE_PATH || DEFAULT_BASELINE_PATH,
  ).trim();
  const requireEvidenceFiles = String(
    input.requireEvidenceFiles ?? process.env.X2_READINESS_REQUIRE_EVIDENCE_FILES ?? '0',
  ).trim() === '1';
  const strictDoctorCmd = String(input.strictDoctorCmd || process.env.X2_READINESS_STRICT_DOCTOR_CMD || '').trim();

  const metricsDoc = isObjectRecord(input.metricsDoc) ? input.metricsDoc : readJsonObject(path.resolve(repoRoot, metricsPath));
  const baselineDoc = isObjectRecord(input.baselineDoc)
    ? input.baselineDoc
    : readJsonObject(path.resolve(repoRoot, baselinePath));

  const componentIssues = {
    X1_RUNTIME_PARITY_FROZEN_OK: [],
    GOVERNANCE_GREEN_OK: [],
    STRICT_DOCTOR_GREEN_OK: [],
    SCOPE_DRIFT_FREE_OK: [],
  };

  const frozen = evaluateX1RuntimeParityFrozen({
    repoRoot,
    metricsDoc,
    baselineDoc,
    requireEvidenceFiles,
    hashFile: typeof input.hashFile === 'function' ? input.hashFile : sha256File,
  });
  componentIssues.X1_RUNTIME_PARITY_FROZEN_OK = frozen.issues;

  const governance = typeof input.governanceStateRunner === 'function'
    ? input.governanceStateRunner({ repoRoot })
    : evaluateGovernanceApprovalState({ repoRoot });
  if (!governance || governance.ok !== true) {
    pushIssue(
      componentIssues.GOVERNANCE_GREEN_OK,
      'E_X2_GOVERNANCE_NOT_GREEN',
      'governance-approval-state is not green.',
    );
  }

  const strictDoctorResult = typeof input.strictDoctorRunner === 'function'
    ? input.strictDoctorRunner({ repoRoot })
    : runStrictDoctorStrict(repoRoot, strictDoctorCmd);
  if (!strictDoctorResult || strictDoctorResult.ok !== true) {
    pushIssue(
      componentIssues.STRICT_DOCTOR_GREEN_OK,
      'E_X2_STRICT_DOCTOR_NOT_GREEN',
      'doctor --strict returned non-zero exit.',
    );
  }

  const scopeState = typeof input.scopeRunner === 'function'
    ? input.scopeRunner({ repoRoot })
    : evaluateScopeDriftFree(repoRoot);
  if (!scopeState || scopeState.ok !== true) {
    pushIssue(
      componentIssues.SCOPE_DRIFT_FREE_OK,
      'E_X2_SCOPE_DRIFT_DETECTED',
      'Working tree is not clean or contains untracked files.',
    );
  }

  const components = {
    X1_RUNTIME_PARITY_FROZEN_OK: componentIssues.X1_RUNTIME_PARITY_FROZEN_OK.length === 0 ? 1 : 0,
    GOVERNANCE_GREEN_OK: componentIssues.GOVERNANCE_GREEN_OK.length === 0 ? 1 : 0,
    STRICT_DOCTOR_GREEN_OK: componentIssues.STRICT_DOCTOR_GREEN_OK.length === 0 ? 1 : 0,
    SCOPE_DRIFT_FREE_OK: componentIssues.SCOPE_DRIFT_FREE_OK.length === 0 ? 1 : 0,
  };

  const ok = Object.values(components).every((value) => value === 1);

  return {
    [TOKEN_NAME]: ok ? 1 : 0,
    COMPONENTS: components,
    failReason: ok ? '' : 'X2_READINESS_GATE_BLOCKED',
    requireEvidenceFiles: requireEvidenceFiles ? 1 : 0,
    metricsPath,
    baselinePath,
    componentIssues,
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    metricsPath: '',
    baselinePath: '',
    repoRoot: '',
    strictDoctorCmd: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg === '--metrics-path' && i + 1 < argv.length) {
      out.metricsPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--baseline-path' && i + 1 < argv.length) {
      out.baselinePath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--repo-root' && i + 1 < argv.length) {
      out.repoRoot = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--strict-doctor-cmd' && i + 1 < argv.length) {
      out.strictDoctorCmd = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }

  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`X1_RUNTIME_PARITY_FROZEN_OK=${state.COMPONENTS.X1_RUNTIME_PARITY_FROZEN_OK}`);
  console.log(`GOVERNANCE_GREEN_OK=${state.COMPONENTS.GOVERNANCE_GREEN_OK}`);
  console.log(`STRICT_DOCTOR_GREEN_OK=${state.COMPONENTS.STRICT_DOCTOR_GREEN_OK}`);
  console.log(`SCOPE_DRIFT_FREE_OK=${state.COMPONENTS.SCOPE_DRIFT_FREE_OK}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateX2ReadinessGateState({
    metricsPath: args.metricsPath || undefined,
    baselinePath: args.baselinePath || undefined,
    repoRoot: args.repoRoot || undefined,
    strictDoctorCmd: args.strictDoctorCmd || undefined,
  });

  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }

  process.exit(state[TOKEN_NAME] === 1 ? 0 : 1);
}

if (process.argv[1]) {
  const entrypointPath = path.resolve(process.argv[1]);
  if (fileURLToPath(import.meta.url) === entrypointPath) {
    main();
  }
}
