#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalBytes, canonicalize, readCanonicalJson } from './canonical-json.mjs';
import {
  FIXED_BINDINGS,
  assert,
  assertClosedObject,
  assertExactJson,
  assertHex,
  assertUniqueStrings,
  fail,
  sha256,
  validateAcceptanceResultBundle,
} from './audit-r1-corrections.mjs';

export function buildRecertificationPlan(registry) {
  assert(Array.isArray(registry.stages) && registry.stages.length === 33, 'E_RECERT_STAGE_COUNT', registry.stages?.length);
  return {
    schemaVersion: 'AUDIT_R1_RECERTIFICATION_PLAN_V1',
    programId: 'YALKEN_R24_CORRECTIVE_RECOVERY_AND_RESUME_V1_1',
    programTemplateDigest: FIXED_BINDINGS.programTemplateDigest,
    stageRegistryDigest: FIXED_BINDINGS.stageRegistryDigest,
    recertificationMode: 'FRESH_EXACT_HEAD_COMPLETE_CHAIN_WITH_AUTHENTIC_ACCEPTANCE_BUNDLE',
    priorOutcomeBindingStatus: 'INVALIDATED_BY_AUDIT_R1_FINDINGS_001_AND_003',
    stages: registry.stages.map((stage, index) => ({
      order: index,
      stageId: stage.stageId,
      dependencies: [...stage.dependencies],
      requiredAcceptanceSignals: [...stage.requiredAcceptanceSignals],
    })),
    terminalRule: 'NO_STAGE_IS_RECERTIFIED_UNTIL_DOWNLOADED_ZIP_AND_TERMINAL_ENVELOPE_VERIFY',
    programDoneClaimed: false,
  };
}

export function validateRecertificationPlan(plan, registry) {
  assertClosedObject(plan, ['schemaVersion', 'programId', 'programTemplateDigest', 'stageRegistryDigest', 'recertificationMode', 'priorOutcomeBindingStatus', 'stages', 'terminalRule', 'programDoneClaimed'], ['schemaVersion', 'programId', 'programTemplateDigest', 'stageRegistryDigest', 'recertificationMode', 'priorOutcomeBindingStatus', 'stages', 'terminalRule', 'programDoneClaimed'], 'recertificationPlan');
  assertExactJson(plan, buildRecertificationPlan(registry), 'E_RECERT_PLAN_MISMATCH', 'plan');
  assert(plan.programDoneClaimed === false, 'E_PROGRAM_DONE_OVERCLAIM', 'plan');
  return true;
}

export function compileAcceptanceBundle({ requirementsFile, resultFiles, evaluationSha, evaluationTreeSha }) {
  const requirements = requirementsFile.value;
  assertHex(evaluationSha, 40, 'evaluationSha');
  assertHex(evaluationTreeSha, 40, 'evaluationTreeSha');
  const byId = new Map();
  for (const file of resultFiles) {
    const bytes = fs.readFileSync(file);
    const value = JSON.parse(bytes.toString('utf8'));
    assert(bytes.equals(canonicalBytes(value)), 'E_RESULT_NON_CANONICAL', path.basename(file));
    assert(typeof value.id === 'string' && !byId.has(value.id), 'E_RESULT_DUPLICATE', value.id);
    byId.set(value.id, value);
  }
  const results = requirements.requiredOutcomes.map((requirement) => {
    const result = byId.get(requirement.id);
    assert(result, 'E_RESULT_MISSING', requirement.id);
    return result;
  });
  assert(byId.size === results.length, 'E_RESULT_EXTRA', `${byId.size}/${results.length}`);
  const bundle = {
    schemaVersion: 'AUDIT_R1_ACCEPTANCE_RESULT_BUNDLE_V1',
    bundleId: 'YALKEN_R24_AUDIT_R1_COMPLETE_CHAIN_ACCEPTANCE',
    evaluationSha,
    evaluationTreeSha,
    requirementsDigest: requirementsFile.digest,
    results,
    status: results.every((entry) => entry.status === 'PASS' && entry.exitCode === 0) ? 'PASS' : 'FAIL',
  };
  validateAcceptanceResultBundle(bundle, requirements);
  return bundle;
}

