import {
  analyzeG0BTransportContract,
  compareParserCandidates,
  createSupportedCorpusDigest,
  freezeSupportedCorpus,
  verifyG0BAnchor,
} from './reviewTransportContracts.mjs';

export {
  analyzeG0BTransportContract,
  compareParserCandidates,
  createSupportedCorpusDigest,
  freezeSupportedCorpus,
  verifyG0BAnchor,
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
