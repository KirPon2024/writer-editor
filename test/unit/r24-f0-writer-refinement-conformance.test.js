'use strict';

// R2.4 F0_WRITER_REFINEMENT_CONFORMANCE — executable model-to-code
// refinement rows. Each row names a forbidden model state and proves the
// current implementation rejects it at the owning boundary.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DAG_PATH = path.join(ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json');

const EXPECTED_F0_DEPS = Object.freeze([
  'K1_AUTHORITY_DECOMPOSITION',
  'R6_MIGRATION_HISTORY_BACKUP_GC',
  'SEC0_PATH_CAPABILITY',
  'T0_TEXT_COORDINATE_ALGEBRA',
  'ENT0_ENTITLEMENT_CONFORMANCE',
]);

const EXPECTED_F0_ISSUES = Object.freeze([
  'I03_AUTOSAVE_DIRTY_LIFECYCLE',
  'I04_DURABILITY_AND_PROJECT_TRANSACTION',
  'I05_IPC_TRUST_BOUNDARY',
  'I06_COMMAND_ERROR_RESULT_PROTOCOL',
  'I07_AUTHORITY_DECOMPOSITION_AND_BOUNDARIES',
  'I08_PATH_AND_FILESYSTEM_CAPABILITY',
  'I09_TEXT_COORDINATE_ALGEBRA',
  'I10_REVISION_PUBLICATION_SNAPSHOT',
  'I13_DESIGN_TRUTH_AND_ENTITLEMENT',
]);

const EXPECTED_F0_EVIDENCE = Object.freeze([
  'E1_MODEL',
  'E2_CONTRACT',
  'E3_INTEGRATION',
  'E4_FAULT_INJECTION',
  'E6_INDEPENDENT_EXACT_HEAD',
]);

const sandbox = (prefix = 'r24-f0-') => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
const shaA = 'a'.repeat(64);
const shaB = 'b'.repeat(64);

function loadDag() {
  return JSON.parse(fs.readFileSync(DAG_PATH, 'utf8'));
}

function requireCore(relativePath) {
  return require(path.join(ROOT, 'src', 'core', relativePath));
}

function listSourceFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        stack.push(full);
      } else if (entry.isFile() && /\.(?:cjs|mjs|js)$/u.test(entry.name)) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

