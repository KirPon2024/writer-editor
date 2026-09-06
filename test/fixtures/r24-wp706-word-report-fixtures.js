'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const HEAD = '1'.repeat(40);
const ORIGIN = '2'.repeat(40);
const TREE = '3'.repeat(40);
const read = relative => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));

function baseInput(constants, overrides = {}) {
  return {
    executableProgram: overrides.executableProgram || read('docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json'),
    scientificContracts: overrides.scientificContracts || read('docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/SCIENTIFIC_CONTRACTS.json'),
    v2EffectiveState: overrides.v2EffectiveState || read('docs/OPS/R24/CORRECTIVE/V2_EFFECTIVE_STATE_V1.json'),
    c1Receipt: overrides.c1Receipt || read('docs/OPS/RTK/YALKEN_INTEROP_C1_WORD_FULLBOOK_ROUTE_RECEIPT_V1.json'),
    c1Matrix: overrides.c1Matrix || read('docs/OPS/RTK/YALKEN_INTEROP_CHAIN_MATRIX_V1.json'),
    sourceDigests: overrides.sourceDigests || { ...constants.EXPECTED_SOURCE_DIGESTS },
    repoState: overrides.repoState || { headSha: HEAD, originMainSha: ORIGIN, treeSha: TREE, dirty: false },
    expectedHeadSha: overrides.expectedHeadSha || HEAD,
    expectedOriginMainSha: overrides.expectedOriginMainSha === undefined ? ORIGIN : overrides.expectedOriginMainSha,
    claimRequest: overrides.claimRequest || {},
  };
}

module.exports = { ROOT, HEAD, ORIGIN, TREE, read, baseInput };