export function validateEvidenceMatrix(matrix, registry, requirements) {
  assertClosedObject(matrix, ['schemaVersion', 'programTemplateDigest', 'stageRegistryDigest', 'requiredOutcomeIds', 'stages', 'findings', 'terminalFinalization'], ['schemaVersion', 'programTemplateDigest', 'stageRegistryDigest', 'requiredOutcomeIds', 'stages', 'findings', 'terminalFinalization'], 'evidenceMatrix');
  assert(matrix.schemaVersion === 'AUDIT_R1_REQUIREMENT_EVIDENCE_MATRIX_V1', 'E_MATRIX_SCHEMA', matrix.schemaVersion);
  assert(matrix.programTemplateDigest === FIXED_BINDINGS.programTemplateDigest && matrix.stageRegistryDigest === FIXED_BINDINGS.stageRegistryDigest, 'E_MATRIX_BINDING', 'fixed');
  const outcomeIds = requirements.requiredOutcomes.map((entry) => entry.id);
  assertUniqueStrings(outcomeIds, 'requirements.requiredOutcomes');
  assertExactJson(matrix.requiredOutcomeIds, outcomeIds, 'E_MATRIX_OUTCOMES', 'requiredOutcomeIds');
  assert(Array.isArray(matrix.stages) && matrix.stages.length === 33, 'E_MATRIX_STAGE_COUNT', matrix.stages?.length);
  const stageResultIds = registry.stages.map((stage) => `STAGE_${stage.stageId}_ACCEPTANCE_INPUTS`);
  for (let index = 0; index < registry.stages.length; index += 1) {
    const expected = registry.stages[index];
    const actual = matrix.stages[index];
    assertClosedObject(actual, ['stageId', 'stageResultId', 'dependencies', 'requiredAcceptanceSignals', 'signalEvidence'], ['stageId', 'stageResultId', 'dependencies', 'requiredAcceptanceSignals', 'signalEvidence'], `matrix.stages.${index}`);
    assert(actual.stageId === expected.stageId, 'E_MATRIX_STAGE_ORDER', actual.stageId);
    assert(actual.stageResultId === stageResultIds[index] && outcomeIds.includes(actual.stageResultId), 'E_MATRIX_STAGE_RESULT_ID', actual.stageId);
    assertExactJson(actual.dependencies, expected.dependencies, 'E_MATRIX_DEPENDENCY', actual.stageId);
    assertExactJson(actual.requiredAcceptanceSignals, expected.requiredAcceptanceSignals, 'E_MATRIX_SIGNAL_SET', actual.stageId);
    assert(Array.isArray(actual.signalEvidence) && actual.signalEvidence.length === actual.requiredAcceptanceSignals.length, 'E_MATRIX_SIGNAL_EVIDENCE', actual.stageId);
    for (let signalIndex = 0; signalIndex < actual.requiredAcceptanceSignals.length; signalIndex += 1) {
      const evidence = actual.signalEvidence[signalIndex];
      assertClosedObject(evidence, ['signal', 'outcomeIds', 'terminalEnvelopeRequired'], ['signal', 'outcomeIds', 'terminalEnvelopeRequired'], `${actual.stageId}.signalEvidence.${signalIndex}`);
      assert(evidence.signal === actual.requiredAcceptanceSignals[signalIndex], 'E_MATRIX_SIGNAL_ORDER', evidence.signal);
      assert(Array.isArray(evidence.outcomeIds) && evidence.outcomeIds.every((id) => outcomeIds.includes(id) && !stageResultIds.includes(id)), 'E_MATRIX_UNKNOWN_OR_CIRCULAR_OUTCOME', evidence.signal);
      if (evidence.signal === 'EXTERNAL_TERMINAL_ATTESTATION_VERIFIED') assert(evidence.terminalEnvelopeRequired === true, 'E_MATRIX_TERMINAL_WEAKENED', actual.stageId);
      else assert(evidence.outcomeIds.length > 0, 'E_MATRIX_SIGNAL_UNCOVERED', `${actual.stageId}:${evidence.signal}`);
    }
  }
  const findingIds = Array.from({ length: 11 }, (_, index) => `R24-R1-${String(index + 1).padStart(3, '0')}`);
  assertExactJson(matrix.findings.map((entry) => entry.findingId), findingIds, 'E_MATRIX_FINDING_SET', 'findings');
  for (const finding of matrix.findings) {
    assertClosedObject(finding, ['findingId', 'outcomeIds', 'carrierIds'], ['findingId', 'outcomeIds', 'carrierIds'], `finding.${finding?.findingId}`);
    assert(finding.outcomeIds.length > 0 && finding.outcomeIds.every((id) => outcomeIds.includes(id)), 'E_MATRIX_FINDING_UNCOVERED', finding.findingId);
    assert(Array.isArray(finding.carrierIds), 'E_MATRIX_CARRIER_IDS', finding.findingId);
  }
  assert(matrix.terminalFinalization === 'DOWNLOADED_IMMUTABLE_ZIP_VERIFIER_REQUIRED_FOR_ALL_33_STAGES', 'E_MATRIX_TERMINAL_RULE', matrix.terminalFinalization);
  return true;
}

