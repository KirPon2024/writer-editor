'use strict';

// R2.4 F0 mutation proof: representative implementation guards from the
// accepted Writer model are inverted in isolated module copies. The F0 oracle
// must kill every mutant before this contour can claim refinement coverage.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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
    find: "    if (dirty) hazards.push('UNSAVED_AUTHORING');",
    replace: "    if (false) hazards.push('UNSAVED_AUTHORING');",
    oracle: async (modulePath) => {
      const {
        LIFECYCLE_EVENTS,
        LIFECYCLE_REASONS,
        createDetachedOutboxObservation,
        evaluateLifecycleBarrier,
      } = require(modulePath);
      const subjectId = 'project:f0-mutant/document:scene';
      const decision = evaluateLifecycleBarrier({
        eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
        subjectId,
        latestEditGeneration: 2,
        ackedGeneration: 1,
        outboxObservation: createDetachedOutboxObservation({ subjectId, observationGeneration: 2 }),
        diskObservation: {
          schemaVersion: 'yalken.lifecycleDiskObservation.v1',
          subjectId,
          observationGeneration: 2,
          committedDigest: 'a'.repeat(64),
          observedDiskDigest: 'a'.repeat(64),
          p3Classification: 'NEW_COMMITTED',
        },
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
  {
    id: 'dna-calm-default-promoted-to-advanced',
    moduleRel: 'src/renderer/design-os/designOsRuntime.mjs',
    copies: [],
    find: "const DEFAULT_RUNTIME_CONTEXT = Object.freeze({\n  shell_mode: 'CALM_DOCKED',",
    replace: "const DEFAULT_RUNTIME_CONTEXT = Object.freeze({\n  shell_mode: 'SPATIAL_ADVANCED',",
    oracle: async (modulePath) => {
      const runtime = await import(`${pathToFileURL(modulePath).href}?f0=${Date.now()}-${Math.random()}`);
      assert.deepEqual(runtime.createRuntimeContext(), {
        shell_mode: 'CALM_DOCKED',
        profile: 'BASELINE',
        workspace: 'WRITE',
        platform: 'macos',
        accessibility: 'default',
      });
    },
  },
  {
    id: 'dna-progressive-disclosure-open-guard-removed',
    moduleRel: 'src/renderer/design-os/atlasFeatureIntegrationManifest.mjs',
    copies: [],
    find: "    surfaceKey: 'heatmap',\n    surfaceId: 'surface.atlas.heatmap',\n    queryRegistryKey: 'ATLAS_HEATMAP',\n    providerId: 'query.atlasHeatmap',\n    slotId: 'rightRail.context.atlas.heatmap',\n    hostKind: 'rightRail',\n    stateClass: 'DERIVED_STATE',\n    commandIds: [],\n    capabilityIds: [],\n    explicitOpenRequired: true,",
    replace: "    surfaceKey: 'heatmap',\n    surfaceId: 'surface.atlas.heatmap',\n    queryRegistryKey: 'ATLAS_HEATMAP',\n    providerId: 'query.atlasHeatmap',\n    slotId: 'rightRail.context.atlas.heatmap',\n    hostKind: 'rightRail',\n    stateClass: 'DERIVED_STATE',\n    commandIds: [],\n    capabilityIds: [],\n    explicitOpenRequired: false,",
    oracle: async (modulePath) => {
      const atlas = await import(`${pathToFileURL(modulePath).href}?f0=${Date.now()}-${Math.random()}`);
      const advanced = atlas.YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1.surfaceManifests
        .filter((surface) => ['heatmap', 'temporal', 'continuity'].includes(surface.surfaceKey));
      assert.deepEqual(advanced.map((surface) => surface.surfaceKey), ['heatmap', 'temporal', 'continuity']);
      assert.equal(advanced.every((surface) => surface.explicitOpenRequired === true), true);
    },
  },
  {
    id: 'dna-customization-can-hide-core-command',
    moduleRel: 'src/renderer/design-os/repoDesignOsCompat.mjs',
    copies: ['src/renderer/design-os/designOsRuntime.mjs'],
    find: '    const hidden = uniqueSortedStrings(value).filter((commandId) => !requiredCoreCommands.includes(commandId));',
    replace: '    const hidden = uniqueSortedStrings(value);',
    oracle: async (modulePath) => {
      const compat = await import(`${pathToFileURL(modulePath).href}?f0=${Date.now()}-${Math.random()}`);
      const profiles = compat.buildRuntimeProfiles({
        requiredCoreCommands: ['cmd.project.save'],
        presets: {
          minimal: {
            commandVisibility: {
              forceVisible: ['cmd.project.save', 'cmd.optional.atlas'],
              hidden: ['cmd.project.save', 'cmd.optional.atlas'],
            },
          },
          pro: { commandVisibility: { forceVisible: ['cmd.project.save'], hidden: [] } },
          guru: { commandVisibility: { forceVisible: ['cmd.project.save'], hidden: [] } },
        },
      }, {
        knownCommandIds: ['cmd.project.save', 'cmd.optional.atlas'],
      });
      assert.equal(profiles.FOCUS.visible_commands.includes('cmd.project.save'), true);
      assert.equal(profiles.FOCUS.hidden_commands.includes('cmd.project.save'), false);
      assert.equal(profiles.FOCUS.hidden_commands.includes('cmd.optional.atlas'), true);
    },
  },
  {
    id: 'dna-optional-off-loses-typed-complexity-refusal',
    moduleRel: 'src/core/entitlement-law-v1.cjs',
    copies: ['src/shared/productCommandRegistry.cjs'],
    find: '  if (FREE_PRO_COMPLEXITY_SET.has(normalizedCommandId)) {',
    replace: '  if (false && FREE_PRO_COMPLEXITY_SET.has(normalizedCommandId)) {',
    oracle: async (modulePath) => {
      const law = require(modulePath);
      const optional = law.decideCommandEntitlement('cmd.project.review.switchMode', law.getProductEntitlementTier());
      const save = law.decideCommandEntitlement('cmd.project.save', law.getProductEntitlementTier());
      assert.deepEqual(
        { available: optional.available, access: optional.access, reason: optional.reason },
        {
          available: false,
          access: 'pro_complexity_surface',
          reason: 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE',
        },
      );
      assert.equal(save.available, true);
      assert.equal(save.access, 'free_authorship');
    },
  },
  {
    id: 'dna-no-bloat-ui-framework-added',
    moduleRel: 'package.json',
    copies: [],
    find: '  "dependencies": {',
    replace: '  "dependencies": {\n    "react": "19.0.0",',
    oracle: async (modulePath) => {
      const packageJson = JSON.parse(fs.readFileSync(modulePath, 'utf8'));
      const dependencies = Object.keys(packageJson.dependencies || {}).sort();
      const blocked = dependencies.filter((name) => (
        !name.startsWith('@tiptap/')
        || name.startsWith('@tiptap-pro/')
        || name.startsWith('@tiptap-cloud/')
        || ['react', 'vue', 'svelte', 'angular'].includes(name)
      ));
      assert.equal(dependencies.length > 0, true, 'zero dependency denominator forbidden');
      assert.deepEqual(blocked, []);
      assert.equal(Object.keys(packageJson.optionalDependencies || {}).length, 0);
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
