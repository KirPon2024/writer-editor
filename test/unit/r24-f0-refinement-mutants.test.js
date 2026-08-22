'use strict';

// R2.4 F0 mutation proof: representative implementation guards from the
// accepted Writer model are inverted in isolated module copies. The F0 oracle
// must kill every mutant before this contour can claim refinement coverage.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

const MUTANTS = Object.freeze([
  {
    id: 'dirty-stale-saved-admitted',
    moduleRel: 'src/core/dirty-admission-v1.cjs',
    copies: ['src/core/autosave-generation-v1.cjs', 'src/core/revision-algebra-v1.cjs'],
    find: "    if (saved !== latest) throw new DirtyAdmissionError('E_SAVE_ACK_STALE_AS_SAVED', `saved=${saved} latest=${latest}`);",
    replace: "    if (false) throw new DirtyAdmissionError('E_SAVE_ACK_STALE_AS_SAVED', `saved=${saved} latest=${latest}`);",
    oracle: async (modulePath) => {
      const { SAVE_ACK_KINDS, applySaveAck } = require(modulePath);
      assert.throws(
        () => applySaveAck({ latestEditGeneration: 5, ackedGeneration: 2 }, { kind: SAVE_ACK_KINDS.SAVED, savedGeneration: 4 }),
        (error) => error.code === 'E_SAVE_ACK_STALE_AS_SAVED',
      );
    },
  },
  {
    id: 'path-escape-admitted',
    moduleRel: 'src/core/io/path-capability-v1.cjs',
    copies: [],
    find: '    if (isInsideResolved(rootReal, candidateReal)) {',
    replace: '    if (true || isInsideResolved(rootReal, candidateReal)) {',
    oracle: async (modulePath) => {
      const { resolveWithinCapabilityRoots } = require(modulePath);
      const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-f0-mut-root-')));
      const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-f0-mut-out-')));
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
      const verdict = resolveWithinCapabilityRoots(path.join(outside, 'secret.txt'), [root]);
      assert.equal(verdict.ok, false);
      assert.equal(verdict.reason, 'E_CAP_ESCAPE');
    },
  },
  {
    id: 'inbox-corrupt-status-admitted',
    moduleRel: 'src/core/transactional-inbox-outbox-v1.cjs',
    copies: ['src/core/save-coordinator-v1.cjs'],
    find: "  if (record.status !== 'ADMITTED' && record.status !== 'EXECUTED') throw new InboxOutboxError('E_INBOX_LOG_CORRUPT', 'status');",
    replace: "  if (false) throw new InboxOutboxError('E_INBOX_LOG_CORRUPT', 'status');",
    oracle: async (modulePath) => {
      const { INBOX_OUTBOX_SCHEMA_VERSION, INBOX_BASENAME, openTransactionalInboxOutbox } = require(modulePath);
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-f0-mut-inbox-')));
      fs.writeFileSync(path.join(dir, INBOX_BASENAME), `${JSON.stringify({
        schemaVersion: INBOX_OUTBOX_SCHEMA_VERSION,
        intentId: 'intent-1',
        kind: 'project.commit',
        payloadHash: '0'.repeat(64),
        status: 'MAYBE',
        outcome: null,
      })}\n`);
      await assert.rejects(openTransactionalInboxOutbox(dir), (error) => error.code === 'E_INBOX_LOG_CORRUPT');
    },
  },
  {
    id: 'lifecycle-dirty-close-admitted',
    moduleRel: 'src/core/lifecycle-conflict-v1.cjs',
    copies: ['src/core/dirty-admission-v1.cjs', 'src/core/autosave-generation-v1.cjs', 'src/core/revision-algebra-v1.cjs'],
    find: '  if (dirty) {',
    replace: '  if (false && dirty) {',
    oracle: async (modulePath) => {
      const { LIFECYCLE_EVENTS, LIFECYCLE_REASONS, evaluateLifecycleBarrier } = require(modulePath);
      const decision = evaluateLifecycleBarrier({
        eventKind: LIFECYCLE_EVENTS.QUIT,
        latestEditGeneration: 2,
        ackedGeneration: 1,
      });
      assert.equal(decision.allowed, false);
      assert.equal(decision.reason, LIFECYCLE_REASONS.UNSAVED_AUTHORING_WORK);
    },
  },
  {
    id: 'migration-project-id-drift-admitted',
    moduleRel: 'src/core/migration-history-backup-gc-v1.cjs',
    copies: ['src/core/save-coordinator-v1.cjs'],
    find: "    if (next.projectId !== project.projectId) throw new MigrationHistoryError('E_R6_MIGRATION_PROJECT_ID_CHANGED', step.id);",
    replace: "    if (false) throw new MigrationHistoryError('E_R6_MIGRATION_PROJECT_ID_CHANGED', step.id);",
    oracle: async (modulePath) => {
      const { migrateProjectFile } = require(modulePath);
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-f0-mut-r6-')));
      const projectPath = path.join(dir, 'project.json');
      fs.writeFileSync(projectPath, '{"schemaVersion":"v1","projectId":"project-a"}\n');
      await assert.rejects(
        migrateProjectFile({
          projectPath,
          storeDir: path.join(dir, '.r6'),
          targetVersion: 'v2',
          migrations: [{
            id: 'v1-to-v2',
            fromVersion: 'v1',
            toVersion: 'v2',
            apply: (project) => ({ ...project, projectId: 'project-b', schemaVersion: 'v2' }),
          }],
        }),
        (error) => error.code === 'E_R6_MIGRATION_PROJECT_ID_CHANGED',
      );
    },
  },
]);

function copyRelFile(tempRoot, relPath) {
  const from = path.join(ROOT, relPath);
  const to = path.join(tempRoot, relPath);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function materializeMutant(mutant) {
  const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-f0-mutant-')));
  for (const relPath of [mutant.moduleRel, ...mutant.copies]) copyRelFile(tempRoot, relPath);
  const target = path.join(tempRoot, mutant.moduleRel);
  const source = fs.readFileSync(target, 'utf8');
  const occurrences = source.split(mutant.find).length - 1;
  assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  return { tempRoot, modulePath: target };
}

test('F0 writer refinement conformance: representative implementation mutants are executed and killed', async () => {
  assert.equal(MUTANTS.length >= 5, true, 'mutation denominator must cover multiple model boundaries');
  for (const mutant of MUTANTS) {
    await mutant.oracle(path.join(ROOT, mutant.moduleRel));
  }

  const results = [];
  for (const mutant of MUTANTS) {
    const { tempRoot, modulePath } = materializeMutant(mutant);
    let killed = false;
    let detail = '';
    try {
      await mutant.oracle(modulePath);
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.name || error.message;
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    results.push({ id: mutant.id, killed, detail });
  }

  const survived = results.filter((result) => !result.killed);
  console.log(`R24_F0_MUTATION_RECEIPT=${JSON.stringify({
    total: results.length,
    killed: results.length - survived.length,
    survived: survived.map((result) => result.id),
    score: results.length ? (results.length - survived.length) / results.length : 0,
  })}`);
  assert.deepEqual(survived, []);
});