function readCanonicalResults(resultFiles) {
  const byId = new Map();
  for (const file of resultFiles) {
    const bytes = fs.readFileSync(file);
    const value = JSON.parse(bytes.toString('utf8'));
    assert(bytes.equals(canonicalBytes(value)), 'E_RESULT_NON_CANONICAL', path.basename(file));
    assert(typeof value.id === 'string' && !byId.has(value.id), 'E_RESULT_DUPLICATE', value.id);
    byId.set(value.id, value);
  }
  return byId;
}

export function compileStageAcceptanceResults({ registry, matrix, baseResults, evaluationSha, evaluationTreeSha }) {
  assertHex(evaluationSha, 40, 'evaluationSha');
  assertHex(evaluationTreeSha, 40, 'evaluationTreeSha');
  const resultsById = baseResults instanceof Map ? baseResults : new Map(baseResults.map((entry) => [entry.id, entry]));
  const stageResultIds = new Set(registry.stages.map((stage) => `STAGE_${stage.stageId}_ACCEPTANCE_INPUTS`));
  return matrix.stages.map((stage, index) => {
    const registered = registry.stages[index];
    assert(stage.stageId === registered.stageId, 'E_STAGE_ACCEPTANCE_ORDER', stage.stageId);
    const sourceIds = [...new Set(stage.signalEvidence.flatMap((evidence) => evidence.outcomeIds))].sort();
    assert(sourceIds.length > 0, 'E_STAGE_ACCEPTANCE_SOURCE_SET', stage.stageId);
    const sources = sourceIds.map((id) => {
      assert(!stageResultIds.has(id), 'E_STAGE_ACCEPTANCE_CIRCULAR', `${stage.stageId}:${id}`);
      const result = resultsById.get(id);
      assert(result, 'E_STAGE_ACCEPTANCE_RESULT_MISSING', `${stage.stageId}:${id}`);
      assert(result.status === 'PASS' && result.exitCode === 0, 'E_STAGE_ACCEPTANCE_RESULT_NOT_PASS', `${stage.stageId}:${id}`);
      return {
        commandDigest: result.commandDigest,
        evidenceDigest: result.evidenceDigest,
        id: result.id,
        source: result.source,
      };
    });
    const evidence = {
      schemaVersion: 'AUDIT_R1_STAGE_ACCEPTANCE_INPUTS_V1',
      stageId: stage.stageId,
      stageResultId: stage.stageResultId,
      dependencies: stage.dependencies,
      requiredAcceptanceSignals: stage.requiredAcceptanceSignals,
      signalEvidence: stage.signalEvidence,
      evaluationSha,
      evaluationTreeSha,
      sources,
      terminalFinalization: matrix.terminalFinalization,
    };
    return {
      id: stage.stageResultId,
      status: 'PASS',
      exitCode: 0,
      commandDigest: sha256(Buffer.from(`audit-r1 stage acceptance inputs ${stage.stageId}\n`, 'utf8')),
      evidenceDigest: sha256(canonicalBytes(evidence)),
      source: 'GITHUB_ACTIONS_JOB',
    };
  });
}