function scanReverseImports() {
  const src = path.join(ROOT, 'src');
  const specifierRe = /(?:require\(|from\s+|import\s*(?!\w)[(]?\s*)['"]([^'"]+)['"]/gu;
  const violations = [];
  let scannedFiles = 0;
  let scannedSpecifiers = 0;
  for (const scope of [path.join(src, 'core'), path.join(src, 'shared')]) {
    for (const filePath of listSourceFiles(scope)) {
      scannedFiles += 1;
      const source = fs.readFileSync(filePath, 'utf8');
      for (const match of source.matchAll(specifierRe)) {
        scannedSpecifiers += 1;
        const specifier = match[1];
        if (specifier === 'electron') {
          violations.push({ file: path.relative(ROOT, filePath), specifier });
          continue;
        }
        if (!specifier.startsWith('.')) continue;
        const base = path.resolve(path.dirname(filePath), specifier);
        const candidates = [base, `${base}.js`, `${base}.cjs`, `${base}.mjs`, path.join(base, 'index.js')];
        const resolved = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || base;
        if (
          resolved === path.join(src, 'main.js')
          || resolved.startsWith(path.join(src, 'main') + path.sep)
          || resolved.startsWith(path.join(src, 'renderer') + path.sep)
          || resolved.startsWith(path.join(src, 'preload') + path.sep)
        ) {
          violations.push({ file: path.relative(ROOT, filePath), specifier });
        }
      }
    }
  }
  return { scannedFiles, scannedSpecifiers, violations };
}

function linearMigrations(maxVersion, mutate = (project, to) => ({ ...project, schemaVersion: to })) {
  return Array.from({ length: maxVersion - 1 }, (_, index) => {
    const from = `v${index + 1}`;
    const to = `v${index + 2}`;
    return {
      id: `${from}-to-${to}`,
      fromVersion: from,
      toVersion: to,
      apply: (project) => mutate(project, to),
    };
  });
}

const MODEL_ROWS = Object.freeze([
  {
    id: 'P1_STALE_ACK_CANNOT_CLEAR_DIRTY',
    stageId: 'P1_DIRTY_ADMISSION_ACK',
    issueIds: ['I03_AUTOSAVE_DIRTY_LIFECYCLE'],
    evidenceClasses: ['E1_MODEL', 'E2_CONTRACT', 'E3_INTEGRATION'],
    forbiddenState: 'stale save acknowledgement presented as SAVED for newer authoring generation',
    async probe() {
      const { SAVE_ACK_KINDS, applySaveAck, deriveDirty } = requireCore('dirty-admission-v1.cjs');
      assert.throws(
        () => applySaveAck({ latestEditGeneration: 5, ackedGeneration: 2 }, { kind: SAVE_ACK_KINDS.SAVED, savedGeneration: 4 }),
        (error) => error.code === 'E_SAVE_ACK_STALE_AS_SAVED',
      );
      assert.equal(deriveDirty({ latestEditGeneration: 5, ackedGeneration: 2 }), true);
      return 'E_SAVE_ACK_STALE_AS_SAVED';
    },
  },
  {
    id: 'P2_INVALID_SAVE_ADMISSION_HAS_NO_ACK',
    stageId: 'P2_DURABLE_SAVE_COORDINATOR',
    issueIds: ['I04_DURABILITY_AND_PROJECT_TRANSACTION'],
    evidenceClasses: ['E1_MODEL', 'E2_CONTRACT', 'E4_FAULT_INJECTION'],
    forbiddenState: 'invalid durable save target reaches publish or ACK phase',
    async probe() {
      const { durableSaveTransaction } = requireCore('save-coordinator-v1.cjs');
      await assert.rejects(
        durableSaveTransaction({ filePath: '', content: 'draft', revision: 1 }),
        (error) => error.code === 'E_SAVE_TARGET_REQUIRED' && error.phase === 'ADMIT',
      );
      return 'E_SAVE_TARGET_REQUIRED';
    },
  },
  {
    id: 'P3_FENCE_REGRESSION_CANNOT_OVERWRITE_MARKER',
    stageId: 'P3_TRANSACTIONAL_PROJECT_COMMIT',
    issueIds: ['I04_DURABILITY_AND_PROJECT_TRANSACTION'],
    evidenceClasses: ['E1_MODEL', 'E2_CONTRACT', 'E3_INTEGRATION', 'E4_FAULT_INJECTION'],
    forbiddenState: 'non-advancing project commit revision overwrites text or marker',
    async probe() {
      const { commitProjectTextAndManifest, markerPathFor } = requireCore('project-commit-v1.cjs');
      const dir = sandbox();
      const scene = path.join(dir, 'scene.txt');
      await commitProjectTextAndManifest({
        scenePath: scene,
        sceneContent: 'newer',
        revision: 3,
        persistManifest: async () => ({ persisted: false }),
      });
      const markerBefore = fs.readFileSync(markerPathFor(scene), 'utf8');
      await assert.rejects(
        commitProjectTextAndManifest({
          scenePath: scene,
          sceneContent: 'older',
          revision: 3,
          persistManifest: async () => ({ persisted: false }),
        }),
        (error) => error.code === 'E_COMMIT_FENCE_REGRESSION',
      );
      assert.equal(fs.readFileSync(scene, 'utf8'), 'newer');
      assert.equal(fs.readFileSync(markerPathFor(scene), 'utf8'), markerBefore);
      return 'E_COMMIT_FENCE_REGRESSION';
    },
  },
  {
    id: 'S1_IPC_ENVELOPE_REJECTS_UNKNOWN_AND_DEEP_PAYLOADS',
    stageId: 'S1_IPC_ENVELOPE_BUDGETS',
    issueIds: ['I05_IPC_TRUST_BOUNDARY'],
    evidenceClasses: ['E2_CONTRACT', 'E3_INTEGRATION', 'E4_FAULT_INJECTION'],
    forbiddenState: 'privileged IPC payload escapes key, depth or identity envelope law',
    async probe() {
      const { createEnvelope, validateIpcEnvelope } = requireCore('ipc-envelope-v1.cjs');
      const envelope = createEnvelope('ui:command-bridge', 'cmd.project.save', { ok: true }, {
        correlationId: 'corr-12345678',
        issuedAt: '2026-08-22T12:00:00.000Z',
      });
      assert.deepEqual(validateIpcEnvelope({ ...envelope, injected: true }, 'ui:command-bridge'), {
        ok: false,
        code: 'E_ENVELOPE_KEY_UNKNOWN',
        detail: 'injected',
      });
      let deep = {};
      for (let i = 0; i < 4; i += 1) deep = { child: deep };
      assert.equal(validateIpcEnvelope({ ...envelope, payload: deep }, 'ui:command-bridge', { maxDepth: 2 }).code, 'E_ENVELOPE_DEPTH');
      return 'E_ENVELOPE_KEY_UNKNOWN';
    },
  },
  {
    id: 'K0_OPERATION_CLASS_AND_REFUSAL_CODE_STAY_TYPED',
    stageId: 'K0_COMMAND_PROTOCOL',
    issueIds: ['I06_COMMAND_ERROR_RESULT_PROTOCOL'],
    evidenceClasses: ['E1_MODEL', 'E2_CONTRACT', 'E3_INTEGRATION'],
    forbiddenState: 'query, command and refusal result classes collapse into untyped payloads',
    async probe() {
      const protocol = requireCore('command-protocol-v1.cjs');
      assert.equal(protocol.bridgeOperationClass('ui:command-bridge'), protocol.OPERATION_CLASSES.COMMAND);
      assert.equal(protocol.bridgeOperationClass('ui:workspace-query-bridge'), protocol.OPERATION_CLASSES.QUERY);
      assert.notEqual(protocol.bridgeOperationClass('ui:command-bridge'), protocol.bridgeOperationClass('ui:workspace-query-bridge'));
      assert.throws(() => protocol.bridgeOperationClass('ui:unknown'), (error) => error.code === 'E_PROTOCOL_CHANNEL_UNKNOWN');
      assert.throws(() => protocol.normalizeProtocolResult({ ok: false }), (error) => error.code === 'E_PROTOCOL_REFUSAL_CODE_MISSING');
      assert.equal(protocol.normalizeProtocolResult({ ok: false, error: 'E_REFUSED' }).code, 'E_REFUSED');
      return 'E_PROTOCOL_REFUSAL_CODE_MISSING';
    },
  },
  {
    id: 'K1_PRODUCT_PLANE_HAS_NO_REVERSE_IMPORT',
    stageId: 'K1_AUTHORITY_DECOMPOSITION',
    issueIds: ['I07_AUTHORITY_DECOMPOSITION_AND_BOUNDARIES'],
    evidenceClasses: ['E2_CONTRACT', 'E3_INTEGRATION', 'E6_INDEPENDENT_EXACT_HEAD'],
    forbiddenState: 'Product Core or shared source imports renderer, preload, main process or Electron',
    async probe() {
      const scan = scanReverseImports();
      assert.equal(scan.scannedFiles > 20, true, `scanned files=${scan.scannedFiles}`);
      assert.equal(scan.scannedSpecifiers > 0, true, 'zero specifier denominator forbidden');
      assert.deepEqual(scan.violations, []);
      return `scan:${scan.scannedFiles}:${scan.scannedSpecifiers}`;
    },
  },
  {
    id: 'R0_REVISION_JOIN_REJECTS_CONCURRENT_COORDINATES',
    stageId: 'R0_REVISION_ALGEBRA',
    issueIds: ['I10_REVISION_PUBLICATION_SNAPSHOT'],
    evidenceClasses: ['E1_MODEL', 'E2_CONTRACT', 'E3_INTEGRATION'],
    forbiddenState: 'concurrent revision coordinates are silently joined as last-write-wins',
    async probe() {
      const { REVISION_ORDER, compareRevisionCoordinates, joinRevisionCoordinates } = requireCore('revision-algebra-v1.cjs');
      const base = {
        domain: { projectId: 'p', entityId: 'scene' },
        projectRevision: 1,
        entityRevision: 1,
        sourceRevision: 1,
        generation: 1,
        writerEpoch: 1,
      };
      const left = { ...base, projectRevision: 2, sourceRevision: 1 };
      const right = { ...base, projectRevision: 1, sourceRevision: 2 };
      assert.equal(compareRevisionCoordinates(left, right), REVISION_ORDER.CONCURRENT);
      assert.throws(() => joinRevisionCoordinates(left, right), (error) => error.code === 'E_REVISION_CONCURRENT_CONFLICT');
      return 'E_REVISION_CONCURRENT_CONFLICT';
    },
  },
  {
    id: 'R4_EFFECT_CANNOT_STAGE_BEFORE_EXECUTED_INTENT',
    stageId: 'R4_TRANSACTIONAL_INBOX_OUTBOX',
    issueIds: ['I04_DURABILITY_AND_PROJECT_TRANSACTION', 'I06_COMMAND_ERROR_RESULT_PROTOCOL'],
    evidenceClasses: ['E1_MODEL', 'E2_CONTRACT', 'E3_INTEGRATION', 'E4_FAULT_INJECTION'],
    forbiddenState: 'durable effect authority exists before the accepted intent was executed',
    async probe() {
      const { openTransactionalInboxOutbox } = requireCore('transactional-inbox-outbox-v1.cjs');
      const box = await openTransactionalInboxOutbox(sandbox());
      await box.admitIntent({ intentId: 'intent-1', kind: 'project.commit', payload: { a: 1 } });
      await assert.rejects(
        box.stageEffect({ intentId: 'intent-1', effectId: 'effect-1', kind: 'fs.write' }),
        (error) => error.code === 'E_INTENT_NOT_EXECUTED',
      );
      await assert.rejects(
        box.ensureIntentAdmitted({ intentId: 'intent-1', kind: 'project.commit', payload: { a: 2 } }),
        (error) => error.code === 'E_INTENT_CONFLICT',
      );
      return 'E_INTENT_NOT_EXECUTED';
    },
  },
  {
    id: 'R5_LIFECYCLE_BARRIER_BLOCKS_DIRTY_PENDING_AND_DIVERGED',
    stageId: 'R5_LIFECYCLE_EXTERNAL_CONFLICT',
    issueIds: ['I03_AUTOSAVE_DIRTY_LIFECYCLE', 'I04_DURABILITY_AND_PROJECT_TRANSACTION'],
    evidenceClasses: ['E2_CONTRACT', 'E3_INTEGRATION', 'E4_FAULT_INJECTION'],
    forbiddenState: 'quit, suspend or crash recovery is allowed while dirty, pending effects or external divergence exist',
    async probe() {
      const {
        LIFECYCLE_EVENTS,
        LIFECYCLE_REASONS,
        createDetachedOutboxObservation,
        createFreshOutboxObservation,
        evaluateLifecycleBarrier,
      } = requireCore('lifecycle-conflict-v1.cjs');
      const subjectId = 'project:f0-model/document:scene';
      const diskObservation = (generation, observedDiskDigest = shaA) => ({
        schemaVersion: 'yalken.lifecycleDiskObservation.v1',
        subjectId,
        observationGeneration: generation,
        committedDigest: shaA,
        observedDiskDigest,
        p3Classification: 'NEW_COMMITTED',
      });
      const pendingEffects = [{ intentId: 'intent-1', effectId: 'effect-1', status: 'PENDING' }];
      const freshPending = createFreshOutboxObservation({
        subjectId,
        observationGeneration: 1,
        inboxOutbox: {
          replay: () => ({
            schemaVersion: 'yalken.transactionalInboxOutbox.v1',
            outboxDigest: 'c'.repeat(64),
            effects: [{ intentId: 'intent-1', effectId: 'effect-1', status: 'PENDING' }],
          }),
          pendingEffects: () => pendingEffects,
        },
      });
      assert.equal(evaluateLifecycleBarrier({
        eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
        subjectId,
        latestEditGeneration: 2,
        ackedGeneration: 1,
        outboxObservation: createDetachedOutboxObservation({ subjectId, observationGeneration: 2 }),
        diskObservation: diskObservation(2),
      }).reason, LIFECYCLE_REASONS.UNSAVED_AUTHORING_WORK);
      assert.equal(evaluateLifecycleBarrier({
        eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,
        subjectId,
        latestEditGeneration: 1,
        ackedGeneration: 1,
        outboxObservation: freshPending,
        diskObservation: diskObservation(1),
      }).reason, LIFECYCLE_REASONS.PENDING_EFFECT_REPLAY_REQUIRED);
      assert.equal(evaluateLifecycleBarrier({
        eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
        subjectId,
        latestEditGeneration: 1,
        ackedGeneration: 1,
        outboxObservation: createDetachedOutboxObservation({ subjectId, observationGeneration: 1 }),
        diskObservation: diskObservation(1, shaB),
      }).reason, LIFECYCLE_REASONS.EXTERNAL_DIVERGENCE_DETECTED);
      return 'LIFECYCLE_BLOCKED';
    },
  },
  {
    id: 'R6_MIGRATION_PROJECT_ID_DRIFT_HAS_NO_PUBLICATION',
    stageId: 'R6_MIGRATION_HISTORY_BACKUP_GC',
    issueIds: ['I04_DURABILITY_AND_PROJECT_TRANSACTION'],
    evidenceClasses: ['E1_MODEL', 'E2_CONTRACT', 'E3_INTEGRATION', 'E4_FAULT_INJECTION'],
    forbiddenState: 'migration changes project identity and still publishes as forward migration',
    async probe() {
      const { migrateProjectFile } = requireCore('migration-history-backup-gc-v1.cjs');
      const dir = sandbox();
      const projectPath = path.join(dir, 'project.json');
      fs.writeFileSync(projectPath, '{"schemaVersion":"v1","projectId":"project-a"}\n');
      const before = fs.readFileSync(projectPath, 'utf8');
      await assert.rejects(
        migrateProjectFile({
          projectPath,
          storeDir: path.join(dir, '.r6'),
          targetVersion: 'v2',
          migrations: linearMigrations(2, (project, to) => ({ ...project, projectId: 'project-b', schemaVersion: to })),
        }),
        (error) => error.code === 'E_R6_MIGRATION_PROJECT_ID_CHANGED',
      );
      assert.equal(fs.readFileSync(projectPath, 'utf8'), before);
      return 'E_R6_MIGRATION_PROJECT_ID_CHANGED';
    },
  },
  {
    id: 'SEC0_PATH_CAPABILITY_REJECTS_ESCAPE_AND_SYMLINK',
    stageId: 'SEC0_PATH_CAPABILITY',
    issueIds: ['I08_PATH_AND_FILESYSTEM_CAPABILITY'],
    evidenceClasses: ['E2_CONTRACT', 'E3_INTEGRATION', 'E4_FAULT_INJECTION'],
    forbiddenState: 'lexical path, symlink or prefix sibling grants filesystem capability',
    async probe() {
      const { resolveWithinCapabilityRoots } = requireCore(path.join('io', 'path-capability-v1.cjs'));
      const root = sandbox();
      const outside = sandbox();
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
      fs.symlinkSync(outside, path.join(root, 'link-out'), 'dir');
      assert.equal(resolveWithinCapabilityRoots(path.join(outside, 'secret.txt'), [root]).reason, 'E_CAP_ESCAPE');
      assert.equal(resolveWithinCapabilityRoots(path.join(root, 'link-out', 'secret.txt'), [root], { noFollow: true }).reason, 'E_CAP_NOFOLLOW_SYMLINK');
      assert.equal(resolveWithinCapabilityRoots(`${root}-sibling.txt`, [root]).ok, false);
      return 'E_CAP_NOFOLLOW_SYMLINK';
    },
  },
  {
    id: 'T0_TEXT_FOLD_REFUSES_UNMAPPABLE_AND_INVALID_UNICODE',
    stageId: 'T0_TEXT_COORDINATE_ALGEBRA',
    issueIds: ['I09_TEXT_COORDINATE_ALGEBRA'],
    evidenceClasses: ['E1_MODEL', 'E2_CONTRACT', 'E3_INTEGRATION', 'E4_FAULT_INJECTION'],
    forbiddenState: 'folded offset inside an expansion is guessed, or invalid Unicode is silently folded',
    async probe() {
      const fold = await import(path.join(ROOT, 'src', 'core', 'text-fold-tape-v1.mjs'));
      const tape = fold.buildDeterministicFoldTape('abİcd');
      assert.equal(tape.foldedText, 'abi\u0307cd');
      assert.equal(fold.mapFoldedOffsetToOriginal(tape, 3).status, 'UNMAPPABLE');
      assert.throws(() => fold.buildDeterministicFoldTape('lone\uD800surrogate'), (error) => error.code === 'E_TEXT_TRANSFORM_UNICODE_INVALID');
      return 'UNMAPPABLE';
    },
  },
  {
    id: 'ENT0_PRODUCT_PORT_TIER_IS_NOT_RENDERER_HINT',
    stageId: 'ENT0_ENTITLEMENT_CONFORMANCE',
    issueIds: ['I13_DESIGN_TRUTH_AND_ENTITLEMENT'],
    evidenceClasses: ['E1_MODEL', 'E2_CONTRACT', 'E3_INTEGRATION'],
    forbiddenState: 'renderer-provided entitlement hint changes authoritative product port decision',
    async probe() {
      const law = requireCore('entitlement-law-v1.cjs');
      const commandId = 'cmd.project.review.switchMode';
      assert.equal(law.getProductEntitlementTier(), 'free');
      assert.equal(law.getProductEntitlementTier.length, 0);
      const portDecision = law.decideCommandEntitlement(commandId, law.getProductEntitlementTier());
      assert.equal(portDecision.available, false);
      assert.equal(portDecision.reason, 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE');
      assert.equal(law.decideCommandEntitlement(commandId, 'pro-plus').available, false);
      return 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE';
    },
  },
]);

test('F0 model contract is bound to the live R2.4 DAG stage and full issue/evidence surface', () => {
  const dag = loadDag();
  const f0 = dag.stages.find((stage) => stage.stageId === 'F0_WRITER_REFINEMENT_CONFORMANCE');
  assert.ok(f0, 'F0 stage must exist in PROGRAM_DAG');
  assert.deepEqual(f0.dependsOn, EXPECTED_F0_DEPS);
  assert.deepEqual(f0.requiredEvidence, EXPECTED_F0_EVIDENCE);
  assert.equal(f0.mutationAuthority, 'MODEL_TO_CODE_REFINEMENT_TESTS');
  assert.equal(f0.claimCeiling, 'WRITER_IMPLEMENTATION_REFINEMENT_SCOPED');

  const ids = MODEL_ROWS.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length, 'model row ids must be unique');
  assert.equal(MODEL_ROWS.length >= EXPECTED_F0_ISSUES.length, true, 'F0 row denominator must cover every issue');
  const coveredIssues = new Set(MODEL_ROWS.flatMap((row) => row.issueIds));
  assert.deepEqual([...coveredIssues].sort(), [...EXPECTED_F0_ISSUES].sort());
  const coveredEvidence = new Set(MODEL_ROWS.flatMap((row) => row.evidenceClasses));
  for (const evidence of EXPECTED_F0_EVIDENCE) assert.equal(coveredEvidence.has(evidence), true, evidence);
  for (const row of MODEL_ROWS) {
    assert.equal(typeof row.forbiddenState, 'string');
    assert.equal(row.forbiddenState.length > 20, true, row.id);
    assert.equal(typeof row.probe, 'function', row.id);
  }
});

test('F0 model rows execute exact implementation probes for every forbidden state', async () => {
  const observations = [];
  for (const row of MODEL_ROWS) {
    const observed = await row.probe();
    observations.push({ rowId: row.id, stageId: row.stageId, observed });
    assert.equal(typeof observed, 'string', row.id);
    assert.notEqual(observed, '', row.id);
  }
  console.log(`R24_F0_REFINEMENT_RECEIPT=${JSON.stringify({
    rows: observations.length,
    stages: [...new Set(observations.map((item) => item.stageId))].sort(),
    observations: observations.map((item) => item.rowId),
  })}`);
  assert.equal(observations.length, MODEL_ROWS.length);
});
