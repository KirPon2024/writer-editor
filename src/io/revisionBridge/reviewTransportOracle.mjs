import {
  buildW2ReviewIr,
  buildW2WorkerCapabilityAdapter,
  buildW2RedactedPackageRewriteReport,
  w2Crc32,
} from './reviewTransportIr.mjs';

import {
  analyzeG0BTransportContract,
  analyzeW1ReturnedArtifact,
  buildW1ExportIntent,
  buildW1NeutralTransportArtifact,
  compareParserCandidates,
  createSupportedCorpusDigest,
  evaluateW1ColdArchiveEligibility,
  freezeSupportedCorpus,
  probeW1DirectorySyncCapability,
  resolveW1NoWriteFeatureFlag,
  verifyG0BAnchor,
} from './reviewTransportContracts.mjs';

export {
  analyzeG0BTransportContract,
  analyzeW1ReturnedArtifact,
  buildW1ExportIntent,
  buildW1NeutralTransportArtifact,
  compareParserCandidates,
  createSupportedCorpusDigest,
  evaluateW1ColdArchiveEligibility,
  freezeSupportedCorpus,
  probeW1DirectorySyncCapability,
  resolveW1NoWriteFeatureFlag,
  verifyG0BAnchor,
};

export {
  buildW2ReviewIr,
  buildW2RedactedPackageRewriteReport,
  buildW2WorkerCapabilityAdapter,
  w2Crc32,
};

export function runG0BLocalOracle(input = {}) {
  const transport = analyzeG0BTransportContract(input.transport);
  const corpusDigest = input.supportedCorpus
    ? createSupportedCorpusDigest(input.supportedCorpus)
    : '';
  const corpusFreeze = input.supportedCorpus && input.expectedCorpusDigest
    ? freezeSupportedCorpus(input.supportedCorpus, input.expectedCorpusDigest)
    : null;
  const parserDecision = input.parserCandidates
    ? compareParserCandidates(input.parserCandidates, input.parserOptions)
    : null;

  return {
    schemaVersion: 'revision-bridge.g0b-local-oracle.v1',
    status: transport.localContractStatus === 'PASS' ? 'PASS' : 'BLOCKED',
    externalWordStatus: 'DEFERRED_EXTERNAL_WORD_EVIDENCE',
    transport,
    corpusDigest,
    corpusFreeze,
    parserDecision,
  };
}

export function runW1NoWriteOracle(input = {}) {
  const featureFlag = resolveW1NoWriteFeatureFlag(input.flags);
  const exportIntent = buildW1ExportIntent(input.exportIntent);
  const bundle = buildW1NeutralTransportArtifact(input.artifact);
  const returnedAnalysis = analyzeW1ReturnedArtifact({
    roundId: input.artifact?.roundId,
    lifecycleState: bundle.publicManifest.lifecycleState,
    publicManifest: bundle.publicManifest,
    transport: input.returnedTransport || input.artifact?.transport,
  });
  const directorySync = probeW1DirectorySyncCapability(input.directorySyncCapabilities);

  return {
    schemaVersion: 'yalken.rtk.no-write-oracle.v2',
    status: featureFlag.enabled && exportIntent.ok && returnedAnalysis.ok ? 'PASS' : 'BLOCKED',
    canWriteManuscript: false,
    canApply: false,
    featureFlag,
    exportIntent,
    bundle,
    returnedAnalysis,
    directorySync,
  };
}

export function runW2ReviewIrOracle(input = {}) {
  const reviewIr = buildW2ReviewIr(input);
  return {
    schemaVersion: 'yalken.rtk.review-ir-oracle.v2',
    status: reviewIr.ok ? 'PASS' : 'BLOCKED',
    canWriteManuscript: false,
    canApply: false,
    reviewIr,
  };
}