export function validateStageAcceptanceResults({ bundle, registry, matrix }) {
  const stageResultIds = new Set(registry.stages.map((stage) => `STAGE_${stage.stageId}_ACCEPTANCE_INPUTS`));
  const baseResults = bundle.results.filter((entry) => !stageResultIds.has(entry.id));
  const expected = compileStageAcceptanceResults({
    registry,
    matrix,
    baseResults,
    evaluationSha: bundle.evaluationSha,
    evaluationTreeSha: bundle.evaluationTreeSha,
  });
  const actual = bundle.results.filter((entry) => stageResultIds.has(entry.id));
  assertExactJson(actual, expected, 'E_STAGE_ACCEPTANCE_RESULT_MISMATCH', 'bundle.stageAcceptanceInputs');
  return true;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    const key = argv[index].slice(2);
    if (key === 'result') {
      result.result ??= [];
      result.result.push(argv[++index]);
    } else result[key] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options['compile-bundle'] === true) {
      for (const key of ['requirements', 'evaluation-sha', 'evaluation-tree', 'write']) assert(options[key], 'E_USAGE', `--${key}`);
      const bundle = compileAcceptanceBundle({
        requirementsFile: readCanonicalJson(options.requirements),
        resultFiles: options.result ?? [],
        evaluationSha: options['evaluation-sha'],
        evaluationTreeSha: options['evaluation-tree'],
      });
      fs.writeFileSync(options.write, canonicalBytes(bundle), { flag: 'wx' });
    } else if (options['compile-stage-results'] === true) {
      for (const key of ['registry', 'matrix', 'evaluation-sha', 'evaluation-tree', 'write-dir']) assert(options[key], 'E_USAGE', `--${key}`);
      const registry = readCanonicalJson(options.registry);
      const matrix = readCanonicalJson(options.matrix);
      const results = compileStageAcceptanceResults({
        registry: registry.value,
        matrix: matrix.value,
        baseResults: readCanonicalResults(options.result ?? []),
        evaluationSha: options['evaluation-sha'],
        evaluationTreeSha: options['evaluation-tree'],
      });
      fs.mkdirSync(options['write-dir'], { recursive: true });
      for (const result of results) fs.writeFileSync(path.join(options['write-dir'], `${result.id}.json`), canonicalBytes(result), { flag: 'wx' });
    } else if (options['check-plan'] === true) {
      for (const key of ['plan', 'registry', 'requirements', 'matrix']) assert(options[key], 'E_USAGE', `--${key}`);
      const registry = readCanonicalJson(options.registry);
      assert(registry.digest === FIXED_BINDINGS.stageRegistryDigest, 'E_REGISTRY_DIGEST', registry.digest);
      validateRecertificationPlan(readCanonicalJson(options.plan).value, registry.value);
      validateEvidenceMatrix(readCanonicalJson(options.matrix).value, registry.value, readCanonicalJson(options.requirements).value);
      process.stdout.write(`${canonicalize({ registeredStages: 33, status: 'PASS' })}\n`);
    } else fail('E_USAGE', '--compile-bundle, --compile-stage-results, or --check-plan');
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
