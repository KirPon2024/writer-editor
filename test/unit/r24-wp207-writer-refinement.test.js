'use strict';

// R2.4 WP207: Product Core compiles the live Writer DNA observations into a
// bounded Writer V0 runtime refinement verdict. The compiler is pure core; the
// test layer gathers live observations from the owning runtime modules.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_REL = 'src/core/writer-refinement-verdict-v1.cjs';
const MODULE_PATH = path.join(ROOT, MODULE_REL);
const verdict = require(MODULE_PATH);

const REQUIRED_ROW_IDS = Object.freeze(verdict.REQUIRED_DNA_ROWS.map((row) => row.rowId));

function importRepo(relativePath) {
  return import(`${pathToFileURL(path.join(ROOT, relativePath)).href}?wp207=${Date.now()}-${Math.random()}`);
}

function syntheticRows(overrides = {}) {
  return verdict.REQUIRED_DNA_ROWS.map((row) => verdict.createWriterDnaObservation({
    rowId: row.rowId,
    source: 'WP207_SYNTHETIC_ORACLE',
    observed: {
      dimension: row.dimension,
      proof: overrides[row.rowId]?.proof || 'pass',
    },
    ...(overrides[row.rowId] || {}),
  }));
}

async function liveRows() {
  const rows = [];

  const runtime = await importRepo('src/renderer/design-os/designOsRuntime.mjs');
  const runtimeContext = runtime.createRuntimeContext();
  const layout = runtime.createLayoutSnapshot();
  assert.deepEqual(runtimeContext, {
    shell_mode: 'CALM_DOCKED',
    profile: 'BASELINE',
    workspace: 'WRITE',
    platform: 'macos',
    accessibility: 'default',
  });
  assert.equal(layout.editor_root, 'docked');
  assert.equal(layout.shell_mode, 'CALM_DOCKED');
  rows.push(verdict.createWriterDnaObservation({
    rowId: 'DNA_CALM_DEFAULT_IS_BASELINE_WRITE',
    source: 'src/renderer/design-os/designOsRuntime.mjs',
    observed: { runtimeContext, layout },
  }));

  const atlas = await importRepo('src/renderer/design-os/atlasFeatureIntegrationManifest.mjs');
  const advanced = atlas.YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1.surfaceManifests
    .filter((surface) => ['heatmap', 'temporal', 'continuity'].includes(surface.surfaceKey));
  assert.deepEqual(advanced.map((surface) => surface.surfaceKey), ['heatmap', 'temporal', 'continuity']);
  assert.equal(advanced.every((surface) => surface.explicitOpenRequired === true), true);
  rows.push(verdict.createWriterDnaObservation({
    rowId: 'DNA_DISCLOSURE_REQUIRES_EXPLICIT_ADVANCED_OPEN',
    source: 'src/renderer/design-os/atlasFeatureIntegrationManifest.mjs',
    observed: {
      advancedSurfaceCount: advanced.length,
      explicitOpenRequired: advanced.map((surface) => [surface.surfaceKey, surface.explicitOpenRequired]),
    },
  }));

  const lifecycle = require(path.join(ROOT, 'src/core/lifecycle-conflict-v1.cjs'));
  const subjectId = 'project:wp207/document:scene';
  const lifecycleDecision = lifecycle.evaluateLifecycleBarrier({
    eventKind: lifecycle.LIFECYCLE_EVENTS.EXTERNAL_EDIT,
    subjectId,
    latestEditGeneration: 2,
    ackedGeneration: 1,
    outboxObservation: lifecycle.createDetachedOutboxObservation({ subjectId, observationGeneration: 2 }),
    diskObservation: {
      schemaVersion: 'yalken.lifecycleDiskObservation.v1',
      subjectId,
      observationGeneration: 2,
      committedDigest: 'a'.repeat(64),
      observedDiskDigest: 'a'.repeat(64),
      p3Classification: 'NEW_COMMITTED',
    },
  });
  assert.equal(lifecycleDecision.allowed, false);
  assert.equal(lifecycleDecision.reason, lifecycle.LIFECYCLE_REASONS.UNSAVED_AUTHORING_WORK);
  rows.push(verdict.createWriterDnaObservation({
    rowId: 'DNA_CONTINUITY_BLOCKS_UNSAVED_LIFECYCLE',
    source: 'src/core/lifecycle-conflict-v1.cjs',
    observed: lifecycleDecision,
  }));

  const compat = await importRepo('src/renderer/design-os/repoDesignOsCompat.mjs');
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
  rows.push(verdict.createWriterDnaObservation({
    rowId: 'DNA_CUSTOMIZATION_CANNOT_HIDE_CORE_COMMANDS',
    source: 'src/renderer/design-os/repoDesignOsCompat.mjs',
    observed: profiles.FOCUS,
  }));

  const entitlement = require(path.join(ROOT, 'src/core/entitlement-law-v1.cjs'));
  const optional = entitlement.decideCommandEntitlement('cmd.project.review.switchMode', entitlement.getProductEntitlementTier());
  const save = entitlement.decideCommandEntitlement('cmd.project.save', entitlement.getProductEntitlementTier());
  assert.equal(optional.available, false);
  assert.equal(optional.access, 'pro_complexity_surface');
  assert.equal(optional.reason, 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE');
  assert.equal(save.available, true);
  assert.equal(save.access, 'free_authorship');
  rows.push(verdict.createWriterDnaObservation({
    rowId: 'DNA_OPTIONAL_OFF_PRESERVES_FREE_AUTHORSHIP',
    source: 'src/core/entitlement-law-v1.cjs',
    observed: { optional, save, mode: entitlement.ENTITLEMENT_AUTHORITY_MODE },
  }));

  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
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
  rows.push(verdict.createWriterDnaObservation({
    rowId: 'DNA_NO_BLOAT_HAS_ONLY_APPROVED_PRODUCT_DEPENDENCIES',
    source: 'package.json',
    observed: { dependencyCount: dependencies.length, blocked },
  }));

  return rows;
}

function assertPass(result) {
  assert.equal(result.ok, true);
  assert.equal(result.code, 'R24_WP207_WRITER_V0_RUNTIME_VERDICT_COMPILED');
  assert.equal(result.profileVerdict.profileId, 'WRITER_CORE');
  assert.equal(result.profileVerdict.verdict, 'WRITER_CORE_RUNTIME_REFINEMENT_BOUND_BY_F0_DNA_AND_SAFE_DENY');
  assert.equal(result.profileVerdict.claimCeiling, 'PROFILE_VERDICT_ONLY');
  assert.deepEqual(result.profileVerdict.requiredDnaRows, REQUIRED_ROW_IDS);
  assert.deepEqual(result.profileVerdict.requiredDnaDimensions, ['calm', 'disclosure', 'continuity', 'customization', 'optional-off', 'no-bloat']);
  assert.equal(result.profileVerdict.requiredDnaRowCount, 6);
  assert.equal(result.profileVerdict.closedDnaRowCount, 6);
  assert.match(result.profileVerdict.observationDigest, /^[a-f0-9]{64}$/u);
  assert.equal(result.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(result.globalScalarPassForbidden, true);
  assert.equal(result.nonClaims.includes('NO_PROGRAM_DONE'), true);
  assert.equal(result.nonClaims.includes('NO_ENTITLEMENT_ENABLEMENT'), true);
  assert.deepEqual(result.optionalProfilesExcluded, ['ATLAS_MAPS_DERIVED', 'WORD_ROUNDTRIP', 'PACKAGED_RELEASE_SECURITY']);
  assert.equal(result.materiality.includes('INVARIANT_NEWLY_ENFORCED'), true);
}

test('WP207 compiles a bounded Writer V0 verdict from complete DNA rows', () => {
  const result = verdict.compileWriterV0RuntimeVerdict({
    observedRows: syntheticRows(),
    exactIdentity: {
      headSha: 'a'.repeat(40),
      treeSha: 'b'.repeat(40),
      source: 'WP207_SYNTHETIC',
    },
  });
  assertPass(result);
  assert.deepEqual(result.exactIdentity, {
    headSha: 'a'.repeat(40),
    treeSha: 'b'.repeat(40),
    source: 'WP207_SYNTHETIC',
  });
});

test('WP207 compiles the same verdict from live runtime DNA observations', async () => {
  const rows = await liveRows();
  const result = verdict.compileWriterV0RuntimeVerdict({
    observedRows: rows,
    exactIdentity: {
      headSha: 'c'.repeat(40),
      treeSha: 'd'.repeat(40),
      source: 'WP207_LIVE_TEST_OBSERVATION',
    },
  });
  assertPass(result);
  console.log(`R24_WP207_WRITER_REFINEMENT_RECEIPT=${JSON.stringify({
    verdict: result.verdict,
    profile: result.profileVerdict.profileId,
    dnaRows: result.profileVerdict.closedDnaRowCount,
    observationDigest: result.profileVerdict.observationDigest,
    nonClaims: result.nonClaims,
  })}`);
});

test('WP207 fails closed for missing, duplicate, unknown, failed, skipped and weak evidence rows', () => {
  const rows = syntheticRows();
  const withoutLast = rows.slice(0, -1);
  assert.equal(verdict.compileWriterV0RuntimeVerdict({ observedRows: withoutLast }).code, 'E_R24_WP207_DNA_ROW_MISSING');

  const wrongSchema = [{ ...rows[0], schemaVersion: 'writer-dna-observation.v0' }, ...rows.slice(1)];
  assert.equal(verdict.compileWriterV0RuntimeVerdict({ observedRows: wrongSchema }).code, 'E_R24_WP207_DNA_ROW_SCHEMA_VERSION');

  const duplicate = [...rows, rows[0]];
  assert.equal(verdict.compileWriterV0RuntimeVerdict({ observedRows: duplicate }).code, 'E_R24_WP207_DNA_ROW_DUPLICATE');

  const unknown = [...rows.slice(1), { ...rows[0], rowId: 'DNA_UNKNOWN' }];
  assert.equal(verdict.compileWriterV0RuntimeVerdict({ observedRows: unknown }).code, 'E_R24_WP207_DNA_ROW_UNKNOWN');

  const failed = [{ ...rows[0], status: 'FAIL' }, ...rows.slice(1)];
  assert.equal(verdict.compileWriterV0RuntimeVerdict({ observedRows: failed }).code, 'E_R24_WP207_DNA_ROW_NOT_PASS');

  const skipped = [{ ...rows[0], skipped: true }, ...rows.slice(1)];
  assert.equal(verdict.compileWriterV0RuntimeVerdict({ observedRows: skipped }).code, 'E_R24_WP207_DNA_ROW_SKIPPED');

  const weak = [{ ...rows[0], evidenceClass: 'TOPOLOGY_ONLY' }, ...rows.slice(1)];
  assert.equal(verdict.compileWriterV0RuntimeVerdict({ observedRows: weak }).code, 'E_R24_WP207_DNA_EVIDENCE_CLASS');

  const badDigest = [{ ...rows[0], digest: 'not-a-digest' }, ...rows.slice(1)];
  assert.equal(verdict.compileWriterV0RuntimeVerdict({ observedRows: badDigest }).code, 'E_R24_WP207_DNA_ROW_DIGEST_SHAPE');

  const mismatch = [{ ...rows[0], digest: '0'.repeat(64) }, ...rows.slice(1)];
  assert.equal(verdict.compileWriterV0RuntimeVerdict({ observedRows: mismatch }).code, 'E_R24_WP207_DNA_ROW_DIGEST_MISMATCH');
});

test('WP207 rejects optional profile imports, release overclaims, program PASS and invalid identity', () => {
  const rows = syntheticRows();

  assert.equal(verdict.compileWriterV0RuntimeVerdict({
    observedRows: rows,
    claimRequest: { profiles: ['WRITER_CORE', 'WORD_ROUNDTRIP'] },
  }).code, 'E_R24_WP207_OPTIONAL_PROFILE_IMPORTED');

  assert.equal(verdict.compileWriterV0RuntimeVerdict({
    observedRows: rows,
    claimRequest: { claimCeiling: 'SUPPORTED_RELEASE_TARGETS_ONLY' },
  }).code, 'E_R24_WP207_OVERCLAIM');

  assert.equal(verdict.compileWriterV0RuntimeVerdict({
    observedRows: rows,
    claimRequest: { programVerdict: 'PASS' },
  }).code, 'E_R24_WP207_PROGRAM_SCALAR_PASS_FORBIDDEN');

  assert.equal(verdict.compileWriterV0RuntimeVerdict({
    observedRows: rows,
    exactIdentity: { headSha: 'not-a-sha' },
  }).code, 'E_R24_WP207_EXACT_IDENTITY_SHAPE');
});

test('WP207 Product Core compiler does not import renderer, Electron, filesystem, or OPS evidence scripts', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  assert.equal(source.includes('src/renderer'), false);
  assert.equal(source.includes('electron'), false);
  assert.equal(source.includes('node:fs'), false);
  assert.equal(source.includes('scripts/ops'), false);
  assert.equal(source.includes('docs/OPS'), false);
});

function requireFresh(tempRoot) {
  const modulePath = path.join(tempRoot, MODULE_REL);
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function materializeMutant(mutant) {
  const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp207-mutant-')));
  const target = path.join(tempRoot, MODULE_REL);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const occurrences = source.split(mutant.find).length - 1;
  assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  return { tempRoot, module: requireFresh(tempRoot) };
}

const MUTANTS = Object.freeze([
  {
    id: 'missing-row-admitted',
    find: "  if (missing.length > 0) return fail('E_R24_WP207_DNA_ROW_MISSING', missing.join(','), { missing });",
    replace: "  if (false && missing.length > 0) return fail('E_R24_WP207_DNA_ROW_MISSING', missing.join(','), { missing });",
    oracle(module) {
      assert.equal(module.compileWriterV0RuntimeVerdict({ observedRows: syntheticRows().slice(0, -1) }).code, 'E_R24_WP207_DNA_ROW_MISSING');
    },
  },
  {
    id: 'duplicate-row-admitted',
    find: "    if (byId.has(row.rowId)) return fail('E_R24_WP207_DNA_ROW_DUPLICATE', row.rowId, { rowId: row.rowId });",
    replace: "    if (false && byId.has(row.rowId)) return fail('E_R24_WP207_DNA_ROW_DUPLICATE', row.rowId, { rowId: row.rowId });",
    oracle(module) {
      const rows = syntheticRows();
      assert.equal(module.compileWriterV0RuntimeVerdict({ observedRows: [...rows, rows[0]] }).code, 'E_R24_WP207_DNA_ROW_DUPLICATE');
    },
  },
  {
    id: 'failed-row-admitted',
    find: "    if (row.status !== 'PASS') return fail('E_R24_WP207_DNA_ROW_NOT_PASS', row.rowId, { rowId: row.rowId, status: row.status });",
    replace: "    if (false && row.status !== 'PASS') return fail('E_R24_WP207_DNA_ROW_NOT_PASS', row.rowId, { rowId: row.rowId, status: row.status });",
    oracle(module) {
      const rows = syntheticRows();
      assert.equal(module.compileWriterV0RuntimeVerdict({ observedRows: [{ ...rows[0], status: 'FAIL' }, ...rows.slice(1)] }).code, 'E_R24_WP207_DNA_ROW_NOT_PASS');
    },
  },
  {
    id: 'digest-mismatch-admitted',
    find: "    if (row.digest !== expectedDigest) {\n      return fail('E_R24_WP207_DNA_ROW_DIGEST_MISMATCH', row.rowId, { rowId: row.rowId, expectedDigest, actualDigest: row.digest });\n    }",
    replace: "    if (false && row.digest !== expectedDigest) {\n      return fail('E_R24_WP207_DNA_ROW_DIGEST_MISMATCH', row.rowId, { rowId: row.rowId, expectedDigest, actualDigest: row.digest });\n    }",
    oracle(module) {
      const rows = syntheticRows();
      assert.equal(module.compileWriterV0RuntimeVerdict({ observedRows: [{ ...rows[0], digest: '0'.repeat(64) }, ...rows.slice(1)] }).code, 'E_R24_WP207_DNA_ROW_DIGEST_MISMATCH');
    },
  },
  {
    id: 'optional-profile-import-admitted',
    find: "  if (optionalProfiles.length > 0) return fail('E_R24_WP207_OPTIONAL_PROFILE_IMPORTED', optionalProfiles.join(','), { optionalProfiles });",
    replace: "  if (false && optionalProfiles.length > 0) return fail('E_R24_WP207_OPTIONAL_PROFILE_IMPORTED', optionalProfiles.join(','), { optionalProfiles });",
    oracle(module) {
      assert.equal(module.compileWriterV0RuntimeVerdict({
        observedRows: syntheticRows(),
        claimRequest: { profiles: ['WRITER_CORE', 'WORD_ROUNDTRIP'] },
      }).code, 'E_R24_WP207_OPTIONAL_PROFILE_IMPORTED');
    },
  },
  {
    id: 'program-pass-admitted',
    find: "  if (request.programVerdict === 'PASS' || request.globalScalarPass === true) {",
    replace: "  if (false && (request.programVerdict === 'PASS' || request.globalScalarPass === true)) {",
    oracle(module) {
      assert.equal(module.compileWriterV0RuntimeVerdict({
        observedRows: syntheticRows(),
        claimRequest: { programVerdict: 'PASS' },
      }).code, 'E_R24_WP207_PROGRAM_SCALAR_PASS_FORBIDDEN');
    },
  },
]);

test('WP207 implementation mutants are killed by the verdict oracle', () => {
  for (const mutant of MUTANTS) mutant.oracle(verdict);

  const results = [];
  for (const mutant of MUTANTS) {
    const { tempRoot, module } = materializeMutant(mutant);
    let killed = false;
    let detail = '';
    try {
      mutant.oracle(module);
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    results.push({ id: mutant.id, killed, detail });
  }

  const survived = results.filter((result) => !result.killed);
  console.log(`R24_WP207_MUTATION_RECEIPT=${JSON.stringify({
    total: results.length,
    killed: results.length - survived.length,
    survived: survived.map((result) => result.id),
    score: results.length ? (results.length - survived.length) / results.length : 0,
  })}`);
  assert.equal(results.length, MUTANTS.length);
  assert.deepEqual(survived, []);
});
