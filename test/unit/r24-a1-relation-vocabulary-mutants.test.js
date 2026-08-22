'use strict';

// R2.4 A1 mutation proof: optional/nonblocking, no-promotion, no-product-write,
// duplicate handling, and capability guards are inverted in isolated module
// copies. The oracle must kill every mutant.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src', 'derived', 'atlas', 'deriveAtlasOptionalRelationVocabulary.mjs');

const MUTANTS = Object.freeze([
  {
    id: 'optional-nonblocking-inverted',
    find: 'const OPTIONAL_NON_BLOCKING = true;',
    replace: 'const OPTIONAL_NON_BLOCKING = false;',
  },
  {
    id: 'writer-blocking-enabled',
    find: 'const WRITER_BLOCKING = false;',
    replace: 'const WRITER_BLOCKING = true;',
  },
  {
    id: 'program-verdict-contribution-enabled',
    find: 'const PROGRAM_VERDICT_CONTRIBUTION = false;',
    replace: 'const PROGRAM_VERDICT_CONTRIBUTION = true;',
  },
  {
    id: 'project-truth-mutation-enabled',
    find: 'const PROJECT_TRUTH_MUTATION = false;',
    replace: 'const PROJECT_TRUTH_MUTATION = true;',
  },
  {
    id: 'duplicate-normalized-label-admitted',
    find: '    if (seenAuthorLabels.has(row.normalizedLabel)) {',
    replace: '    if (false && seenAuthorLabels.has(row.normalizedLabel)) {',
  },
  {
    id: 'capability-disabled-admitted',
    find: '      if (!isOptionalRelationVocabularyCapabilityEnabled(capabilitySnapshot)) {',
    replace: '      if (false && !isOptionalRelationVocabularyCapabilityEnabled(capabilitySnapshot)) {',
  },
]);

async function importModule(modulePath) {
  return import(`${pathToFileURL(modulePath).href}?t=${Date.now()}-${Math.random()}`);
}

function fixtureState() {
  return {
    schemaVersion: 1,
    data: {
      projects: {
        'mutant-project': {
          projectId: 'mutant-project',
          atlas: {
            relationVocabulary: {
              ally: { id: 'ally', label: 'Ally' },
              duplicate: { id: 'duplicate', label: 'ally' },
            },
          },
          scenes: {},
        },
      },
    },
  };
}

function rewriteImports(source) {
  return source
    .replace(
      "from '../deriveView.mjs'",
      `from '${pathToFileURL(path.join(ROOT, 'src', 'derived', 'deriveView.mjs')).href}'`,
    )
    .replace(
      "from './deriveAtlasTemporalContinuity.mjs'",
      `from '${pathToFileURL(path.join(ROOT, 'src', 'derived', 'atlas', 'deriveAtlasTemporalContinuity.mjs')).href}'`,
    )
    .replace(
      "from './atlasOptionalRelationVocabularyTypes.mjs'",
      `from '${pathToFileURL(path.join(ROOT, 'src', 'derived', 'atlas', 'atlasOptionalRelationVocabularyTypes.mjs')).href}'`,
    );
}

async function killOracle(module) {
  const result = module.deriveAtlasOptionalRelationVocabulary({
    coreState: fixtureState(),
    params: { projectId: 'mutant-project' },
    capabilitySnapshot: {
      capabilities: {
        atlasOptionalRelationVocabulary: true,
        atlasTemporalContinuity: false,
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.state, 'degraded');
  assert.equal(result.value.summary.rejectedRowCount, 1);
  assert.equal(result.value.rejectedRows[0].code, 'RELATION_VOCABULARY_DUPLICATE_NORMALIZED_LABEL');
  assert.equal(result.value.programBinding.optionalNonBlocking, true);
  assert.equal(result.value.programBinding.writerBlocking, false);
  assert.equal(result.value.programBinding.programVerdictContribution, false);
  assert.equal(result.value.authority.optionalNonBlocking, true);
  assert.equal(result.value.authority.writerBlocking, false);
  assert.equal(result.value.authority.programVerdictContribution, false);
  assert.equal(result.value.authority.projectTruthMutation, false);
  assert.equal(result.value.authorVocabularyRows.every((row) => row.projectTruthMutation === false), true);
  assert.equal(result.value.summary.projectTruthMutation, false);

  const disabled = module.deriveAtlasOptionalRelationVocabulary({
    coreState: fixtureState(),
    params: { projectId: 'mutant-project' },
    capabilitySnapshot: { capabilities: { atlasOptionalRelationVocabulary: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
}

function materializeMutant(source, mutant) {
  const occurrences = source.split(mutant.find).length - 1;
  assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-a1-mutant-')));
  const modulePath = path.join(dir, 'deriveAtlasOptionalRelationVocabulary.mjs');
  fs.writeFileSync(modulePath, rewriteImports(source.replace(mutant.find, mutant.replace)));
  return { dir, modulePath };
}

test('A1 optional relation vocabulary mutants are executed and killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  await killOracle(await importModule(MODULE_PATH));

  const results = [];
  for (const mutant of MUTANTS) {
    const { dir, modulePath } = materializeMutant(source, mutant);
    let killed = false;
    let detail = '';
    try {
      await killOracle(await importModule(modulePath));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((result) => !result.killed);
  console.log(`R24_A1_MUTATION_RECEIPT=${JSON.stringify({
    total: results.length,
    killed: results.length - survived.length,
    survived: survived.map((result) => result.id),
    score: results.length ? (results.length - survived.length) / results.length : 0,
  })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
