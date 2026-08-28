import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import {
  ACCEPTANCE_SIGNALS_DIGEST,
  C6BWriterHomeComputedStyleContractError,
  ELECTRON_ARCHIVE_DIGEST,
  ELECTRON_VERSION,
  PATHS,
  STAGE_ADMISSION_DIGEST,
  STAGE_INSTANCE_DIGEST,
  WRITE_SET_DIGEST,
  assertCssContractText,
  buildArtifacts,
} from '../../scripts/ops/r24/corrective/c6b-writer-home-computed-style.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function mutateOnce(source, before, after) {
  assert.equal(source.split(before).length - 1, 1, `one mutation target: ${before}`);
  return source.replace(before, after);
}

test('C6B CSS contract kills seven responsive, dark, focus, and visibility mutants', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, PATHS.styles), 'utf8');
  assert.equal(assertCssContractText(source), true);
  const mutants = [
    {
      id: 'MEDIUM_GENERIC_SELECTOR_LOSES_TO_LITERAL_STAGE',
      source: mutateOnce(
        source,
        '  .main-content,\n  .literal-stage-a .main-content {\n    padding: 28px;\n  }',
        '  .main-content {\n    padding: 28px;\n  }',
      ),
    },
    {
      id: 'NARROW_GENERIC_SELECTOR_LOSES_TO_LITERAL_STAGE',
      source: mutateOnce(
        source,
        '  .main-content,\n  .literal-stage-a .main-content {\n    padding: 24px;\n  }',
        '  .main-content {\n    padding: 24px;\n  }',
      ),
    },
    {
      id: 'DESKTOP_PADDING_DRIFT',
      source: mutateOnce(source, '  padding: 44px 0 56px;', '  padding: 40px 0 56px;'),
    },
    {
      id: 'DARK_WRITER_HOME_BACKGROUND_NOT_TRANSPARENT',
      source: mutateOnce(
        source,
        'body.dark-theme .empty-state.writer-home {\n  color: rgba(255, 253, 248, 0.88);\n  background: transparent;\n}',
        'body.dark-theme .empty-state.writer-home {\n  color: rgba(255, 253, 248, 0.88);\n}',
      ),
    },
    {
      id: 'KEYBOARD_FOCUS_OUTLINE_REMOVED',
      source: mutateOnce(
        source,
        '.writer-home__action:focus-visible,\n.writer-home__dismiss:focus-visible {\n  outline: 2px solid rgba(67, 93, 86, 0.42);',
        '.writer-home__action:focus-visible,\n.writer-home__dismiss:focus-visible {\n  outline: 0 solid rgba(67, 93, 86, 0.42);',
      ),
    },
    {
      id: 'VISIBLE_STATE_DISPLAY_DRIFT',
      source: mutateOnce(
        source,
        '.literal-stage-a .empty-state.writer-home:not(.hidden) {\n  display: flex;\n}',
        '.literal-stage-a .empty-state.writer-home:not(.hidden) {\n  display: block;\n}',
      ),
    },
    {
      id: 'HIDDEN_STATE_DISPLAY_DRIFT',
      source: mutateOnce(
        source,
        '.literal-stage-a .empty-state.writer-home.hidden,\n.empty-state.writer-home.hidden {\n  display: none;\n}',
        '.literal-stage-a .empty-state.writer-home.hidden,\n.empty-state.writer-home.hidden {\n  display: flex;\n}',
      ),
    },
  ];
  for (const mutant of mutants) {
    assert.throws(
      () => assertCssContractText(mutant.source),
      C6BWriterHomeComputedStyleContractError,
      mutant.id,
    );
  }
  console.log(`R24_C6B_MUTATION_RECEIPT=${JSON.stringify({ total: mutants.length, killed: mutants.length, survived: [] })}`);
});

test('C6B generated contract binds exact source bytes and labels fixture versus product integration', () => {
  const { contract, matrix } = buildArtifacts(REPO_ROOT);
  assert.equal(contract.status, 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION');
  assert.equal(contract.signals.EXTERNAL_TERMINAL_ATTESTATION_VERIFIED, 'PENDING_POST_MERGE_EXTERNAL_C6B_ATTESTATION');
  assert.equal(contract.oracleBoundary.executionClass, 'DETERMINISTIC_TEMP_FIXTURE');
  assert.equal(contract.oracleBoundary.productIntegrationClaim, 'BYTE_BOUND_FIXTURE_NOT_PRODUCT_E2E');
  assert.equal(contract.oracleBoundary.electronVersion, ELECTRON_VERSION);
  assert.equal(contract.sourceBindings.electronArchive.sha256, ELECTRON_ARCHIVE_DIGEST);
  assert.equal(contract.sourceBindings.stageInstanceDigest, STAGE_INSTANCE_DIGEST);
  assert.equal(contract.sourceBindings.stageAdmissionDigest, STAGE_ADMISSION_DIGEST);
  assert.equal(contract.sourceBindings.acceptanceSignalsDigest, ACCEPTANCE_SIGNALS_DIGEST);
  assert.equal(contract.sourceBindings.writeSetDigest, WRITE_SET_DIGEST);
  for (const binding of [
    contract.sourceBindings.styles,
    contract.sourceBindings.productIndex,
    contract.sourceBindings.writerHomeSurface,
    contract.sourceBindings.contractTest,
    contract.sourceBindings.wp300RegressionTest,
    contract.sourceBindings.testInventory,
    contract.sourceBindings.generator,
  ]) {
    assert.match(binding.capabilityId, /^CAP_R24_[A-Z0-9_]+$/u);
    assert.equal(/[\\/]/u.test(binding.capabilityId), false);
    assert.match(binding.sha256, /^[0-9a-f]{64}$/u);
    assert.ok(binding.sizeBytes > 0);
  }
  assert.equal(matrix.executionClass, 'DETERMINISTIC_TEMP_FIXTURE');
  assert.equal(matrix.productIntegrationClass, 'EXACT_BYTES_BOUND_FIXTURE_NOT_FULL_PRODUCT_BOOT');
  assert.equal(matrix.vectors.find(({ vectorId }) => vectorId === 'C6B-V09').fullProductBootClaimed, false);
});

test('C6B generated contract and matrix bytes are exact canonical generator output', () => {
  const artifacts = buildArtifacts(REPO_ROOT);
  for (const [relativePath, value] of [
    [PATHS.contract, artifacts.contract],
    [PATHS.matrix, artifacts.matrix],
  ]) {
    const actual = fs.readFileSync(path.join(REPO_ROOT, relativePath));
    const expected = canonicalBytes(value);
    assert.equal(actual.equals(expected), true, `${path.basename(relativePath)} exact canonical bytes`);
    assert.equal(sha256(actual), sha256(expected), `${path.basename(relativePath)} exact digest`);
  }
});

test('C6B protected stage controls remain byte-identical to admission bindings', () => {
  assert.equal(
    sha256(fs.readFileSync(path.join(REPO_ROOT, PATHS.stageInstance))),
    STAGE_INSTANCE_DIGEST,
  );
  assert.equal(
    sha256(fs.readFileSync(path.join(REPO_ROOT, PATHS.stageAdmission))),
    STAGE_ADMISSION_DIGEST,
  );
});
