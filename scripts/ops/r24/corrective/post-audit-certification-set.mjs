#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { canonicalBytes } from './canonical-json.mjs';
import { inspectExactZip } from './terminal-attestation-verifier.mjs';
import { verifyRuleset } from './post-audit-merge-gate.mjs';
import { verifyWp502TerminalCarriers } from '../wp502-terminal-verifier.mjs';

export const EXTERNAL_SOURCE_PLAN_DIGEST='1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a';
export const COMPILED_PROGRAM_FILE_DIGEST='da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a';
export const EXPECTED_STAGE_COUNT=33;
export const EXPECTED_ARTIFACT_BINDING_DENOMINATOR=137;
export const ALLOWED_POST_EVALUATION_CARRIERS=Object.freeze([
  'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_CORRECTIONS_FINAL_ACCEPTANCE_MATRIX_V1.json',
  'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_CORRECTIONS_FINAL_EFFECTIVE_STATE_V1.json',
  'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_CORRECTIONS_FINAL_STAGE_REGISTRY_V1.json',
  'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_CORRECTIONS_LEASE_RELEASE_V1.json',
  'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_CORRECTIONS_TERMINAL_RECEIPT_V1.json',
  'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_LIVE_RULESET_V1.json',
  'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_PROTECTED_WIP_AFTER_V1.json',
  'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1.json',
  'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CURRENT_CERTIFICATION_SET_V2.json'
]);
export const AUDIT_CYCLE_2_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_OWNER_AMENDMENT_V17.json',
  authorityDigest:'f4e7617cfc0014b4582d76fdc62986f1da5a9451ce953e06959199b0aed4fa92',
  authorityId:'OWNER_AUDIT_CYCLE_2_V18_SUCCESSOR_V1',
  instancePath:'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_INSTANCE_V18.json',
  instanceDigest:'ecf838c810262e53eb86f63f0f15ea0f989c85009a51aa12798e5b94758821df',
  admissionPath:'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_ADMISSION_ATTESTATION_V18.json',
  admissionDigest:'10051af910bf4b7004c3068927cd835a521faa3d56a7bdf09ee3ad2058075038',
  writeSetDigest:'2d45eca2f751fb4f4b6e9abf3a2f369d8597389437875ac7893c3827f6afd260',
  predecessorAuthorityDigest:'d07be95b36595ae5877abb04bca32bece319930cc9a210fdd1c88ba5d7b901d8',
  predecessorInstanceDigest:'f1c3b756dd3ea694964125087dbe5af33262254adeda4a678fcda38c803d03c2',
  predecessorAdmissionDigest:'eedb83accc580c155ba90107189e55406cb2080a3e2132fd86eeb3a72c2300f6',
  predecessorWriteSetDigest:'2ff5201b9c32f2d5902ada501457c59d5c6e3eec8f1939f87001965a58b00bd3',
  baseSha:'ee480790c3f3553fe5e5f44ec5f42d5c6066d73c',
  baseTree:'c8478220aa7a2f16883dd3361009d6b2c5d5408d',
  fencingCounter:58
});
export const WP401_MAIN_PRODUCT_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/WP401_MAIN_PRODUCT_AUTHORITY_AMENDMENT_V5.json',
  authorityDigest:'2edc680fd48dc3034af0b1ca76d92ea0e80f007f5874ca4f75959ddfcc8f44ab',
  registryPath:'docs/OPS/R24/CORRECTIVE/WP401_MAIN_PRODUCT_STAGE_REGISTRY_V5.json',
  registryDigest:'92174ef49ecc2754b2ae9082b2b51afdb4267973b21e80590dd23db2a0c47365',
  instancePath:'docs/OPS/R24/CORRECTIVE/WP401_MAIN_PRODUCT_STAGE_INSTANCE_V5.json',
  instanceDigest:'bce73b311b15cbe1c05828411b961669bc9ebeda0f4ef471556172297d8775be',
  admissionPath:'docs/OPS/R24/CORRECTIVE/WP401_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V5.json',
  admissionDigest:'3b44a24aef899ff2692d6d82d518d55c206a898d058be667f58f0ae2b6d11533',
  writeSetDigest:'41837e39c5ad8acbce74f7f7613a15c1c8aa24e32266cd3e629572badf400843',
  predecessorAuthorityDigest:'69fc9e600d22019bfee17af97765566388f2a96ecb311e5b34cff75f7b2caed3',
  predecessorRegistryDigest:'c4ee0eae8e8f7522c32e56fee3c31964c64cd91c4f769659f50b5d51c29f557b',
  predecessorInstanceDigest:'12f485e3607df00da29817efeaa25a2da467d8b622dd7c3622344b1602636785',
  predecessorAdmissionDigest:'edf49faf8c1d1177f74191e483cf6bbfefe3aaa866835c941dad04b0ddc1ce2b',
  predecessorWriteSetDigest:'ba7e04d030ffd942913a1dd7d09a0e4c0c12d0df5391b84f70048146afcd6d0e',
  baseSha:'9aae563b18578a052fffc434b3f37257248092a0',
  baseTree:'b58795b702cbbdd920d4470f3ea67de1fdfadfa2',
  authorityTemplateId:'OWNER_AUTHORIZED_YALKEN_R24_WP401_BOOK_SNAPSHOT_V5',
  stageId:'WP-401_BOOK_SNAPSHOT',
  fencingCounter:59
});
export const WP402_MAIN_PRODUCT_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/WP402_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V2.json',
  authorityDigest:'74ae21ddddb35e732a6cbe29cb83aa026fe38c3b379edd72a037ed2cfdf288bf',
  authorityId:'OWNER_AUTHORIZED_YALKEN_R24_WP402_PROJECTOR_KERNEL_V2',
  instancePath:'docs/OPS/R24/CORRECTIVE/WP402_MAIN_PRODUCT_STAGE_INSTANCE_V2.json',
  instanceDigest:'5bc2e5566be12de357521a6f1a1509fcb12964317894c8910fc353c09da4d63c',
  admissionPath:'docs/OPS/R24/CORRECTIVE/WP402_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V2.json',
  admissionDigest:'ad6f75503eaddad4265c8efc16c9a40e13e14ff206171a3f2fe8da224538e007',
  writeSetDigest:'3c3ecd32b8fb5fa5052e2b4f03d5d5ce1919e1a8acf4d9a437d2edf13c90bc91',
  predecessorAuthorityDigest:'aedbe756a9e7a4820df8e343de8f56d5e4d3598bbf93b77fdeeddcbef6194d65',
  predecessorInstanceDigest:'a6df655fc011e2c2589559b4c29207706fb0da9f58bf724998b7b699833c8560',
  predecessorAdmissionDigest:'bd63c345e43178b7e5f59650e1b93132ddaaa6f33af404ce53806f10f30da7a0',
  predecessorWriteSetDigest:'c1b79331125ae431f9015f4a5294d3d939084a2ef3d9a44cb7440ac366c16206',
  predecessorCommandScopeDigest:'951d3b492614ca556468e976e7c9ce435b314b2fec291c43f80ac0d4541148be',
  failedCandidateCiDigest:'1092d10ec1632c769e4cde813f02a759f65fb5feeaa62863235e61ad7d6608a2',
  baseSha:'a435035bef98d2ede7801bded8a8839845c4dd92',
  baseTree:'353199a85ed27f24fff88372e9efd9cacfa38ba3',
  stageId:'WP-402_PROJECTOR_KERNEL',
  fencingCounter:60
});
export const WP403_MAIN_PRODUCT_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/WP403_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V2.json',
  authorityDigest:'25c0c652a4992bcf2d2263b17f3215c14ca7c6f1a0a4a4aabd413ac581a2fbd7',
  authorityId:'OWNER_AUTHORIZED_YALKEN_R24_WP403_DECISION_SUBSTRATE_V2',
  instancePath:'docs/OPS/R24/CORRECTIVE/WP403_MAIN_PRODUCT_STAGE_INSTANCE_V2.json',
  instanceDigest:'714495e775228af4aaebdcfa3098b17906294eae29a333c51b332a44fed4cebe',
  admissionPath:'docs/OPS/R24/CORRECTIVE/WP403_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V2.json',
  admissionDigest:'0aa76c71369c2b6886762c186f4ea8dbc5be4f5514aa58580f4161eb6f65c769',
  failurePath:'docs/OPS/R24/CORRECTIVE/WP403_CANDIDATE_CI_FAILURE_V1.json',
  failureDigest:'3d933f3dc61c2abed270f8775ca6d2d1105a64f4e844d3b5aa6d5fb09f8a36f7',
  writeSetDigest:'13bdbef9e3bcffaeec33f992f5b823b0bf1486d56672b50e4febfb6093cd6805',
  predecessorAuthorityDigest:'78d40137fc5dcdf85c1cc4de911d8bb3517bb7ed4249827c3aec7e85f84de309',
  predecessorInstanceDigest:'19acf09e3789b02936a7afb2e4ee7619f5bedd3848bc1abee8498adedb563bad',
  predecessorAdmissionDigest:'4e66142783984614c3aba97d9496dc61171cbefbf1ce60240bde2d55380493dc',
  predecessorWriteSetDigest:'ed87591b97a11b0f969e6671cee234bbbca79e9da9142b9e23ddb64ffc406690',
  predecessorCommandScopeDigest:'67a21d4f11aa5056345f476dd6cdc77a432a43ba6b21dac1ae917e39af77f67a',
  baseSha:'cc69d27d4986e74ed5dcb17bc3f5766c750f62f0',
  baseTree:'0760bfe260ad27bd6e641975b523e82c5bd12b57',
  stageId:'WP-403_DECISION_SUBSTRATE',
  fencingCounter:61
});
export const WP404_MAIN_PRODUCT_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/WP404_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json',
  authorityDigest:'5ef707aeffe932d65dad2ea7ed80799f89886db3f6ef671c3a3fe901eb8ffdf2',
  authorityId:'OWNER_AUTHORIZED_YALKEN_R24_WP404_ATLAS_FOUNDATION_CLAIM_V1',
  instancePath:'docs/OPS/R24/CORRECTIVE/WP404_MAIN_PRODUCT_STAGE_INSTANCE_V1.json',
  instanceDigest:'1276a9c2805d4317e35dfff4809bc26a6ca773e82312b12bbd20fb4547464318',
  admissionPath:'docs/OPS/R24/CORRECTIVE/WP404_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json',
  admissionDigest:'92bbab8e9a12950b43763414bb702ed97ef89887e994a4cc1e6c498a625cadaa',
  writeSetDigest:'99efd171a84d457e4ae0ba408f420ff1aa6ce490c2ad7ffdcc9298b7015f4316',
  baseSha:'5774d547bfa607209f4d871c48ae2241332b00b6',
  baseTree:'c69a08102478ba2906f9181018e1d48740326f86',
  stageId:'WP-404_ATLAS_FOUNDATION_CLAIM',
  fencingCounter:62,
  predecessorLeaseReleaseDigest:'b09d066b08aa9f6ad2375f09e4da266396f209160a96b0067e819ff58dd35d5f',
  predecessorEffectiveStateDigest:'8f5498e68447a573b419fce7295721458f8a1c8649ce5e0ad2f0d75e4e13098d',
  predecessorTerminalReceiptDigest:'21c5ca5a64bca8b5d62a4ad1bde10d60267eb31ade8e555e29747795e3b97301'
});
export const WP500_MAIN_PRODUCT_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/WP500_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json',
  authorityDigest:'6b5d213bcef05f4810d7664adbc1d43490e97acb82de749ea63417f10f4554da',
  authorityId:'OWNER_AUTHORIZED_YALKEN_R24_WP500_ASSOCIATIONS_V1',
  instancePath:'docs/OPS/R24/CORRECTIVE/WP500_MAIN_PRODUCT_STAGE_INSTANCE_V1.json',
  instanceDigest:'071abad5b50032d25eebd6e8ce1b1d76f44da5464673b87b83e4ac9a19ff677d',
  admissionPath:'docs/OPS/R24/CORRECTIVE/WP500_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json',
  admissionDigest:'6b0a4354ca7e89095993fdcf925eb3c3ce878e64ad13a271b7877d8b0b150e81',
  writeSetDigest:'ed35c734509d64bf8038bdde71dbc7b10c05c3a171cc4a7ff936058ec88dc394',
  baseSha:'c7cb783a699cdd44a531040fde8b3278ec86a39b',
  baseTree:'236dcab03a21f63fa20966381fcba41119354d63',
  stageId:'WP-500_ASSOCIATIONS',
  fencingCounter:63,
  predecessorAcceptanceDigest:'506c10286333d8a8679567daeef2c49fecb06cf006594efe896cd00a9a80cd22',
  predecessorLeaseReleaseDigest:'596fd41507d2cd6bbf5cc244c84d021767bf643e75a3595ae31b5025800fca97',
  predecessorEffectiveStateDigest:'3fde4ab0b8ad3372ebe0e92d64bb5f20d145367d9c227ab8740e0d11a1e3baa9',
  predecessorTerminalReceiptDigest:'3de6e7ad6d860faa718bc370d04ae2d8d0d5cf6e08bfbf3cf155fc048fcfa595'
});
export const WP501_MAIN_PRODUCT_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/WP501_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json',
  authorityDigest:'4a1ff1f4b285b1f23e8b332547427d8545d2cfbce582ca59671ee3ea9429f59a',
  authorityId:'OWNER_AUTHORIZED_YALKEN_R24_WP501_TIME_KNOWLEDGE_SINGLE_TERMINAL_PR_V1',
  instancePath:'docs/OPS/R24/CORRECTIVE/WP501_MAIN_PRODUCT_STAGE_INSTANCE_V1.json',
  instanceDigest:'bcee44d31ff29c96566fb5d4dec1c335fd5831cb28419c2c252dabd8bad18fc6',
  admissionPath:'docs/OPS/R24/CORRECTIVE/WP501_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json',
  admissionDigest:'61b437c37deb503d7904272a734511f987ec9a4ca3a448c2c430639db122ac2e',
  writeSetDigest:'a0bbfc590dff004a8b5be3d10a2bfb7528f6cf4e91ee07b10be2a3e7ba1fbb09',
  baseSha:'55a9a226e1e7aec1b426b1d511b7cfbc7cf139d8',
  baseTree:'522d3602bf1472dc99893d8503e42a93dca9f187',
  stageId:'WP-501_TIME_KNOWLEDGE',
  fencingCounter:64,
  predecessorAcceptanceDigest:'eea2a22cca7ee8008ed191b5bbee3e1a40c02b573f0fc4229c030290e30ef503',
  predecessorLeaseReleaseDigest:'8085f4786f9ef3068cfa8a1566a1aef0b6486e24dc1ecedc9535010de4cd4c8f',
  predecessorEffectiveStateDigest:'d0c7758dea0b10377d270a52f66ce7746ba26774986339dda299ef0eb3d5d009',
  predecessorTerminalReceiptDigest:'17d2998d20041005cfa01ef2745599854b20ed9fe28f5ad40dfe590225c19978'
});
export const WP501_GATE_INTEGRATION_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/WP501_GATE_INTEGRATION_OWNER_AUTHORITY_V1.json',
  authorityDigest:'504e8de9e02e7efdc0f7c70799514aca6a764521c9740b403d54acd2f695e604',
  authorityId:'OWNER_AUTHORIZED_YALKEN_R24_WP501_GATE_INTEGRATION_SINGLE_TERMINAL_PR_V1',
  instancePath:'docs/OPS/R24/CORRECTIVE/WP501_GATE_INTEGRATION_STAGE_INSTANCE_V1.json',
  instanceDigest:'b9192eb03f634e1ee5a48b76683139fc4e0de8ec6b9d82ba273efa6e266228d5',
  admissionPath:'docs/OPS/R24/CORRECTIVE/WP501_GATE_INTEGRATION_STAGE_ADMISSION_ATTESTATION_V1.json',
  admissionDigest:'df8844ce348f9e93e51f7245e9a52c86922da562c928f84179ad7f84208e9972',
  writeSetDigest:'c403c52d208f8aa0530cd2cd884444cbf6ad3f548302c6bf10b57a525f8e375d',
  baseSha:'4c2376c59af1cd0e62ea2284f07bd1e8434755ee',
  baseTree:'9b6f1a81b26e9f0b1fbed9e2c4ffefdcaeef40bf',
  stageId:'WP-501_TIME_KNOWLEDGE_GATE_INTEGRATION',
  fencingCounter:64,
  predecessorLeaseReleaseDigest:'8085f4786f9ef3068cfa8a1566a1aef0b6486e24dc1ecedc9535010de4cd4c8f',
  predecessorAdmissionDigest:'61b437c37deb503d7904272a734511f987ec9a4ca3a448c2c430639db122ac2e',
  predecessorTerminalReceiptDigest:'a625f7bafeeb4f412b3e8d77a551f4724035db07ebe5659ed151c1fd0559304e'
});
export const WP501_PERFORMANCE_INTEGRATION_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/WP501_PERFORMANCE_INTEGRATION_OWNER_AUTHORITY_V1.json',
  authorityDigest:'80d4e14775750a83d8867a674613c8163fece51367ab00612d2df3d9ff5fadb8',
  authorityId:'OWNER_AUTHORIZED_YALKEN_R24_WP501_PERFORMANCE_INTEGRATION_SINGLE_TERMINAL_PR_V1',
  instancePath:'docs/OPS/R24/CORRECTIVE/WP501_PERFORMANCE_INTEGRATION_STAGE_INSTANCE_V1.json',
  instanceDigest:'6f3216d8e6efd92f37b7840ce43655c8538e8de00805d1cb7468c7d612c6c8b3',
  admissionPath:'docs/OPS/R24/CORRECTIVE/WP501_PERFORMANCE_INTEGRATION_STAGE_ADMISSION_ATTESTATION_V1.json',
  admissionDigest:'2f467ca1e6fbaf115b5fa38defebbc29fcd7dae5856f328b3c190d6e9ec4d9b2',
  writeSetDigest:'2762ea1f4466a2281d5a070f2cc39bc5469cb9ceea56c2aeed074b790cc5b079',
  baseSha:'d8928ba0a6f19225f289bbd6deb30ea2d2f9689e',
  baseTree:'343e2b90611a6d6f1f648a70eb2b00efbd6895c7',
  stageId:'WP-501_TIME_KNOWLEDGE_PERFORMANCE_INTEGRATION',
  fencingCounter:64,
  predecessorLeaseReleaseDigest:'8085f4786f9ef3068cfa8a1566a1aef0b6486e24dc1ecedc9535010de4cd4c8f',
  predecessorAdmissionDigest:'df8844ce348f9e93e51f7245e9a52c86922da562c928f84179ad7f84208e9972',
  predecessorTerminalReceiptDigest:'a625f7bafeeb4f412b3e8d77a551f4724035db07ebe5659ed151c1fd0559304e'
});
export const WP501_AUDIT_R2_COMPATIBILITY_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/WP501_AUDIT_R2_COMPATIBILITY_OWNER_AUTHORITY_V1.json',
  authorityDigest:'487f52d4db1c2f303310b83a2b582ce8a4355f572b771bd5ca29e762d693e45c',
  authorityId:'OWNER_AUTHORIZED_YALKEN_R24_WP501_AUDIT_R2_COMPATIBILITY_SINGLE_TERMINAL_PR_V1',
  instancePath:'docs/OPS/R24/CORRECTIVE/WP501_AUDIT_R2_COMPATIBILITY_STAGE_INSTANCE_V1.json',
  instanceDigest:'85eb4463c508d5d786f1930a1cdcb793a03040eeaa4a54e5d1c1d123ce22ab6e',
  admissionPath:'docs/OPS/R24/CORRECTIVE/WP501_AUDIT_R2_COMPATIBILITY_STAGE_ADMISSION_ATTESTATION_V1.json',
  admissionDigest:'a1484e673829fb0a93b74dffe209893d08c10c01b9b9bc99c16700e2691ee228',
  writeSetDigest:'e1f39c7f7aa56d5abef31d56723450317cb248fee6a69bda77f825021d1298e6',
  baseSha:'f4c630eef2f39f6dcf1b65c08a6b404d2875d929',
  baseTree:'dc35016df4b0ed93f3a5a30cf496f45bf7464900',
  stageId:'WP-501_TIME_KNOWLEDGE_AUDIT_R2_COMPATIBILITY_INTEGRATION',
  fencingCounter:64,
  predecessorLeaseReleaseDigest:'8085f4786f9ef3068cfa8a1566a1aef0b6486e24dc1ecedc9535010de4cd4c8f',
  predecessorAdmissionDigest:'2f467ca1e6fbaf115b5fa38defebbc29fcd7dae5856f328b3c190d6e9ec4d9b2',
  predecessorTerminalReceiptDigest:'a625f7bafeeb4f412b3e8d77a551f4724035db07ebe5659ed151c1fd0559304e'
});
export const WP501_INVENTORY_FINALIZATION_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/WP501_INVENTORY_FINALIZATION_OWNER_AUTHORITY_V1.json',
  authorityDigest:'ed8222452d90ac710b2f8e0cad2f9a98a0a8b16d967c3975f8eb22ed0c0ede8b',
  authorityId:'OWNER_AUTHORIZED_YALKEN_R24_WP501_INVENTORY_FINALIZATION_SINGLE_TERMINAL_PR_V1',
  instancePath:'docs/OPS/R24/CORRECTIVE/WP501_INVENTORY_FINALIZATION_STAGE_INSTANCE_V1.json',
  instanceDigest:'3454ca2b5ededd608d7f02555116ff33716b39e5ca4ae70b1268de49f57e414b',
  admissionPath:'docs/OPS/R24/CORRECTIVE/WP501_INVENTORY_FINALIZATION_STAGE_ADMISSION_ATTESTATION_V1.json',
  admissionDigest:'efd67ee4d77f8207ca6519912f5573b85c1c5916278bff2f1ef225a7d3bd6cd0',
  writeSetDigest:'5fbc64d45e94bb1b9c53c6d3adf7517f904172328d3229dbe63c4930dd9e0fd3',
  baseSha:'0e1c97d7396c04d67fb48edd71afe7eedc1d0260',
  baseTree:'1b550d02a5ade10b17df6b54ba1b6509e644f7be',
  stageId:'WP-501_TIME_KNOWLEDGE_INVENTORY_FINALIZATION',
  fencingCounter:64,
  predecessorLeaseReleaseDigest:'8085f4786f9ef3068cfa8a1566a1aef0b6486e24dc1ecedc9535010de4cd4c8f',
  predecessorAdmissionDigest:'a1484e673829fb0a93b74dffe209893d08c10c01b9b9bc99c16700e2691ee228',
  predecessorTerminalReceiptDigest:'a625f7bafeeb4f412b3e8d77a551f4724035db07ebe5659ed151c1fd0559304e'
});
export const WP501_TERMINAL_EXCEPTION_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/WP501_TERMINAL_EXCEPTION_OWNER_AUTHORITY_V1.json',
  authorityDigest:'2a508d4e54b6458dffcaef6fac2fea9eaf3141ade74de72ebabcefdba7909865',
  authorityId:'OWNER_AUTHORIZED_YALKEN_R24_WP501_SINGLE_TERMINAL_PR_EXCEPTION_V1',
  instancePath:'docs/OPS/R24/CORRECTIVE/WP501_TERMINAL_EXCEPTION_STAGE_INSTANCE_V1.json',
  instanceDigest:'d25b3d384824f697089317d16a28b842006bfb4396a704d18bb5cca7666a5db9',
  admissionPath:'docs/OPS/R24/CORRECTIVE/WP501_TERMINAL_EXCEPTION_STAGE_ADMISSION_ATTESTATION_V1.json',
  admissionDigest:'7d61ec937d5ed9474769975fbf9acda8e8c1c55b6738ec41bfa5722c77583e5d',
  writeSetDigest:'ebf0cd195e83e615083621781be2653b00f4b31399eb714230270a629e828cf3',
  commandScopeDigest:'f6a3d6b2a8d1e15c931148f345baf908383ac67ecae3eec5ba0141a93fcee715',
  acceptanceSignalsDigest:'49d17df4201bdbcc94e6534450d98d6c4bea7e3aecedffec00047416a898c27c',
  baseSha:'a0b8aec4f61a99f63fa34ba6c30aee5959954aa6',
  baseTree:'df0d38807fe7cccaa012668b7e144e3312593acf',
  stageId:'WP-501_TIME_KNOWLEDGE_TERMINAL_EXCEPTION',
  fencingCounter:64,
  predecessorLeaseReleaseDigest:'8085f4786f9ef3068cfa8a1566a1aef0b6486e24dc1ecedc9535010de4cd4c8f',
  predecessorAdmissionDigest:'efd67ee4d77f8207ca6519912f5573b85c1c5916278bff2f1ef225a7d3bd6cd0',
  predecessorTerminalReceiptDigest:'a625f7bafeeb4f412b3e8d77a551f4724035db07ebe5659ed151c1fd0559304e',
  protectedWipBeforeDigest:'1f7f391534057a24a94cff3d64d41a06a48c240be057df69b503febd00cf8be1',
  providerDigests:Object.freeze({
    pr1801:'dec800fafa694c76b98ba36290b1a0018398bc5e9e684361d345459a8df3c4f4',
    candidateCi:'66b9dc19da07629f3214a8c6d14db9353de9f79d2c29dc6e939f12402ffe7574',
    opsVectorClose:'ace17d43c396eacf7d44c27bdbe50eb2c4aec8346f6ca6553d9533d8e2278505',
    postmergeCi:'06a3949b84ddb4c9e5f93a80b2d290c4d88746985c5a641a5fc138ec5f8c5d47',
    ruleset:'6ca07a1b1bba4a9bb26f0669bf98ed02b8c75cf6acbbde37b9632d8ef057be8e'
  })
});
export const WP502_MAIN_PRODUCT_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/WP502_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V2.json',
  authorityDigest:'bca8995ad43a4f2393c4523c230878785c08389bcd654ee23510c14594cf4c1a',
  authorityId:'OWNER_AUTHORIZED_YALKEN_R24_WP502_THREADS_CAUSALITY_CANDIDATE_CI_SUCCESSOR_V2',
  instancePath:'docs/OPS/R24/CORRECTIVE/WP502_MAIN_PRODUCT_STAGE_INSTANCE_V2.json',
  instanceDigest:'672f995ba2758e564300ca4aa03fad74efd459e8018ca1716e8a87c5a8d3f729',
  admissionPath:'docs/OPS/R24/CORRECTIVE/WP502_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V2.json',
  admissionDigest:'60cee6d4232012dc7cd6087a3703f45dce9c3ccf920186d5b2f481e6156c71c8',
  failurePath:'docs/OPS/R24/CORRECTIVE/WP502_CANDIDATE_CI_FAILURE_V1.json',
  failureDigest:'76537fc98383cb3c10898b855eed4f78148a8a36e2400b956242e5d944c2afd5',
  writeSetDigest:'d3f3186eace81880f6ed286dfb071e04da3401cf5e3d10385f3956a3b992f1d1',
  commandScopeDigest:'76b87b574adc5c25b83c43e2b04918ffb6512b80f70358d9a0ef70d34f605f62',
  acceptanceSignalsDigest:'7c8bcb457b9bbd6de06db4ba7b128f3918e783a564d54dcbe78dfb8dce73af37',
  predecessorAuthorityDigest:'799e9b0076ec86115bbe425624eb11d065b945c47f0c7193c0184f8052991d00',
  predecessorInstanceDigest:'9d4b205fbd2d45b66c576fd217e221eeabb8f4dc23f91d8a7831bca139a13873',
  predecessorAdmissionDigest:'67e2d651e11365dca6e506252fea3165ead351389c81a6aef85bd7b0bf6da5c2',
  predecessorWriteSetDigest:'76248a7364d8d2081a32f28c90ca0232071981654f529085eb04d2bdaf187eea',
  predecessorCommandScopeDigest:'f96c5b9ea827d7e0388dddeb7ee270b83f0a499702c98cae9b16e9bd48d175dc',
  baseSha:'d76a3e4da899775ae94b9a1ee5ba8aa766e2fb2b',
  baseTree:'522a3a18d8d467f1427e928febc7a402fcd2f689',
  stageId:'WP-502_THREADS_CAUSALITY',
  fencingCounter:65,
  predecessorLeaseReleaseDigest:'1a94d4f591266b8dadc3ac5e277292e3c95767e9a19f6a8f0ec4df30e2be9c4e'
});
export const WP503_V6_MAIN_PRODUCT_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/WP503_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V6.json',
  authorityDigest:'5dd25723c9af2f691bfc5cefe19786aa3cc0ad9a93c7853594ebcd993e34b4c7',
  authorityId:'OWNER_AUTHORIZED_YALKEN_R24_WP503_ATLAS_SURFACE_POST_AUDIT_CERTIFICATION_CHAIN_SUCCESSOR_V6',
  instancePath:'docs/OPS/R24/CORRECTIVE/WP503_MAIN_PRODUCT_STAGE_INSTANCE_V6.json',
  instanceDigest:'0303b1510b35d98f6d1379c828af2814a8476bd9f5a0884b080f5df4b555e578',
  admissionPath:'docs/OPS/R24/CORRECTIVE/WP503_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V6.json',
  admissionDigest:'ea8e6bfbbe29f4ae919d75bb3186ed47f833dd5cff38c6353610aef8e3382d49',
  failurePath:'docs/OPS/R24/CORRECTIVE/WP503_LOCAL_POST_AUDIT_FAILURE_V1.json',
  failureDigest:'1e65500ff761dd3c85549731afc6925ac17d3066a6a15d870e4927336aabe8da',
  successorPath:'docs/OPS/R24/CORRECTIVE/WP503_POST_AUDIT_CERTIFICATION_SUCCESSOR_V1.json',
  writeSetDigest:'fc0289ac87953a366673f099c6e6f14fa1e095f792efcc2f0f6144b068c7c7eb',
  commandScopeDigest:'53330da3b5757b1c84096a28ddd6641af179e1e34869703fa6b4bbc8e4259180',
  acceptanceSignalsDigest:'ec9465c1a76fb4ffc73a65ca28803fb74132920d7cc2d53066474e387fac6144',
  predecessorAuthorityDigest:'0265d35e41a130a63ac03b431f50c02b06bd37d3799f5dcd63d5f5e8791f2ce9',
  predecessorInstanceDigest:'28e89223241512edfb2df2d3436f6a74d24fa80bea572ec051da06c7b46bef21',
  predecessorAdmissionDigest:'5e56705c54871f229791f70ac3831d10dfe75ac3207669ec08e19a8805c35598',
  predecessorWriteSetDigest:'b172149c47ea946096eb03a45c262def16a98106fa725729eb16f50494cf0310',
  predecessorCommandScopeDigest:'05b1fc4e79b77753dc73c77a774dcfdbc89efb7518dac0ae8e69c3e0f681cc3b',
  baseSha:'3157d84126a76734af50d012b359f7a58b2035fb',
  baseTree:'7f38243ced17ee249f0c541004171235a1e14788',
  stageId:'WP-503_ATLAS_SURFACE',
  fencingCounter:66,
  predecessorLeaseReleaseDigest:'b81c3795dbce79f479366af1a1585078d7d53709d048d8a2c12a630d3ec08b93'
});
export const WP503_V7_MAIN_PRODUCT_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/WP503_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V7.json',
  authorityDigest:'31340f9c67867eb2b11cd940cdbc3bfb564fd62f738df0b3c1ebcf70c4e9dca1',
  authorityId:'OWNER_AUTHORIZED_YALKEN_R24_WP503_TEMPORAL_EVIDENCE_SUCCESSOR_V7',
  instancePath:'docs/OPS/R24/CORRECTIVE/WP503_MAIN_PRODUCT_STAGE_INSTANCE_V7.json',
  instanceDigest:'6ebc284bed89df7b4c6f86fd9849e57dfcc58cd227ee898e786a69633028212f',
  admissionPath:'docs/OPS/R24/CORRECTIVE/WP503_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V7.json',
  admissionDigest:'bb0b13c4727f4bac954f9b6bf7d0c150401f9894b76fe5e2429ee6b8c27a8666',
  failurePath:'docs/OPS/R24/CORRECTIVE/WP503_TEMPORAL_EVIDENCE_FAILURE_V1.json',
  failureDigest:'eb9a45ba28d3cf8dff91f21c57ece84244ce423ead86a6a6b4786f6f9de333fe',
  successorPath:'docs/OPS/R24/CORRECTIVE/WP503_TEMPORAL_EVIDENCE_SUCCESSOR_V1.json',
  writeSetDigest:'f65d02046449a80901ef5571b2f691afa06656460cf3ca1522f63e30a56abda0',
  commandScopeDigest:'0b4afd99911f6d22260a414d93ba4a054d11476f6b4a5ae9443d3dbb6748b059',
  acceptanceSignalsDigest:'5af306fd93cbfd79e6114c9b05ab1cf5f04621488f81c106387a1f533067a8c1',
  predecessorAuthorityDigest:'5dd25723c9af2f691bfc5cefe19786aa3cc0ad9a93c7853594ebcd993e34b4c7',
  predecessorInstanceDigest:'0303b1510b35d98f6d1379c828af2814a8476bd9f5a0884b080f5df4b555e578',
  predecessorAdmissionDigest:'ea8e6bfbbe29f4ae919d75bb3186ed47f833dd5cff38c6353610aef8e3382d49',
  predecessorWriteSetDigest:'fc0289ac87953a366673f099c6e6f14fa1e095f792efcc2f0f6144b068c7c7eb',
  predecessorCommandScopeDigest:'53330da3b5757b1c84096a28ddd6641af179e1e34869703fa6b4bbc8e4259180',
  baseSha:'fdd6a88834e090f2830ba23ca8a9489f1a95964a',
  baseTree:'c8af93e64befe8b62ca47f810be780d0855bb560',
  stageId:'WP-503_ATLAS_SURFACE',
  fencingCounter:67,
  predecessorLeaseReleaseDigest:'9caae577ab5ff1f0cea7661c74ee8ef19fdf68cdb603e4172ec61293a7c65795'
});
export const WP503_V8_MAIN_PRODUCT_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/WP503_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V8.json',
  authorityDigest:'cf801d05286366aeae012188cf98a5aaf3c01e0a49cd47864e0490a4269ebd58',
  authorityId:'OWNER_AUTHORIZED_YALKEN_R24_WP503_AUDIT_R2_REGISTRY_SUCCESSOR_V8',
  instancePath:'docs/OPS/R24/CORRECTIVE/WP503_MAIN_PRODUCT_STAGE_INSTANCE_V8.json',
  instanceDigest:'d6539526c8948c6a0e0445b56c9606548b19702473a5c4f8b89f57bca56fa6b8',
  admissionPath:'docs/OPS/R24/CORRECTIVE/WP503_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V8.json',
  admissionDigest:'32640b6152d3aa2c69eea0b4383e416f50acf081c1ddeba45a3f3db558574e7a',
  failurePath:'docs/OPS/R24/CORRECTIVE/WP503_CANDIDATE_CI_AUDIT_R2_FAILURE_V1.json',
  failureDigest:'0cccf8595bb84dad5ceb07ac9ab560d9bd4e93a03440241429e1d078464de071',
  successorPath:'docs/OPS/R24/CORRECTIVE/WP503_AUDIT_R2_REGISTRY_SUCCESSOR_V1.json',
  writeSetDigest:'60eccb80c45fa375a930f7339f2c25ba29479620b77841df7cf41518800eb2be',
  commandScopeDigest:'95ad5fe461e22149e182da07fda067c74b15b0e30724058231a0e4f2ba7524cf',
  acceptanceSignalsDigest:'b3c9237b0a3ee45869d764d0991783aefdde27b6da29b28182ce6dd2dcfcae6b',
  predecessorAuthorityDigest:'31340f9c67867eb2b11cd940cdbc3bfb564fd62f738df0b3c1ebcf70c4e9dca1',
  predecessorInstanceDigest:'6ebc284bed89df7b4c6f86fd9849e57dfcc58cd227ee898e786a69633028212f',
  predecessorAdmissionDigest:'bb0b13c4727f4bac954f9b6bf7d0c150401f9894b76fe5e2429ee6b8c27a8666',
  predecessorWriteSetDigest:'f65d02046449a80901ef5571b2f691afa06656460cf3ca1522f63e30a56abda0',
  predecessorCommandScopeDigest:'0b4afd99911f6d22260a414d93ba4a054d11476f6b4a5ae9443d3dbb6748b059',
  baseSha:'acc19208d94c6be40e0f627cec218191171ae583',
  baseTree:'32480ed79d2ac73ed3589de99f685bd9758f53ca',
  stageId:'WP-503_ATLAS_SURFACE',
  fencingCounter:67,
  predecessorLeaseReleaseDigest:'9caae577ab5ff1f0cea7661c74ee8ef19fdf68cdb603e4172ec61293a7c65795'
});
export const WP503_MAIN_PRODUCT_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/WP503_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V9.json',
  authorityDigest:'bd12fbab73fde7c73d4ec1116eaea0154bf77612fb02b1ec158dd6528bad8d60',
  authorityId:'OWNER_AUTHORIZED_YALKEN_R24_WP503_TEST_INVENTORY_SUCCESSOR_V9',
  instancePath:'docs/OPS/R24/CORRECTIVE/WP503_MAIN_PRODUCT_STAGE_INSTANCE_V9.json',
  instanceDigest:'9480cbcb3878c30f1dbf20d680e9368479ff3f06179067bd9800607cd516d88b',
  admissionPath:'docs/OPS/R24/CORRECTIVE/WP503_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V9.json',
  admissionDigest:'9dd48faa1949c810ba87186fbf654502c900e50e718839d8a4b93d3c506d8027',
  failurePath:'docs/OPS/R24/CORRECTIVE/WP503_LOCAL_TEST_INVENTORY_FAILURE_V1.json',
  failureDigest:'9463ff4630877875689853e9999a146d881b437ee3dd4aa97e043cf959b8fd01',
  successorPath:'docs/OPS/R24/CORRECTIVE/WP503_TEST_INVENTORY_SUCCESSOR_V1.json',
  writeSetDigest:'1fce671fd98697eec5617ff81027e93ac15378e5959fb36338784a544c95a1ef',
  commandScopeDigest:'b30a6aacb5456c8be406c02cded201ceaeee9ef9dbdeebaca1c49a4443eeb6ff',
  acceptanceSignalsDigest:'aadfd14bb89ad509e4a67615f5051797061f8a0feb9547897d313d711b1f5551',
  predecessorAuthorityDigest:'cf801d05286366aeae012188cf98a5aaf3c01e0a49cd47864e0490a4269ebd58',
  predecessorInstanceDigest:'d6539526c8948c6a0e0445b56c9606548b19702473a5c4f8b89f57bca56fa6b8',
  predecessorAdmissionDigest:'32640b6152d3aa2c69eea0b4383e416f50acf081c1ddeba45a3f3db558574e7a',
  predecessorWriteSetDigest:'60eccb80c45fa375a930f7339f2c25ba29479620b77841df7cf41518800eb2be',
  predecessorCommandScopeDigest:'95ad5fe461e22149e182da07fda067c74b15b0e30724058231a0e4f2ba7524cf',
  baseSha:'96cded02b57cf0147ae2d4a063891dd63f0ac212',
  baseTree:'3488fd8b7640be57c7c48ee7ba952d75f345f3f3',
  stageId:'WP-503_ATLAS_SURFACE',
  fencingCounter:67,
  predecessorLeaseReleaseDigest:'9caae577ab5ff1f0cea7661c74ee8ef19fdf68cdb603e4172ec61293a7c65795'
});
const h=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
const fail=(code,detail='')=>{const error=new Error(`${code}${detail?`:${detail}`:''}`);error.code=code;throw error;};
const assert=(condition,code,detail)=>{if(!condition)fail(code,detail);};
const hex=(value,size,label)=>assert(typeof value==='string'&&new RegExp(`^[0-9a-f]{${size}}$`).test(value),'E_HEX',label);
const validatePath=(value)=>{assert(typeof value==='string'&&value.length>0&&value===value.normalize('NFC')&&!value.includes('\\')&&!value.startsWith('/')&&!value.split('/').some((part)=>!part||part==='.'||part==='..'),'E_ARTIFACT_PATH',String(value));return value;};
const readJsonFile=(file)=>{const bytes=fs.readFileSync(file);assert(bytes.at(-1)===0x0a,'E_CANONICAL_LF',file);return{bytes,digest:h(bytes),value:JSON.parse(bytes)}};
const defaultGit=(args,options={})=>execFileSync('git',args,{encoding:options.encoding??null,maxBuffer:64*1024*1024});
const gitText=(git,args)=>String(git(args,{encoding:'utf8'})).trim();
const objectBytes=(git,sha,artifactPath)=>git(['show',`${sha}:${validatePath(artifactPath)}`],{encoding:null});
const evaluationTree=(git,sha)=>gitText(git,['rev-parse',`${sha}^{tree}`]);
const ensureEvaluationObject=(git,sha)=>{
  try{return evaluationTree(git,sha);}catch(initialError){
    if(git!==defaultGit)throw initialError;
    try{
      const shallow=gitText(defaultGit,['rev-parse','--is-shallow-repository'])==='true';
      if(shallow)defaultGit(['fetch','--no-tags','--no-write-fetch-head','--unshallow','origin'],{encoding:null});
      try{return evaluationTree(defaultGit,sha);}catch{
        defaultGit(['fetch','--no-tags','--no-write-fetch-head','origin',sha],{encoding:null});
        return evaluationTree(defaultGit,sha);
      }
    }catch{fail('E_EVALUATION_OBJECT_UNAVAILABLE',sha);}
  }
};
const exactKeys=(value,keys,label)=>assert(value&&typeof value==='object'&&!Array.isArray(value)&&JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort()),'E_UNKNOWN_OR_MISSING_FIELD',label);
const finiteId=(value,label)=>{const id=Number(value);assert(Number.isSafeInteger(id)&&id>0,'E_IDENTITY_INVALID',label);return id;};
const rawJsonBytes=(bytes,label)=>{const value=JSON.parse(bytes);return{bytes:Buffer.from(bytes),digest:h(bytes),value,label};};
const atomicCanonicalWrite=(file,value)=>{const temporary=`${file}.tmp-${process.pid}`;fs.writeFileSync(temporary,canonicalBytes(value),{flag:'wx'});fs.renameSync(temporary,file);};

const AUDIT_CYCLE_ATTESTATION_KEYS=Object.freeze([
  'schemaVersion','attestationType','result','stageId','externalSourcePlanDigest','compiledProgramFileDigest','authorityDigest','stageInstanceDigest','stageAdmissionDigest','writeSetDigest','commandScopeDigest','acceptanceSignalsDigest','certificationSetDigest','certificationEvaluationSha','certificationEvaluationTreeSha','certificationStageCount','certificationArtifactBindingDenominator','protectedWipBeforeCarrierDigest','protectedWipBeforeSnapshotDigest','protectedWipBeforeCompleteDenominator','protectedWipBeforeDirtyDenominator','liveRuleset','predecessorPullRequests','correctionDelivery','repository','workflowPath','workflowRunId','runAttempt','event','ref','artifactName','artifactFile','nonRecursiveCarrierPattern','programDoneClaimed','mainProductGraphNodeStarted'
]);
const DURABLE_OUTER_KEYS=Object.freeze(['archive','artifactExpiryIndependent','member','programDone','provenance','schemaVersion','status','verification']);
const DURABLE_PROVENANCE_KEYS=Object.freeze(['provider','repository','workflowPath','runId','runAttempt','headSha','artifactId','artifactName']);
const DURABLE_ARCHIVE_KEYS=Object.freeze(['sha256','sizeBytes']);
const DURABLE_MEMBER_KEYS=Object.freeze(['path','sha256','sizeBytes','canonicalBase64']);
const DURABLE_VERIFICATION_KEYS=Object.freeze(['schemaVersion','status','runId','runAttempt','artifactId','archiveDigest','attestationDigest','evaluationSha','evaluationTreeSha','implementationCandidateSha','certificationSetDigest','terminalRulesetReturnedBytesDigest','terminalRulesetReturnedByteLength','verificationRulesetReturnedBytesDigest','verificationRulesetReturnedByteLength','normalizedRulesetDigest','candidateCiBytesDigest','postmergeCiBytesDigest','programDone']);
const DURABLE_EXPECTATION_KEYS=Object.freeze(['carrierDigest','schemaVersion','provider','repository','workflowPath','runId','runAttempt','headSha','artifactId','artifactName','memberPath','archiveSha256','archiveSizeBytes','memberSha256','memberSizeBytes']);
const DURABLE_MEMBER_LIVE_RULESET_KEYS=Object.freeze(['rulesetId','returnedBytesDigest','returnedByteLength','normalizedRulesetDigest','requiredContexts','protections']);
const DURABLE_MEMBER_PROTECTION_KEYS=Object.freeze(['deletion','nonFastForward','pullRequest','conversationResolution','bypassActorCount']);
const DURABLE_MEMBER_DELIVERY_KEYS=Object.freeze(['implementationCandidateSha','implementationMergeSha','evaluationSha','evaluationTreeSha','candidateCiRunId','candidateCiBytesDigest','exactPostmergeCiRunId','exactPostmergeCiBytesDigest']);
const DURABLE_MEMBER_PR_KEYS=Object.freeze(['candidateSha','mergeSha']);
const AUDIT_CYCLE_2_ATTESTATION_KEYS=Object.freeze([
  'schemaVersion','attestationType','result','stageId','auditReceiptDigest','externalSourcePlanDigest','compiledProgramFileDigest','authorityDigest','stageInstanceDigest','stageAdmissionDigest','writeSetDigest','commandScopeDigest','acceptanceSignalsDigest','certificationSetDigest','certificationEvaluationSha','certificationEvaluationTreeSha','certificationStageCount','certificationArtifactBindingDenominator','protectedWipBeforeCarrierDigest','protectedWipBeforeSnapshotDigest','protectedWipBeforeCompleteDenominator','protectedWipBeforeDirtyDenominator','predecessorCycleEvidence','liveRuleset','verifierRepairs','correctionDelivery','repository','workflowPath','workflowRunId','runAttempt','event','ref','artifactName','artifactFile','nonRecursiveCarrierPattern','programDoneClaimed','mainProductGraphNodeStarted'
]);
const AUDIT_CYCLE_2_PREDECESSOR_KEYS=Object.freeze(['leaseReleaseDigest','terminalReceiptDigest','durableCarrierDigest','durableCarrierValidationSchema']);
const AUDIT_CYCLE_2_REPAIRS_KEYS=Object.freeze(['durableCarrier','liveRuleset']);
const AUDIT_CYCLE_2_DURABLE_REPAIR_KEYS=Object.freeze(['canonicalCarrierDigest','canonicalOuterBytesRequired','expectedCarrierDigestRequired','closedNestedKeysRequired','positiveSizesRequired','exactMemberPathRequired','pinnedProvenanceRequired','cliJsonRequired']);
const AUDIT_CYCLE_2_RULESET_REPAIR_KEYS=Object.freeze(['ruleTypeDenominator','uniqueRuleTypesRequired','closedRoleEnvelopeRequired','explicitBypassActorsRequired','currentUserCanBypassIfPresent']);
const AUDIT_CYCLE_2_DURABLE_VERIFICATION_KEYS=Object.freeze(['schemaVersion','status','runId','runAttempt','artifactId','archiveDigest','attestationDigest','evaluationSha','evaluationTreeSha','implementationCandidateSha','certificationSetDigest','predecessorDurableCarrierDigest','predecessorDurableCarrierValidationSchema','terminalRulesetReturnedBytesDigest','terminalRulesetReturnedByteLength','verificationRulesetReturnedBytesDigest','verificationRulesetReturnedByteLength','normalizedRulesetDigest','candidateCiBytesDigest','postmergeCiBytesDigest','programDone']);

export const AUDIT_CYCLE_1_DURABLE_EXPECTATION=Object.freeze({
  carrierDigest:'596c8fecbc486368e34585505b36b074f1b66ffb5073fc189c086a8e0394db0d',
  schemaVersion:'AUDIT_CYCLE_1_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1',
  provider:'GITHUB_ACTIONS',
  repository:'KirPonomarev/writer-editor',
  workflowPath:'.github/workflows/r24-audit-cycle1-terminal-attestation.yml',
  runId:33353487113,
  runAttempt:1,
  headSha:'79c0bb785bc6ace996d535f06970a0f25338cbbf',
  artifactId:9744372163,
  artifactName:'r24-audit-cycle1-terminal-attestation',
  memberPath:'audit-cycle1-terminal-attestation.json',
  archiveSha256:'0bba8002a24a7ba252c00f896247403a8b148526b0c0d1e7ea21ef32f284866e',
  archiveSizeBytes:1869,
  memberSha256:'50d740b36b3de15ebee327dbd01d2b4165350a6cb76c7eeb6a1c084d2d7e891c',
  memberSizeBytes:3148
});

export function verifyAuditCycleTerminalArtifact({zipBytes,runEvidenceFile,artifactEvidence,rulesetEvidenceFile,candidateCiEvidenceFile,postmergeCiEvidenceFile,authorityFile,instanceFile,admissionFile,certificationFile,beforeFile,git=defaultGit}){
  const run=runEvidenceFile.value;
  assert(run?.repository?.full_name==='KirPonomarev/writer-editor'&&run.path==='.github/workflows/r24-audit-cycle1-terminal-attestation.yml','E_RUN_IDENTITY');
  assert(run.event==='workflow_dispatch'&&run.head_branch==='main'&&run.status==='completed'&&run.conclusion==='success','E_RUN_STATE');
  assert(artifactEvidence?.name==='r24-audit-cycle1-terminal-attestation'&&artifactEvidence.expired===false,'E_ARTIFACT_IDENTITY_OR_EXPIRY');
  assert(finiteId(artifactEvidence.workflow_run?.id,'artifact.workflowRunId')===finiteId(run.id,'run.id'),'E_ARTIFACT_RUN_MISMATCH');
  assert(typeof artifactEvidence.digest==='string'&&artifactEvidence.digest===`sha256:${h(zipBytes)}`,'E_ARCHIVE_DIGEST_MISMATCH');
  const memberBytes=inspectExactZip(zipBytes,'audit-cycle1-terminal-attestation.json');
  const member=JSON.parse(memberBytes);
  assert(memberBytes.equals(canonicalBytes(member)),'E_NON_CANONICAL_ATTESTATION_BYTES');
  exactKeys(member,AUDIT_CYCLE_ATTESTATION_KEYS,'auditCycleAttestation');
  assert(member.schemaVersion==='AUDIT_CYCLE_1_TERMINAL_ATTESTATION_V1'&&member.attestationType==='EXTERNAL_IMMUTABLE_ACCEPTANCE_BOUND_TERMINAL_ATTESTATION'&&member.result==='PASS'&&member.stageId==='AUDIT_CYCLE_1_CORRECTIONS','E_ATTESTATION_SCHEMA');
  assert(member.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&member.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST&&member.externalSourcePlanDigest!==member.compiledProgramFileDigest,'E_SOURCE_PLAN_ROLE_BINDING');
  assert(member.authorityDigest===authorityFile.digest&&member.stageInstanceDigest===instanceFile.digest&&member.stageAdmissionDigest===admissionFile.digest,'E_ADMISSION_FILE_BINDING');
  assert(admissionFile.value.authorityDigest===authorityFile.digest&&admissionFile.value.stageInstanceDigest===instanceFile.digest&&admissionFile.value.status==='ADMITTED','E_ADMISSION_CHAIN');
  for(const field of ['writeSetDigest','commandScopeDigest','acceptanceSignalsDigest'])assert(member[field]===admissionFile.value[field],'E_ADMISSION_SCOPE_BINDING',field);
  assert(member.certificationSetDigest===certificationFile.digest&&member.certificationEvaluationSha===certificationFile.value.evaluationSha&&member.certificationEvaluationTreeSha===certificationFile.value.evaluationTreeSha,'E_CERTIFICATION_FILE_BINDING');
  assert(member.certificationStageCount===EXPECTED_STAGE_COUNT&&member.certificationArtifactBindingDenominator===EXPECTED_ARTIFACT_BINDING_DENOMINATOR,'E_CERTIFICATION_DENOMINATOR');
  assert(member.protectedWipBeforeCarrierDigest===beforeFile.digest&&member.protectedWipBeforeSnapshotDigest===beforeFile.value.snapshot.snapshotSha256&&member.protectedWipBeforeCompleteDenominator===251&&member.protectedWipBeforeDirtyDenominator===7,'E_PROTECTED_WIP_BEFORE_BINDING');
  const rulesetResult=verifyRuleset(rulesetEvidenceFile.value);
  hex(member.liveRuleset.returnedBytesDigest,64,'terminalRulesetReturnedBytesDigest');
  assert(Number.isSafeInteger(member.liveRuleset.returnedByteLength)&&member.liveRuleset.returnedByteLength>0,'E_LIVE_RULESET_RETURNED_BYTES_LENGTH');
  assert(member.liveRuleset.rulesetId===12270444&&member.liveRuleset.normalizedRulesetDigest===rulesetResult.normalizedRulesetDigest,'E_LIVE_RULESET_BINDING');
  assert(canonicalBytes(member.liveRuleset.requiredContexts).equals(canonicalBytes(rulesetResult.requiredContexts))&&canonicalBytes(member.liveRuleset.protections).equals(canonicalBytes(rulesetResult.protections)),'E_LIVE_RULESET_SEMANTIC_VIEW');
  assert(JSON.stringify(member.liveRuleset.requiredContexts)===JSON.stringify(['merge-gate'])&&member.liveRuleset.protections.bypassActorCount===0&&member.liveRuleset.protections.conversationResolution===true,'E_LIVE_RULESET_POLICY');
  assert(member.predecessorPullRequests?.pr1776?.candidateSha==='77354cfe994588dc1771f3eded29d1e7e68d703f'&&member.predecessorPullRequests.pr1776.mergeSha==='af0bfb704c13b0195c12b0144415f2e769f99752','E_PR1776_IDENTITY');
  assert(member.predecessorPullRequests?.pr1777?.candidateSha==='bf3d21072879d276ca3489b0bbead780fb39f596'&&member.predecessorPullRequests.pr1777.mergeSha==='0a8837ae8b0724fa9c258d98281cae693ce0693e','E_PR1777_IDENTITY');
  const delivery=member.correctionDelivery;
  for(const field of ['implementationCandidateSha','implementationMergeSha','evaluationSha','evaluationTreeSha'])hex(delivery[field],40,field);
  assert(delivery.implementationMergeSha===delivery.evaluationSha&&delivery.evaluationSha===run.head_sha,'E_EVALUATION_RUN_HEAD');
  assert(gitText(git,['rev-parse',`${delivery.evaluationSha}^{tree}`])===delivery.evaluationTreeSha,'E_EVALUATION_TREE');
  assert(gitText(git,['rev-parse',`${delivery.implementationMergeSha}^2`])===delivery.implementationCandidateSha,'E_CANDIDATE_SECOND_PARENT');
  try{git(['merge-base','--is-ancestor',delivery.implementationCandidateSha,delivery.implementationMergeSha],{encoding:null});}catch{fail('E_CANDIDATE_ANCESTRY');}
  try{git(['merge-base','--is-ancestor',certificationFile.value.evaluationSha,delivery.implementationCandidateSha],{encoding:null});}catch{fail('E_CERTIFICATION_EVALUATION_ANCESTRY');}
  assert(finiteId(delivery.candidateCiRunId,'candidateCiRunId')===finiteId(candidateCiEvidenceFile.value.id,'candidateCi.id')&&candidateCiEvidenceFile.value.status==='completed'&&candidateCiEvidenceFile.value.conclusion==='success'&&candidateCiEvidenceFile.value.head_sha===delivery.implementationCandidateSha&&delivery.candidateCiBytesDigest===candidateCiEvidenceFile.digest,'E_CANDIDATE_CI_BINDING');
  assert(finiteId(delivery.exactPostmergeCiRunId,'postmergeCiRunId')===finiteId(postmergeCiEvidenceFile.value.id,'postmergeCi.id')&&postmergeCiEvidenceFile.value.status==='completed'&&postmergeCiEvidenceFile.value.conclusion==='success'&&postmergeCiEvidenceFile.value.head_sha===delivery.implementationMergeSha&&delivery.exactPostmergeCiBytesDigest===postmergeCiEvidenceFile.digest,'E_POSTMERGE_CI_BINDING');
  assert(member.repository==='KirPonomarev/writer-editor'&&member.workflowPath===run.path&&finiteId(member.workflowRunId,'workflowRunId')===finiteId(run.id,'run.id')&&finiteId(member.runAttempt,'runAttempt')===finiteId(run.run_attempt,'runAttempt'),'E_RUN_BINDING');
  assert(member.event==='workflow_dispatch'&&member.ref==='refs/heads/main'&&member.artifactName===artifactEvidence.name&&member.artifactFile==='audit-cycle1-terminal-attestation.json','E_ISSUER_BINDING');
  assert(member.nonRecursiveCarrierPattern===true&&member.programDoneClaimed===false&&member.mainProductGraphNodeStarted===false,'E_TERMINAL_SCOPE');
  return{verification:{schemaVersion:'AUDIT_CYCLE_1_TERMINAL_ATTESTATION_VALIDATION_V1',status:'VERIFIED',runId:finiteId(run.id,'run.id'),runAttempt:finiteId(run.run_attempt,'runAttempt'),artifactId:finiteId(artifactEvidence.id,'artifact.id'),archiveDigest:`sha256:${h(zipBytes)}`,attestationDigest:h(memberBytes),evaluationSha:delivery.evaluationSha,evaluationTreeSha:delivery.evaluationTreeSha,implementationCandidateSha:delivery.implementationCandidateSha,certificationSetDigest:certificationFile.digest,terminalRulesetReturnedBytesDigest:member.liveRuleset.returnedBytesDigest,terminalRulesetReturnedByteLength:member.liveRuleset.returnedByteLength,verificationRulesetReturnedBytesDigest:rulesetEvidenceFile.digest,verificationRulesetReturnedByteLength:rulesetEvidenceFile.bytes.length,normalizedRulesetDigest:rulesetResult.normalizedRulesetDigest,candidateCiBytesDigest:candidateCiEvidenceFile.digest,postmergeCiBytesDigest:postmergeCiEvidenceFile.digest,programDone:false},memberBytes,member};
}

export function createAuditCycleDurableCarrier({zipBytes,memberBytes,runEvidenceFile,artifactEvidence,verification}){
  return{schemaVersion:'AUDIT_CYCLE_1_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1',status:'VERIFIED_DURABLE_CANONICAL_CARRIER',provenance:{provider:'GITHUB_ACTIONS',repository:runEvidenceFile.value.repository.full_name,workflowPath:runEvidenceFile.value.path,runId:finiteId(runEvidenceFile.value.id,'run.id'),runAttempt:finiteId(runEvidenceFile.value.run_attempt,'runAttempt'),headSha:runEvidenceFile.value.head_sha,artifactId:finiteId(artifactEvidence.id,'artifact.id'),artifactName:artifactEvidence.name},archive:{sha256:h(zipBytes),sizeBytes:zipBytes.length},member:{path:'audit-cycle1-terminal-attestation.json',sha256:h(memberBytes),sizeBytes:memberBytes.length,canonicalBase64:memberBytes.toString('base64')},verification,artifactExpiryIndependent:true,programDone:false};
}

export function verifyAuditCycleDurableCarrier(file,expectation=AUDIT_CYCLE_1_DURABLE_EXPECTATION){
  exactKeys(file,['bytes','digest','value'],'durableFile');
  exactKeys(expectation,DURABLE_EXPECTATION_KEYS,'durableExpectation');
  const {bytes:fileBytes,digest,value}=file;
  assert(Buffer.isBuffer(fileBytes),'E_DURABLE_FILE_BYTES');
  hex(digest,64,'carrierDigest');
  hex(expectation.carrierDigest,64,'expectedCarrierDigest');
  assert(h(fileBytes)===digest&&digest===expectation.carrierDigest,'E_DURABLE_CARRIER_DIGEST');
  assert(fileBytes.equals(canonicalBytes(value)),'E_DURABLE_OUTER_CANONICAL_BYTES');
  exactKeys(value,DURABLE_OUTER_KEYS,'durableCarrier');
  exactKeys(value.provenance,DURABLE_PROVENANCE_KEYS,'durableCarrier.provenance');
  exactKeys(value.archive,DURABLE_ARCHIVE_KEYS,'durableCarrier.archive');
  exactKeys(value.member,DURABLE_MEMBER_KEYS,'durableCarrier.member');
  exactKeys(value.verification,DURABLE_VERIFICATION_KEYS,'durableCarrier.verification');
  assert(value.schemaVersion===expectation.schemaVersion&&value.status==='VERIFIED_DURABLE_CANONICAL_CARRIER','E_DURABLE_SCHEMA');
  const provenance=value.provenance;
  assert(provenance.provider===expectation.provider&&provenance.repository===expectation.repository&&provenance.workflowPath===expectation.workflowPath,'E_DURABLE_PROVENANCE_PROVIDER');
  assert(provenance.runId===expectation.runId&&provenance.runAttempt===expectation.runAttempt&&provenance.headSha===expectation.headSha&&provenance.artifactId===expectation.artifactId&&provenance.artifactName===expectation.artifactName,'E_DURABLE_PROVENANCE_IDENTITY');
  assert(value.archive.sha256===expectation.archiveSha256&&value.archive.sizeBytes===expectation.archiveSizeBytes&&Number.isSafeInteger(value.archive.sizeBytes)&&value.archive.sizeBytes>0,'E_DURABLE_ARCHIVE_BINDING');
  assert(value.member.path===expectation.memberPath&&value.member.sha256===expectation.memberSha256&&value.member.sizeBytes===expectation.memberSizeBytes&&Number.isSafeInteger(value.member.sizeBytes)&&value.member.sizeBytes>0,'E_DURABLE_MEMBER_BINDING');
  assert(typeof value.member.canonicalBase64==='string'&&value.member.canonicalBase64.length>0&&/^[A-Za-z0-9+/]+={0,2}$/.test(value.member.canonicalBase64),'E_DURABLE_MEMBER_BASE64');
  const memberBytes=Buffer.from(value.member.canonicalBase64,'base64');
  assert(memberBytes.toString('base64')===value.member.canonicalBase64,'E_DURABLE_MEMBER_BASE64');
  assert(memberBytes.length===value.member.sizeBytes&&h(memberBytes)===value.member.sha256,'E_DURABLE_MEMBER');
  const member=JSON.parse(memberBytes);
  assert(memberBytes.equals(canonicalBytes(member)),'E_DURABLE_MEMBER_CANONICAL_BYTES');
  exactKeys(member,AUDIT_CYCLE_ATTESTATION_KEYS,'durableCarrier.member.attestation');
  exactKeys(member.liveRuleset,DURABLE_MEMBER_LIVE_RULESET_KEYS,'durableCarrier.member.liveRuleset');
  exactKeys(member.liveRuleset.protections,DURABLE_MEMBER_PROTECTION_KEYS,'durableCarrier.member.liveRuleset.protections');
  exactKeys(member.predecessorPullRequests,['pr1776','pr1777'],'durableCarrier.member.predecessorPullRequests');
  exactKeys(member.predecessorPullRequests.pr1776,DURABLE_MEMBER_PR_KEYS,'durableCarrier.member.predecessorPullRequests.pr1776');
  exactKeys(member.predecessorPullRequests.pr1777,DURABLE_MEMBER_PR_KEYS,'durableCarrier.member.predecessorPullRequests.pr1777');
  exactKeys(member.correctionDelivery,DURABLE_MEMBER_DELIVERY_KEYS,'durableCarrier.member.correctionDelivery');
  assert(member.schemaVersion==='AUDIT_CYCLE_1_TERMINAL_ATTESTATION_V1'&&member.result==='PASS'&&member.stageId==='AUDIT_CYCLE_1_CORRECTIONS','E_DURABLE_MEMBER_SCHEMA');
  assert(member.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&member.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST&&member.externalSourcePlanDigest!==member.compiledProgramFileDigest,'E_DURABLE_MEMBER_SOURCE_ROLES');
  assert(member.repository===expectation.repository&&member.workflowPath===expectation.workflowPath&&member.workflowRunId===expectation.runId&&member.runAttempt===expectation.runAttempt&&member.artifactName===expectation.artifactName&&member.artifactFile===expectation.memberPath,'E_DURABLE_MEMBER_PROVENANCE');
  assert(member.correctionDelivery.evaluationSha===expectation.headSha&&member.correctionDelivery.implementationMergeSha===expectation.headSha&&member.correctionDelivery.implementationCandidateSha===value.verification.implementationCandidateSha,'E_DURABLE_MEMBER_DELIVERY');
  assert(member.programDoneClaimed===false&&member.mainProductGraphNodeStarted===false&&member.nonRecursiveCarrierPattern===true,'E_DURABLE_MEMBER_SCOPE');
  const verification=value.verification;
  assert(verification.runId===expectation.runId&&verification.runAttempt===expectation.runAttempt&&verification.artifactId===expectation.artifactId&&verification.evaluationSha===expectation.headSha,'E_DURABLE_VERIFICATION_IDENTITY');
  assert(verification.attestationDigest===expectation.memberSha256&&verification.attestationDigest===value.member.sha256&&verification.archiveDigest===`sha256:${expectation.archiveSha256}`&&verification.archiveDigest===`sha256:${value.archive.sha256}`,'E_DURABLE_VERIFICATION_DIGESTS');
  assert(verification.certificationSetDigest===member.certificationSetDigest&&verification.evaluationTreeSha===member.correctionDelivery.evaluationTreeSha&&verification.candidateCiBytesDigest===member.correctionDelivery.candidateCiBytesDigest&&verification.postmergeCiBytesDigest===member.correctionDelivery.exactPostmergeCiBytesDigest,'E_DURABLE_VERIFICATION_MEMBER_BINDING');
  assert(verification.status==='VERIFIED'&&verification.schemaVersion==='AUDIT_CYCLE_1_TERMINAL_ATTESTATION_VALIDATION_V1'&&verification.programDone===false&&value.artifactExpiryIndependent===true&&value.programDone===false,'E_DURABLE_POLICY');
  return{schemaVersion:'AUDIT_CYCLE_1_DURABLE_CARRIER_VALIDATION_V2',status:'VERIFIED',carrierDigest:digest,attestationDigest:value.member.sha256,runId:value.provenance.runId,artifactId:value.provenance.artifactId,programDone:false};
}

export function verifyAuditCycle2TerminalArtifact({zipBytes,runEvidenceFile,artifactEvidence,rulesetEvidenceFile,candidateCiEvidenceFile,postmergeCiEvidenceFile,authorityFile,instanceFile,admissionFile,certificationFile,beforeFile,predecessorReleaseFile,predecessorReceiptFile,predecessorDurableFile,git=defaultGit}){
  const run=runEvidenceFile.value;
  assert(run?.repository?.full_name==='KirPonomarev/writer-editor'&&run.path==='.github/workflows/r24-audit-cycle2-terminal-attestation.yml','E_CYCLE2_RUN_IDENTITY');
  assert(run.event==='workflow_dispatch'&&run.head_branch==='main'&&run.status==='completed'&&run.conclusion==='success','E_CYCLE2_RUN_STATE');
  assert(artifactEvidence?.name==='r24-audit-cycle2-terminal-attestation'&&artifactEvidence.expired===false,'E_CYCLE2_ARTIFACT_IDENTITY_OR_EXPIRY');
  assert(finiteId(artifactEvidence.workflow_run?.id,'cycle2.artifact.workflowRunId')===finiteId(run.id,'cycle2.run.id'),'E_CYCLE2_ARTIFACT_RUN_MISMATCH');
  assert(typeof artifactEvidence.digest==='string'&&artifactEvidence.digest===`sha256:${h(zipBytes)}`,'E_CYCLE2_ARCHIVE_DIGEST_MISMATCH');
  const memberBytes=inspectExactZip(zipBytes,'audit-cycle2-terminal-attestation.json');
  const member=JSON.parse(memberBytes);
  assert(memberBytes.equals(canonicalBytes(member)),'E_CYCLE2_NON_CANONICAL_ATTESTATION_BYTES');
  exactKeys(member,AUDIT_CYCLE_2_ATTESTATION_KEYS,'auditCycle2Attestation');
  exactKeys(member.predecessorCycleEvidence,AUDIT_CYCLE_2_PREDECESSOR_KEYS,'auditCycle2Attestation.predecessorCycleEvidence');
  exactKeys(member.liveRuleset,DURABLE_MEMBER_LIVE_RULESET_KEYS,'auditCycle2Attestation.liveRuleset');
  exactKeys(member.liveRuleset.protections,DURABLE_MEMBER_PROTECTION_KEYS,'auditCycle2Attestation.liveRuleset.protections');
  exactKeys(member.verifierRepairs,AUDIT_CYCLE_2_REPAIRS_KEYS,'auditCycle2Attestation.verifierRepairs');
  exactKeys(member.verifierRepairs.durableCarrier,AUDIT_CYCLE_2_DURABLE_REPAIR_KEYS,'auditCycle2Attestation.verifierRepairs.durableCarrier');
  exactKeys(member.verifierRepairs.liveRuleset,AUDIT_CYCLE_2_RULESET_REPAIR_KEYS,'auditCycle2Attestation.verifierRepairs.liveRuleset');
  exactKeys(member.correctionDelivery,DURABLE_MEMBER_DELIVERY_KEYS,'auditCycle2Attestation.correctionDelivery');
  assert(member.schemaVersion==='AUDIT_CYCLE_2_TERMINAL_ATTESTATION_V1'&&member.attestationType==='EXTERNAL_IMMUTABLE_ACCEPTANCE_BOUND_TERMINAL_ATTESTATION'&&member.result==='PASS'&&member.stageId==='AUDIT_CYCLE_2_CORRECTIONS','E_CYCLE2_ATTESTATION_SCHEMA');
  assert(member.auditReceiptDigest==='babdb1ed4e37d9e8b3b8234ec4b3e86d72d43b3c2fe26a1511a5d3de1a92af70','E_CYCLE2_AUDIT_RECEIPT');
  assert(member.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&member.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST&&member.externalSourcePlanDigest!==member.compiledProgramFileDigest,'E_CYCLE2_SOURCE_PLAN_ROLE_BINDING');
  assert(member.authorityDigest===authorityFile.digest&&member.stageInstanceDigest===instanceFile.digest&&member.stageAdmissionDigest===admissionFile.digest,'E_CYCLE2_ADMISSION_FILE_BINDING');
  assert(admissionFile.value.authorityDigest===authorityFile.digest&&admissionFile.value.stageInstanceDigest===instanceFile.digest&&admissionFile.value.status==='ADMITTED'&&admissionFile.value.lease?.fencingCounter===58&&admissionFile.value.lease?.wip===1,'E_CYCLE2_ADMISSION_CHAIN');
  for(const field of ['writeSetDigest','commandScopeDigest','acceptanceSignalsDigest'])assert(member[field]===admissionFile.value[field],'E_CYCLE2_ADMISSION_SCOPE_BINDING',field);
  assert(member.certificationSetDigest===certificationFile.digest&&member.certificationEvaluationSha===certificationFile.value.evaluationSha&&member.certificationEvaluationTreeSha===certificationFile.value.evaluationTreeSha,'E_CYCLE2_CERTIFICATION_FILE_BINDING');
  assert(member.certificationStageCount===EXPECTED_STAGE_COUNT&&member.certificationArtifactBindingDenominator===EXPECTED_ARTIFACT_BINDING_DENOMINATOR,'E_CYCLE2_CERTIFICATION_DENOMINATOR');
  assert(member.protectedWipBeforeCarrierDigest===beforeFile.digest&&member.protectedWipBeforeSnapshotDigest===beforeFile.value.snapshotSha256&&member.protectedWipBeforeCompleteDenominator===252&&member.protectedWipBeforeDirtyDenominator===7,'E_CYCLE2_PROTECTED_WIP_BEFORE_BINDING');
  const predecessorValidation=verifyAuditCycleDurableCarrier(predecessorDurableFile);
  assert(member.predecessorCycleEvidence.leaseReleaseDigest===predecessorReleaseFile.digest&&member.predecessorCycleEvidence.terminalReceiptDigest===predecessorReceiptFile.digest&&member.predecessorCycleEvidence.durableCarrierDigest===predecessorDurableFile.digest&&member.predecessorCycleEvidence.durableCarrierValidationSchema===predecessorValidation.schemaVersion,'E_CYCLE2_PREDECESSOR_BINDING');
  const rulesetResult=verifyRuleset(rulesetEvidenceFile.value);
  hex(member.liveRuleset.returnedBytesDigest,64,'cycle2.terminalRulesetReturnedBytesDigest');
  assert(member.liveRuleset.rulesetId===12270444&&Number.isSafeInteger(member.liveRuleset.returnedByteLength)&&member.liveRuleset.returnedByteLength>0&&member.liveRuleset.normalizedRulesetDigest===rulesetResult.normalizedRulesetDigest,'E_CYCLE2_LIVE_RULESET_BINDING');
  assert(canonicalBytes(member.liveRuleset.requiredContexts).equals(canonicalBytes(rulesetResult.requiredContexts))&&canonicalBytes(member.liveRuleset.protections).equals(canonicalBytes(rulesetResult.protections)),'E_CYCLE2_LIVE_RULESET_VIEW');
  assert(JSON.stringify(member.liveRuleset.requiredContexts)===JSON.stringify(['merge-gate'])&&member.liveRuleset.protections.bypassActorCount===0&&member.liveRuleset.protections.conversationResolution===true,'E_CYCLE2_LIVE_RULESET_POLICY');
  assert(canonicalBytes(member.verifierRepairs.durableCarrier).equals(canonicalBytes({canonicalCarrierDigest:AUDIT_CYCLE_1_DURABLE_EXPECTATION.carrierDigest,canonicalOuterBytesRequired:true,expectedCarrierDigestRequired:true,closedNestedKeysRequired:true,positiveSizesRequired:true,exactMemberPathRequired:true,pinnedProvenanceRequired:true,cliJsonRequired:true})),'E_CYCLE2_DURABLE_REPAIR');
  assert(canonicalBytes(member.verifierRepairs.liveRuleset).equals(canonicalBytes({ruleTypeDenominator:4,uniqueRuleTypesRequired:true,closedRoleEnvelopeRequired:true,explicitBypassActorsRequired:true,currentUserCanBypassIfPresent:'never'})),'E_CYCLE2_RULESET_REPAIR');
  const delivery=member.correctionDelivery;
  for(const field of ['implementationCandidateSha','implementationMergeSha','evaluationSha','evaluationTreeSha'])hex(delivery[field],40,`cycle2.${field}`);
  assert(delivery.implementationMergeSha===delivery.evaluationSha&&delivery.evaluationSha===run.head_sha,'E_CYCLE2_EVALUATION_RUN_HEAD');
  assert(gitText(git,['rev-parse',`${delivery.evaluationSha}^{tree}`])===delivery.evaluationTreeSha,'E_CYCLE2_EVALUATION_TREE');
  assert(gitText(git,['rev-parse',`${delivery.implementationMergeSha}^2`])===delivery.implementationCandidateSha,'E_CYCLE2_CANDIDATE_SECOND_PARENT');
  try{git(['merge-base','--is-ancestor',delivery.implementationCandidateSha,delivery.implementationMergeSha],{encoding:null});}catch{fail('E_CYCLE2_CANDIDATE_ANCESTRY');}
  try{git(['merge-base','--is-ancestor',certificationFile.value.evaluationSha,delivery.implementationCandidateSha],{encoding:null});}catch{fail('E_CYCLE2_CERTIFICATION_EVALUATION_ANCESTRY');}
  assert(finiteId(delivery.candidateCiRunId,'cycle2.candidateCiRunId')===finiteId(candidateCiEvidenceFile.value.id,'cycle2.candidateCi.id')&&candidateCiEvidenceFile.value.status==='completed'&&candidateCiEvidenceFile.value.conclusion==='success'&&candidateCiEvidenceFile.value.head_sha===delivery.implementationCandidateSha&&delivery.candidateCiBytesDigest===candidateCiEvidenceFile.digest,'E_CYCLE2_CANDIDATE_CI_BINDING');
  assert(finiteId(delivery.exactPostmergeCiRunId,'cycle2.postmergeCiRunId')===finiteId(postmergeCiEvidenceFile.value.id,'cycle2.postmergeCi.id')&&postmergeCiEvidenceFile.value.status==='completed'&&postmergeCiEvidenceFile.value.conclusion==='success'&&postmergeCiEvidenceFile.value.head_sha===delivery.implementationMergeSha&&delivery.exactPostmergeCiBytesDigest===postmergeCiEvidenceFile.digest,'E_CYCLE2_POSTMERGE_CI_BINDING');
  assert(member.repository==='KirPonomarev/writer-editor'&&member.workflowPath===run.path&&finiteId(member.workflowRunId,'cycle2.workflowRunId')===finiteId(run.id,'cycle2.run.id')&&finiteId(member.runAttempt,'cycle2.runAttempt')===finiteId(run.run_attempt,'cycle2.runAttempt'),'E_CYCLE2_RUN_BINDING');
  assert(member.event==='workflow_dispatch'&&member.ref==='refs/heads/main'&&member.artifactName===artifactEvidence.name&&member.artifactFile==='audit-cycle2-terminal-attestation.json','E_CYCLE2_ISSUER_BINDING');
  assert(member.nonRecursiveCarrierPattern===true&&member.programDoneClaimed===false&&member.mainProductGraphNodeStarted===false,'E_CYCLE2_TERMINAL_SCOPE');
  return{verification:{schemaVersion:'AUDIT_CYCLE_2_TERMINAL_ATTESTATION_VALIDATION_V1',status:'VERIFIED',runId:finiteId(run.id,'cycle2.run.id'),runAttempt:finiteId(run.run_attempt,'cycle2.runAttempt'),artifactId:finiteId(artifactEvidence.id,'cycle2.artifact.id'),archiveDigest:`sha256:${h(zipBytes)}`,attestationDigest:h(memberBytes),evaluationSha:delivery.evaluationSha,evaluationTreeSha:delivery.evaluationTreeSha,implementationCandidateSha:delivery.implementationCandidateSha,certificationSetDigest:certificationFile.digest,predecessorDurableCarrierDigest:predecessorDurableFile.digest,predecessorDurableCarrierValidationSchema:predecessorValidation.schemaVersion,terminalRulesetReturnedBytesDigest:member.liveRuleset.returnedBytesDigest,terminalRulesetReturnedByteLength:member.liveRuleset.returnedByteLength,verificationRulesetReturnedBytesDigest:rulesetEvidenceFile.digest,verificationRulesetReturnedByteLength:rulesetEvidenceFile.bytes.length,normalizedRulesetDigest:rulesetResult.normalizedRulesetDigest,candidateCiBytesDigest:candidateCiEvidenceFile.digest,postmergeCiBytesDigest:postmergeCiEvidenceFile.digest,programDone:false},memberBytes,member};
}

export function createAuditCycle2DurableCarrier({zipBytes,memberBytes,runEvidenceFile,artifactEvidence,verification}){
  return{schemaVersion:'AUDIT_CYCLE_2_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1',status:'VERIFIED_DURABLE_CANONICAL_CARRIER',provenance:{provider:'GITHUB_ACTIONS',repository:runEvidenceFile.value.repository.full_name,workflowPath:runEvidenceFile.value.path,runId:finiteId(runEvidenceFile.value.id,'cycle2.run.id'),runAttempt:finiteId(runEvidenceFile.value.run_attempt,'cycle2.runAttempt'),headSha:runEvidenceFile.value.head_sha,artifactId:finiteId(artifactEvidence.id,'cycle2.artifact.id'),artifactName:artifactEvidence.name},archive:{sha256:h(zipBytes),sizeBytes:zipBytes.length},member:{path:'audit-cycle2-terminal-attestation.json',sha256:h(memberBytes),sizeBytes:memberBytes.length,canonicalBase64:memberBytes.toString('base64')},verification,artifactExpiryIndependent:true,programDone:false};
}

export function verifyAuditCycle2DurableCarrier(file,{expectedCarrierDigest}){
  exactKeys(file,['bytes','digest','value'],'auditCycle2DurableFile');
  hex(expectedCarrierDigest,64,'cycle2.expectedCarrierDigest');
  const {bytes:fileBytes,digest,value}=file;
  assert(Buffer.isBuffer(fileBytes)&&h(fileBytes)===digest&&digest===expectedCarrierDigest,'E_CYCLE2_DURABLE_CARRIER_DIGEST');
  assert(fileBytes.equals(canonicalBytes(value)),'E_CYCLE2_DURABLE_OUTER_CANONICAL_BYTES');
  exactKeys(value,DURABLE_OUTER_KEYS,'auditCycle2DurableCarrier');
  exactKeys(value.provenance,DURABLE_PROVENANCE_KEYS,'auditCycle2DurableCarrier.provenance');
  exactKeys(value.archive,DURABLE_ARCHIVE_KEYS,'auditCycle2DurableCarrier.archive');
  exactKeys(value.member,DURABLE_MEMBER_KEYS,'auditCycle2DurableCarrier.member');
  exactKeys(value.verification,AUDIT_CYCLE_2_DURABLE_VERIFICATION_KEYS,'auditCycle2DurableCarrier.verification');
  assert(value.schemaVersion==='AUDIT_CYCLE_2_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1'&&value.status==='VERIFIED_DURABLE_CANONICAL_CARRIER','E_CYCLE2_DURABLE_SCHEMA');
  assert(value.provenance.provider==='GITHUB_ACTIONS'&&value.provenance.repository==='KirPonomarev/writer-editor'&&value.provenance.workflowPath==='.github/workflows/r24-audit-cycle2-terminal-attestation.yml'&&value.provenance.artifactName==='r24-audit-cycle2-terminal-attestation','E_CYCLE2_DURABLE_PROVENANCE');
  assert(Number.isSafeInteger(value.archive.sizeBytes)&&value.archive.sizeBytes>0&&typeof value.archive.sha256==='string','E_CYCLE2_DURABLE_ARCHIVE');
  assert(value.member.path==='audit-cycle2-terminal-attestation.json'&&Number.isSafeInteger(value.member.sizeBytes)&&value.member.sizeBytes>0&&typeof value.member.canonicalBase64==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(value.member.canonicalBase64),'E_CYCLE2_DURABLE_MEMBER_BINDING');
  const memberBytes=Buffer.from(value.member.canonicalBase64,'base64');
  assert(memberBytes.toString('base64')===value.member.canonicalBase64&&memberBytes.length===value.member.sizeBytes&&h(memberBytes)===value.member.sha256,'E_CYCLE2_DURABLE_MEMBER');
  const member=JSON.parse(memberBytes);
  assert(memberBytes.equals(canonicalBytes(member)),'E_CYCLE2_DURABLE_MEMBER_CANONICAL_BYTES');
  exactKeys(member,AUDIT_CYCLE_2_ATTESTATION_KEYS,'auditCycle2DurableCarrier.member.attestation');
  exactKeys(member.predecessorCycleEvidence,AUDIT_CYCLE_2_PREDECESSOR_KEYS,'auditCycle2DurableCarrier.member.predecessorCycleEvidence');
  exactKeys(member.liveRuleset,DURABLE_MEMBER_LIVE_RULESET_KEYS,'auditCycle2DurableCarrier.member.liveRuleset');
  exactKeys(member.liveRuleset.protections,DURABLE_MEMBER_PROTECTION_KEYS,'auditCycle2DurableCarrier.member.liveRuleset.protections');
  exactKeys(member.verifierRepairs,AUDIT_CYCLE_2_REPAIRS_KEYS,'auditCycle2DurableCarrier.member.verifierRepairs');
  exactKeys(member.correctionDelivery,DURABLE_MEMBER_DELIVERY_KEYS,'auditCycle2DurableCarrier.member.correctionDelivery');
  assert(member.schemaVersion==='AUDIT_CYCLE_2_TERMINAL_ATTESTATION_V1'&&member.result==='PASS'&&member.stageId==='AUDIT_CYCLE_2_CORRECTIONS','E_CYCLE2_DURABLE_MEMBER_SCHEMA');
  assert(member.repository===value.provenance.repository&&member.workflowPath===value.provenance.workflowPath&&member.workflowRunId===value.provenance.runId&&member.runAttempt===value.provenance.runAttempt&&member.artifactName===value.provenance.artifactName&&member.artifactFile===value.member.path,'E_CYCLE2_DURABLE_MEMBER_PROVENANCE');
  assert(member.correctionDelivery.evaluationSha===value.provenance.headSha&&member.correctionDelivery.evaluationSha===value.verification.evaluationSha&&member.correctionDelivery.evaluationTreeSha===value.verification.evaluationTreeSha&&member.correctionDelivery.implementationCandidateSha===value.verification.implementationCandidateSha,'E_CYCLE2_DURABLE_MEMBER_DELIVERY');
  assert(value.verification.runId===value.provenance.runId&&value.verification.runAttempt===value.provenance.runAttempt&&value.verification.artifactId===value.provenance.artifactId,'E_CYCLE2_DURABLE_VERIFICATION_IDENTITY');
  assert(value.verification.attestationDigest===value.member.sha256&&value.verification.archiveDigest===`sha256:${value.archive.sha256}`&&value.verification.certificationSetDigest===member.certificationSetDigest&&value.verification.predecessorDurableCarrierDigest===member.predecessorCycleEvidence.durableCarrierDigest&&value.verification.predecessorDurableCarrierValidationSchema===member.predecessorCycleEvidence.durableCarrierValidationSchema,'E_CYCLE2_DURABLE_VERIFICATION_BINDING');
  assert(value.verification.schemaVersion==='AUDIT_CYCLE_2_TERMINAL_ATTESTATION_VALIDATION_V1'&&value.verification.status==='VERIFIED'&&value.verification.programDone===false&&member.programDoneClaimed===false&&member.mainProductGraphNodeStarted===false&&member.nonRecursiveCarrierPattern===true&&value.artifactExpiryIndependent===true&&value.programDone===false,'E_CYCLE2_DURABLE_POLICY');
  return{schemaVersion:'AUDIT_CYCLE_2_DURABLE_CARRIER_VALIDATION_V1',status:'VERIFIED',carrierDigest:digest,attestationDigest:value.member.sha256,runId:value.provenance.runId,artifactId:value.provenance.artifactId,programDone:false};
}

export function generateCertificationSet({sourceFile,evaluationSha,evaluationTreeSha,git=defaultGit}){
  hex(evaluationSha,40,'evaluationSha');hex(evaluationTreeSha,40,'evaluationTreeSha');
  assert(ensureEvaluationObject(git,evaluationSha)===evaluationTreeSha,'E_EVALUATION_TREE');
  const source=readJsonFile(sourceFile);
  assert(source.value.schemaVersion==='POST_AUDIT_CURRENT_CERTIFICATION_SET_V1','E_SOURCE_SCHEMA');
  assert(source.value.stages.length===EXPECTED_STAGE_COUNT,'E_STAGE_DENOMINATOR');
  let denominator=0;
  const stages=source.value.stages.map((stage)=>({
    ...stage,
    effectiveState:'CERTIFIED_DONE',
    evaluationSha,
    evaluationTreeSha,
    certificationBasis:'AUDIT_CYCLE_1_COMPLETE_GIT_OBJECT_REHASH_AND_EXACT_33_STAGE_REPLAY',
    artifactBindings:stage.artifactBindings.map((binding)=>{
      denominator+=1;
      let bytes;
      try{bytes=objectBytes(git,evaluationSha,binding.path);}catch{fail('E_ARTIFACT_MISSING',binding.path);}
      return{path:binding.path,sha256:h(bytes)};
    })
  }));
  assert(denominator===EXPECTED_ARTIFACT_BINDING_DENOMINATOR,'E_ARTIFACT_DENOMINATOR',String(denominator));
  return{
    schemaVersion:'POST_AUDIT_CURRENT_CERTIFICATION_SET_V2',
    certificationSetId:'AUDIT_CYCLE_1_EXACT_GIT_OBJECT_CERTIFICATION_SET',
    status:'CERTIFIED_DONE',
    supersedesDigest:source.digest,
    programId:source.value.programId,
    externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,
    compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST,
    evaluationSha,evaluationTreeSha,
    effectiveStateEnum:source.value.effectiveStateEnum,
    generation:{algorithm:'READ_ONLY_GIT_SHOW_EVALUATION_SHA_COLON_REPO_RELATIVE_PATH_SHA256_EXACT_BYTES',sourceSetDigest:source.digest,gitObjectLookupOnly:true,selfHashEqualityRequired:false},
    postEvaluationCarrierException:{policy:'NON_RECURSIVE_INDEPENDENT_PROOF_CARRIERS_OR_STRICTLY_NECESSARY_GOVERNANCE_APPROVAL_ONLY_NO_CERTIFIED_ARTIFACT_BINDING_MAY_POSTDATE_EVALUATION',allowedPaths:[...ALLOWED_POST_EVALUATION_CARRIERS],machineCheckedCandidateDiff:true},
    stages,
    stageCount:stages.length,
    artifactBindingDenominator:denominator,
    verifiedArtifactBindingCount:denominator,
    missingArtifactBindingCount:0,
    mismatchedArtifactBindingCount:0,
    allDeclaredBindingsResolvedFromEvaluationGitObjects:true,
    requiredOrUnexplainedSkips:0,
    programDone:false,
    mainProductGraphNodeStarted:false
  };
}

export function verifyAuditCycle2PostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const expectation=AUDIT_CYCLE_2_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest,'E_CYCLE2_EXCEPTION_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId===expectation.authorityId,'E_CYCLE2_EXCEPTION_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.stageId==='AUDIT_CYCLE_2_CORRECTIONS'&&instance.value.authorityId===authority.value.authorityId,'E_CYCLE2_EXCEPTION_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR','E_CYCLE2_EXCEPTION_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest,'E_CYCLE2_EXCEPTION_CHAIN');
  assert(admission.value.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&admission.value.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST,'E_CYCLE2_EXCEPTION_SOURCE_ROLES');
  assert(admission.value.lease?.fencingCounter===expectation.fencingCounter&&admission.value.lease.status==='ACTIVE'&&admission.value.lease.wip===1,'E_CYCLE2_EXCEPTION_LEASE');
  const authorization=authority.value.predecessors.find((entry)=>entry.id==='AUDIT_CYCLE_2_V18_SUCCESSOR_AUTHORITY_V1');
  assert(authorization?.status==='OWNER_AUTHORIZED_NORMALIZED_EXACT_SCOPE'&&authorization.binding?.candidateSha===expectation.baseSha&&authorization.binding.candidateTreeSha===expectation.baseTree,'E_CYCLE2_EXCEPTION_OWNER_SUCCESSOR');
  assert(authorization.binding.predecessorAuthorityDigest===expectation.predecessorAuthorityDigest&&authorization.binding.predecessorStageInstanceDigest===expectation.predecessorInstanceDigest&&authorization.binding.predecessorStageAdmissionDigest===expectation.predecessorAdmissionDigest&&authorization.binding.predecessorWriteSetDigest===expectation.predecessorWriteSetDigest,'E_CYCLE2_EXCEPTION_PREDECESSOR');
  assert(h(canonicalBytes(authorization.binding).subarray(0,-1))===authorization.digest,'E_CYCLE2_EXCEPTION_OWNER_BINDING_DIGEST');
  assert(JSON.stringify(authorization.binding.addedModifyPaths)===JSON.stringify(['docs/OPS/R24/CORRECTIVE/AUDIT_R2_CARRIER_REGISTRY_V1.json'])&&authorization.binding.addedCreatePaths.length===3,'E_CYCLE2_EXCEPTION_EXACT_EXPANSION');
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree,'E_CYCLE2_EXCEPTION_BASE');
  assert(evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_CYCLE2_EXCEPTION_BASE_TREE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_CYCLE2_EXCEPTION_OPERATION_BINDING');
  const operations=instance.value.operations;
  assert(Array.isArray(operations.readPaths)&&Array.isArray(operations.modifyPaths)&&Array.isArray(operations.createPaths)&&Array.isArray(operations.deletePaths)&&Array.isArray(operations.renamePairs),'E_CYCLE2_EXCEPTION_OPERATIONS');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length,'E_CYCLE2_EXCEPTION_DUPLICATE_PATH');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);
  try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_CYCLE2_EXCEPTION_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_CYCLE2_EXCEPTION_UNADMITTED_PATH',changedPath);
  return{schemaVersion:'AUDIT_CYCLE_2_POST_EVALUATION_EXCEPTION_VERIFICATION_V1',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,admittedPathDenominator:admitted.length,changedPaths:changed,admittedPaths:admitted};
}

export function verifyWp401MainProductPostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const expectation=WP401_MAIN_PRODUCT_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),registry=readJsonFile(expectation.registryPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath);
  assert(authority.digest===expectation.authorityDigest&&registry.digest===expectation.registryDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest,'E_WP401_EXCEPTION_CARRIER_DIGEST');
  const sourceRoles={externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST,rolesDistinct:true};
  for(const [label,value] of [['authority',authority.value],['registry',registry.value],['instance',instance.value]])assert(canonicalBytes(value.sourcePlanRoles).equals(canonicalBytes(sourceRoles)),'E_WP401_EXCEPTION_SOURCE_ROLES',label);
  assert(authority.value?.schemaVersion==='YALKEN_R24_WP401_MAIN_PRODUCT_AUTHORITY_AMENDMENT_V5'&&authority.value.programId==='YALKEN_R24_MAIN_PRODUCT_WP401_V1'&&authority.value.stageRegistryDigest===registry.digest,'E_WP401_EXCEPTION_AUTHORITY');
  assert(registry.value?.schemaVersion==='YALKEN_R24_WP401_MAIN_PRODUCT_STAGE_REGISTRY_V5'&&registry.value.authorityTemplateId===expectation.authorityTemplateId,'E_WP401_EXCEPTION_REGISTRY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V1'&&instance.value.stageId===expectation.stageId&&instance.value.authorityTemplateId===expectation.authorityTemplateId,'E_WP401_EXCEPTION_INSTANCE');
  assert(instance.value.programTemplateDigest===authority.digest&&instance.value.planDigest===authority.digest&&instance.value.stageRegistryDigest===registry.digest,'E_WP401_EXCEPTION_INSTANCE_CHAIN');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V1'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_SUBSET_OF_OWNER_APPROVED_TEMPLATE','E_WP401_EXCEPTION_ADMISSION');
  assert(admission.value.programTemplateDigest===authority.digest&&admission.value.stageRegistryDigest===registry.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest,'E_WP401_EXCEPTION_ADMISSION_CHAIN');
  const predecessor=authority.value.amendment;
  assert(predecessor?.predecessorAuthorityDigest===expectation.predecessorAuthorityDigest&&predecessor.predecessorStageRegistryDigest===expectation.predecessorRegistryDigest&&predecessor.predecessorStageInstanceDigest===expectation.predecessorInstanceDigest&&predecessor.predecessorStageAdmissionDigest===expectation.predecessorAdmissionDigest&&predecessor.predecessorWriteSetDigest===expectation.predecessorWriteSetDigest,'E_WP401_EXCEPTION_PREDECESSOR');
  assert(registry.value.predecessor?.authorityDigest===expectation.predecessorAuthorityDigest&&registry.value.predecessor.stageRegistryDigest===expectation.predecessorRegistryDigest&&registry.value.predecessor.stageInstanceDigest===expectation.predecessorInstanceDigest&&registry.value.predecessor.stageAdmissionDigest===expectation.predecessorAdmissionDigest&&registry.value.predecessor.writeSetDigest===expectation.predecessorWriteSetDigest,'E_WP401_EXCEPTION_REGISTRY_PREDECESSOR');
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&instance.value.contractSha===expectation.baseSha,'E_WP401_EXCEPTION_BASE');
  assert(instance.value.model==='gpt-5.6-sol'&&instance.value.reasoningEffort==='xhigh'&&authority.value.fixedRuntime?.model==='gpt-5.6-sol'&&authority.value.fixedRuntime.reasoningEffort==='xhigh'&&authority.value.fixedRuntime.downgradeForbidden===true,'E_WP401_EXCEPTION_RUNTIME');
  assert(instance.value.leaseBinding?.fencingCounter===expectation.fencingCounter&&instance.value.leaseBinding.status==='ACTIVE'&&instance.value.leaseBinding.wip===1,'E_WP401_EXCEPTION_LEASE');
  assert(evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_WP401_EXCEPTION_BASE_TREE');
  const writeSet=instance.value.writeSet;
  assert(Array.isArray(writeSet?.paths)&&Array.isArray(writeSet.deletePaths)&&Array.isArray(writeSet.renamePaths)&&writeSet.deletePaths.length===0&&writeSet.renamePaths.length===0,'E_WP401_EXCEPTION_WRITE_SET');
  assert(h(canonicalBytes(writeSet))===expectation.writeSetDigest,'E_WP401_EXCEPTION_WRITE_SET_DIGEST');
  const admitted=writeSet.paths.map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length,'E_WP401_EXCEPTION_DUPLICATE_PATH');
  assert(canonicalBytes(registry.value.stages[0].allowedWritePaths).equals(canonicalBytes(admitted)),'E_WP401_EXCEPTION_REGISTRY_PATHS');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);
  try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_WP401_EXCEPTION_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_WP401_EXCEPTION_UNADMITTED_PATH',changedPath);
  return{schemaVersion:'WP401_MAIN_PRODUCT_POST_EVALUATION_EXCEPTION_VERIFICATION_V1',status:'PASS',authorityDigest:authority.digest,stageRegistryDigest:registry.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,admittedPathDenominator:admitted.length,changedPaths:changed,admittedPaths:admitted,sourcePlanRoles:sourceRoles};
}

export function verifyWp402MainProductPostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const expectation=WP402_MAIN_PRODUCT_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest,'E_WP402_EXCEPTION_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId===expectation.authorityId&&authority.value.stageId===expectation.stageId,'E_WP402_EXCEPTION_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.authorityId===expectation.authorityId&&instance.value.stageId===expectation.stageId,'E_WP402_EXCEPTION_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR','E_WP402_EXCEPTION_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest,'E_WP402_EXCEPTION_CHAIN');
  const sourceRoles={externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST};
  for(const [label,value] of [['authority',authority.value],['instance',instance.value],['admission',admission.value]])assert(value.externalSourcePlanDigest===sourceRoles.externalSourcePlanDigest&&value.compiledProgramFileDigest===sourceRoles.compiledProgramFileDigest&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_WP402_EXCEPTION_SOURCE_ROLES',label);
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree,'E_WP402_EXCEPTION_BASE');
  assert(instance.value.model==='gpt-5.6-sol'&&instance.value.reasoningEffort==='xhigh','E_WP402_EXCEPTION_RUNTIME');
  assert(instance.value.lease?.fencingCounter===expectation.fencingCounter&&instance.value.lease.status==='ACTIVE'&&instance.value.lease.wip===1,'E_WP402_EXCEPTION_LEASE');
  assert(evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_WP402_EXCEPTION_BASE_TREE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_WP402_EXCEPTION_OPERATION_BINDING');
  const predecessorById=new Map(instance.value.predecessors.map((entry)=>[entry.id,entry]));
  for(const [id,digest] of [['WP402_V1_AUTHORITY',expectation.predecessorAuthorityDigest],['WP402_V1_STAGE_INSTANCE',expectation.predecessorInstanceDigest],['WP402_V1_STAGE_ADMISSION',expectation.predecessorAdmissionDigest],['WP402_V1_WRITE_SET',expectation.predecessorWriteSetDigest],['WP402_V1_COMMAND_SCOPE',expectation.predecessorCommandScopeDigest]])assert(predecessorById.get(id)?.digest===digest&&predecessorById.get(id)?.status==='SUPERSEDED_BY_APPEND_ONLY_CANDIDATE_CI_ORACLE_SUCCESSOR','E_WP402_EXCEPTION_PREDECESSOR',id);
  assert(predecessorById.get('CANDIDATE_CI_RUN_33435657434')?.digest===expectation.failedCandidateCiDigest&&predecessorById.get('CANDIDATE_CI_RUN_33435657434')?.status==='FAIL_E_WP401_EXCEPTION_UNADMITTED_PATH','E_WP402_EXCEPTION_FAILED_CI');
  const operations=instance.value.operations;
  assert(Array.isArray(operations.readPaths)&&Array.isArray(operations.modifyPaths)&&Array.isArray(operations.createPaths)&&Array.isArray(operations.deletePaths)&&Array.isArray(operations.renamePairs),'E_WP402_EXCEPTION_OPERATIONS');
  const writeSet={createPaths:operations.createPaths,deletePaths:operations.deletePaths,modifyPaths:operations.modifyPaths,renamePairs:operations.renamePairs};
  assert(h(canonicalBytes(writeSet).subarray(0,-1))===expectation.writeSetDigest,'E_WP402_EXCEPTION_WRITE_SET_DIGEST');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length,'E_WP402_EXCEPTION_DUPLICATE_PATH');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);
  try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_WP402_EXCEPTION_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_WP402_EXCEPTION_UNADMITTED_PATH',changedPath);
  return{schemaVersion:'WP402_MAIN_PRODUCT_POST_EVALUATION_EXCEPTION_VERIFICATION_V1',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,admittedPathDenominator:admitted.length,changedPaths:changed,admittedPaths:admitted,sourcePlanRoles:{...sourceRoles,rolesDistinct:true}};
}

export function verifyWp403MainProductPostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const expectation=WP403_MAIN_PRODUCT_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath),failure=readJsonFile(expectation.failurePath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest&&failure.digest===expectation.failureDigest,'E_WP403_EXCEPTION_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId===expectation.authorityId&&authority.value.stageId===expectation.stageId,'E_WP403_EXCEPTION_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.authorityId===expectation.authorityId&&instance.value.stageId===expectation.stageId,'E_WP403_EXCEPTION_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR','E_WP403_EXCEPTION_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest,'E_WP403_EXCEPTION_CHAIN');
  const sourceRoles={externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST};
  for(const [label,value] of [['authority',authority.value],['instance',instance.value],['admission',admission.value]])assert(value.externalSourcePlanDigest===sourceRoles.externalSourcePlanDigest&&value.compiledProgramFileDigest===sourceRoles.compiledProgramFileDigest&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_WP403_EXCEPTION_SOURCE_ROLES',label);
  assert(failure.value?.sourcePlanRoles?.externalSourcePlanDigest===sourceRoles.externalSourcePlanDigest&&failure.value.sourcePlanRoles.compiledProgramFileDigest===sourceRoles.compiledProgramFileDigest&&failure.value.sourcePlanRoles.rolesDistinct===true,'E_WP403_EXCEPTION_FAILURE_SOURCE_ROLES');
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree,'E_WP403_EXCEPTION_BASE');
  assert(instance.value.model==='gpt-5.6-sol'&&instance.value.reasoningEffort==='xhigh','E_WP403_EXCEPTION_RUNTIME');
  assert(instance.value.lease?.fencingCounter===expectation.fencingCounter&&instance.value.lease.status==='ACTIVE'&&instance.value.lease.wip===1,'E_WP403_EXCEPTION_LEASE');
  assert(evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_WP403_EXCEPTION_BASE_TREE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_WP403_EXCEPTION_OPERATION_BINDING');
  const predecessorById=new Map(instance.value.predecessors.map((entry)=>[entry.id,entry]));
  for(const [id,digest] of [['WP403_V1_AUTHORITY',expectation.predecessorAuthorityDigest],['WP403_V1_STAGE_INSTANCE',expectation.predecessorInstanceDigest],['WP403_V1_STAGE_ADMISSION',expectation.predecessorAdmissionDigest],['WP403_V1_WRITE_SET',expectation.predecessorWriteSetDigest],['WP403_V1_COMMAND_SCOPE',expectation.predecessorCommandScopeDigest]])assert(predecessorById.get(id)?.digest===digest&&predecessorById.get(id)?.status==='SUPERSEDED_BY_APPEND_ONLY_CANDIDATE_CI_ORACLE_SUCCESSOR','E_WP403_EXCEPTION_PREDECESSOR',id);
  assert(predecessorById.get('CANDIDATE_CI_RUN_33453952193')?.digest===failure.digest&&predecessorById.get('CANDIDATE_CI_RUN_33453952193')?.status==='FAIL_E_WP402_EXCEPTION_UNADMITTED_PATH','E_WP403_EXCEPTION_FAILED_CI');
  assert(failure.value?.schemaVersion==='WP403_CANDIDATE_CI_FAILURE_V1'&&failure.value.status==='BOUND_FAILED_CANDIDATE'&&failure.value.provider==='github-actions'&&failure.value.repository==='KirPonomarev/writer-editor'&&failure.value.workflowPath==='.github/workflows/oss-policy.yml','E_WP403_EXCEPTION_FAILURE_IDENTITY');
  assert(failure.value.runId===33453952193&&failure.value.runAttempt===1&&failure.value.event==='pull_request'&&failure.value.headSha==='16f2474b9825ea94d8762b81153b67d8fcd395a5'&&failure.value.conclusion==='failure','E_WP403_EXCEPTION_FAILURE_RUN');
  assert(failure.value.rootFailure?.code==='E_WP402_EXCEPTION_UNADMITTED_PATH'&&failure.value.rootFailure.path==='docs/OPS/R24/CORRECTIVE/AUDIT_R2_CARRIER_REGISTRY_V4.json'&&failure.value.rootFailure.directFailedJobs?.length===5&&failure.value.aggregateFailedJobs?.length===2&&failure.value.successfulJobs?.length===10,'E_WP403_EXCEPTION_FAILURE_DENOMINATOR');
  assert(failure.value.retryPolicy==='NO_IDENTICAL_RETRY_APPEND_ONLY_DIFFERENT_HYPOTHESIS_SUCCESSOR'&&failure.value.programDoneClaimed===false,'E_WP403_EXCEPTION_FAILURE_POLICY');
  const operations=instance.value.operations;
  assert(Array.isArray(operations.readPaths)&&Array.isArray(operations.modifyPaths)&&Array.isArray(operations.createPaths)&&Array.isArray(operations.deletePaths)&&Array.isArray(operations.renamePairs),'E_WP403_EXCEPTION_OPERATIONS');
  const writeSet={createPaths:operations.createPaths,deletePaths:operations.deletePaths,modifyPaths:operations.modifyPaths,renamePairs:operations.renamePairs};
  assert(h(canonicalBytes(writeSet).subarray(0,-1))===expectation.writeSetDigest,'E_WP403_EXCEPTION_WRITE_SET_DIGEST');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length,'E_WP403_EXCEPTION_DUPLICATE_PATH');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);
  try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_WP403_EXCEPTION_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_WP403_EXCEPTION_UNADMITTED_PATH',changedPath);
  return{schemaVersion:'WP403_MAIN_PRODUCT_POST_EVALUATION_EXCEPTION_VERIFICATION_V1',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,failedCandidateCiCarrierDigest:failure.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,admittedPathDenominator:admitted.length,changedPaths:changed,admittedPaths:admitted,sourcePlanRoles:{...sourceRoles,rolesDistinct:true}};
}

export function verifyWp404MainProductPostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const expectation=WP404_MAIN_PRODUCT_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest,'E_WP404_EXCEPTION_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId===expectation.authorityId&&authority.value.stageId===expectation.stageId,'E_WP404_EXCEPTION_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.authorityId===expectation.authorityId&&instance.value.stageId===expectation.stageId,'E_WP404_EXCEPTION_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR','E_WP404_EXCEPTION_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest,'E_WP404_EXCEPTION_CHAIN');
  const sourceRoles={externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST};
  for(const [label,value] of [['authority',authority.value],['instance',instance.value],['admission',admission.value]])assert(value.externalSourcePlanDigest===sourceRoles.externalSourcePlanDigest&&value.compiledProgramFileDigest===sourceRoles.compiledProgramFileDigest&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_WP404_EXCEPTION_SOURCE_ROLES',label);
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree,'E_WP404_EXCEPTION_BASE');
  assert(instance.value.model==='gpt-5.6-sol'&&instance.value.reasoningEffort==='xhigh','E_WP404_EXCEPTION_RUNTIME');
  assert(instance.value.lease?.fencingCounter===expectation.fencingCounter&&instance.value.lease.status==='ACTIVE'&&instance.value.lease.wip===1&&instance.value.lease.predecessorReleaseDigest===expectation.predecessorLeaseReleaseDigest,'E_WP404_EXCEPTION_LEASE');
  assert(evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_WP404_EXCEPTION_BASE_TREE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_WP404_EXCEPTION_OPERATION_BINDING');
  const predecessorById=new Map(instance.value.predecessors.map((entry)=>[entry.id,entry]));
  assert(predecessorById.get('WP403_LEASE_RELEASE')?.digest===expectation.predecessorLeaseReleaseDigest&&predecessorById.get('WP403_LEASE_RELEASE')?.status==='RELEASED_WIP_0','E_WP404_EXCEPTION_PREDECESSOR','lease');
  assert(predecessorById.get('WP403_TERMINAL_EFFECTIVE_STATE')?.digest===expectation.predecessorEffectiveStateDigest&&predecessorById.get('WP403_TERMINAL_EFFECTIVE_STATE')?.status==='CERTIFIED_DONE_RELEASED_WIP_0','E_WP404_EXCEPTION_PREDECESSOR','effective');
  assert(predecessorById.get('WP403_TERMINAL_RECEIPT')?.digest===expectation.predecessorTerminalReceiptDigest&&predecessorById.get('WP403_TERMINAL_RECEIPT')?.status==='CERTIFIED_DONE','E_WP404_EXCEPTION_PREDECESSOR','receipt');
  assert(predecessorById.get('INDEPENDENT_POST_CORRECTION_AUDIT_V3')?.digest==='81b204ec31d99aede71532b6ac58d8af10dee5543871faa8283d9687a83e49e3'&&predecessorById.get('INDEPENDENT_POST_CORRECTION_AUDIT_V3')?.status==='PASS_30_OF_30','E_WP404_EXCEPTION_PREDECESSOR','audit');
  const operations=instance.value.operations;
  assert(Array.isArray(operations.readPaths)&&Array.isArray(operations.modifyPaths)&&Array.isArray(operations.createPaths)&&Array.isArray(operations.deletePaths)&&Array.isArray(operations.renamePairs),'E_WP404_EXCEPTION_OPERATIONS');
  const writeSet={createPaths:operations.createPaths,deletePaths:operations.deletePaths,modifyPaths:operations.modifyPaths,renamePairs:operations.renamePairs};
  assert(h(canonicalBytes(writeSet).subarray(0,-1))===expectation.writeSetDigest,'E_WP404_EXCEPTION_WRITE_SET_DIGEST');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length,'E_WP404_EXCEPTION_DUPLICATE_PATH');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);
  try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_WP404_EXCEPTION_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_WP404_EXCEPTION_UNADMITTED_PATH',changedPath);
  return{schemaVersion:'WP404_MAIN_PRODUCT_POST_EVALUATION_EXCEPTION_VERIFICATION_V1',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,admittedPathDenominator:admitted.length,changedPaths:changed,admittedPaths:admitted,sourcePlanRoles:{...sourceRoles,rolesDistinct:true}};
}

export function verifyWp500MainProductPostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const expectation=WP500_MAIN_PRODUCT_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest,'E_WP500_EXCEPTION_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId===expectation.authorityId&&authority.value.stageId===expectation.stageId,'E_WP500_EXCEPTION_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.authorityId===expectation.authorityId&&instance.value.stageId===expectation.stageId,'E_WP500_EXCEPTION_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR','E_WP500_EXCEPTION_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest,'E_WP500_EXCEPTION_CHAIN');
  const sourceRoles={externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST};
  for(const [label,value] of [['authority',authority.value],['instance',instance.value],['admission',admission.value]])assert(value.externalSourcePlanDigest===sourceRoles.externalSourcePlanDigest&&value.compiledProgramFileDigest===sourceRoles.compiledProgramFileDigest&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_WP500_EXCEPTION_SOURCE_ROLES',label);
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree,'E_WP500_EXCEPTION_BASE');
  assert(instance.value.model==='gpt-5.6-sol'&&instance.value.reasoningEffort==='xhigh','E_WP500_EXCEPTION_RUNTIME');
  assert(instance.value.lease?.fencingCounter===expectation.fencingCounter&&instance.value.lease.status==='ACTIVE'&&instance.value.lease.wip===1&&instance.value.lease.predecessorReleaseDigest===expectation.predecessorLeaseReleaseDigest,'E_WP500_EXCEPTION_LEASE');
  assert(evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_WP500_EXCEPTION_BASE_TREE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_WP500_EXCEPTION_OPERATION_BINDING');
  const predecessorById=new Map(instance.value.predecessors.map((entry)=>[entry.id,entry]));
  for(const [id,digest,status] of [
    ['WP404_ACCEPTANCE_MATRIX',expectation.predecessorAcceptanceDigest,'PASS_20_OF_20'],
    ['WP404_LEASE_RELEASE',expectation.predecessorLeaseReleaseDigest,'RELEASED_WIP_0'],
    ['WP404_TERMINAL_EFFECTIVE_STATE',expectation.predecessorEffectiveStateDigest,'CERTIFIED_DONE_RELEASED_WIP_0'],
    ['WP404_TERMINAL_RECEIPT',expectation.predecessorTerminalReceiptDigest,'CERTIFIED_DONE'],
  ]) assert(predecessorById.get(id)?.digest===digest&&predecessorById.get(id)?.status===status,'E_WP500_EXCEPTION_PREDECESSOR',id);
  const operations=instance.value.operations;
  assert(Array.isArray(operations.readPaths)&&Array.isArray(operations.modifyPaths)&&Array.isArray(operations.createPaths)&&Array.isArray(operations.deletePaths)&&Array.isArray(operations.renamePairs),'E_WP500_EXCEPTION_OPERATIONS');
  const writeSet={createPaths:operations.createPaths,deletePaths:operations.deletePaths,modifyPaths:operations.modifyPaths,renamePairs:operations.renamePairs};
  assert(h(canonicalBytes(writeSet).subarray(0,-1))===expectation.writeSetDigest,'E_WP500_EXCEPTION_WRITE_SET_DIGEST');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length,'E_WP500_EXCEPTION_DUPLICATE_PATH');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);
  try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_WP500_EXCEPTION_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_WP500_EXCEPTION_UNADMITTED_PATH',changedPath);
  return{schemaVersion:'WP500_MAIN_PRODUCT_POST_EVALUATION_EXCEPTION_VERIFICATION_V1',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,admittedPathDenominator:admitted.length,changedPaths:changed,admittedPaths:admitted,sourcePlanRoles:{...sourceRoles,rolesDistinct:true}};
}

export function verifyWp501MainProductPostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const expectation=WP501_MAIN_PRODUCT_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest,'E_WP501_EXCEPTION_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId===expectation.authorityId&&authority.value.stageId===expectation.stageId,'E_WP501_EXCEPTION_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.authorityId===expectation.authorityId&&instance.value.stageId===expectation.stageId,'E_WP501_EXCEPTION_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR','E_WP501_EXCEPTION_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest,'E_WP501_EXCEPTION_CHAIN');
  const sourceRoles={externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST};
  for(const [label,value] of [['authority',authority.value],['instance',instance.value],['admission',admission.value]])assert(value.externalSourcePlanDigest===sourceRoles.externalSourcePlanDigest&&value.compiledProgramFileDigest===sourceRoles.compiledProgramFileDigest&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_WP501_EXCEPTION_SOURCE_ROLES',label);
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree,'E_WP501_EXCEPTION_BASE');
  assert(instance.value.model==='gpt-5.6-sol'&&instance.value.reasoningEffort==='xhigh','E_WP501_EXCEPTION_RUNTIME');
  assert(instance.value.lease?.fencingCounter===expectation.fencingCounter&&instance.value.lease.status==='ACTIVE'&&instance.value.lease.wip===1&&instance.value.lease.predecessorReleaseDigest===expectation.predecessorLeaseReleaseDigest,'E_WP501_EXCEPTION_LEASE');
  assert(evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_WP501_EXCEPTION_BASE_TREE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_WP501_EXCEPTION_OPERATION_BINDING');
  const predecessorById=new Map(instance.value.predecessors.map((entry)=>[entry.id,entry]));
  for(const [id,digest,status] of [
    ['WP500_ACCEPTANCE_MATRIX',expectation.predecessorAcceptanceDigest,'PASS_20_OF_20'],
    ['WP500_LEASE_RELEASE',expectation.predecessorLeaseReleaseDigest,'RELEASED_WIP_0'],
    ['WP500_TERMINAL_EFFECTIVE_STATE',expectation.predecessorEffectiveStateDigest,'CERTIFIED_DONE_RELEASED_WIP_0'],
    ['WP500_TERMINAL_RECEIPT',expectation.predecessorTerminalReceiptDigest,'CERTIFIED_DONE'],
  ]) assert(predecessorById.get(id)?.digest===digest&&predecessorById.get(id)?.status===status,'E_WP501_EXCEPTION_PREDECESSOR',id);
  const operations=instance.value.operations;
  assert(Array.isArray(operations.readPaths)&&Array.isArray(operations.modifyPaths)&&Array.isArray(operations.createPaths)&&Array.isArray(operations.deletePaths)&&Array.isArray(operations.renamePairs),'E_WP501_EXCEPTION_OPERATIONS');
  const writeSet={createPaths:operations.createPaths,deletePaths:operations.deletePaths,modifyPaths:operations.modifyPaths,renamePairs:operations.renamePairs};
  assert(h(canonicalBytes(writeSet).subarray(0,-1))===expectation.writeSetDigest,'E_WP501_EXCEPTION_WRITE_SET_DIGEST');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length,'E_WP501_EXCEPTION_DUPLICATE_PATH');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);
  try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_WP501_EXCEPTION_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_WP501_EXCEPTION_UNADMITTED_PATH',changedPath);
  return{schemaVersion:'WP501_MAIN_PRODUCT_POST_EVALUATION_EXCEPTION_VERIFICATION_V1',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,admittedPathDenominator:admitted.length,changedPaths:changed,admittedPaths:admitted,sourcePlanRoles:{...sourceRoles,rolesDistinct:true}};
}

export function verifyWp501GateIntegrationPostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const expectation=WP501_GATE_INTEGRATION_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest,'E_WP501_GATE_EXCEPTION_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId===expectation.authorityId&&authority.value.stageId===expectation.stageId,'E_WP501_GATE_EXCEPTION_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.authorityId===expectation.authorityId&&instance.value.stageId===expectation.stageId,'E_WP501_GATE_EXCEPTION_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR','E_WP501_GATE_EXCEPTION_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest,'E_WP501_GATE_EXCEPTION_CHAIN');
  const sourceRoles={externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST};
  for(const [label,value] of [['authority',authority.value],['instance',instance.value],['admission',admission.value]])assert(value.externalSourcePlanDigest===sourceRoles.externalSourcePlanDigest&&value.compiledProgramFileDigest===sourceRoles.compiledProgramFileDigest&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_WP501_GATE_EXCEPTION_SOURCE_ROLES',label);
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree,'E_WP501_GATE_EXCEPTION_BASE');
  assert(instance.value.model==='gpt-5.6-sol'&&instance.value.reasoningEffort==='xhigh','E_WP501_GATE_EXCEPTION_RUNTIME');
  assert(instance.value.lease?.fencingCounter===expectation.fencingCounter&&instance.value.lease.status==='ACTIVE'&&instance.value.lease.wip===1&&instance.value.lease.predecessorReleaseDigest===expectation.predecessorLeaseReleaseDigest,'E_WP501_GATE_EXCEPTION_LEASE');
  assert(evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_WP501_GATE_EXCEPTION_BASE_TREE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_WP501_GATE_EXCEPTION_OPERATION_BINDING');
  const predecessorById=new Map(instance.value.predecessors.map((entry)=>[entry.id,entry]));
  for(const [id,digest,status] of [
    ['WP500_LEASE_RELEASE',expectation.predecessorLeaseReleaseDigest,'RELEASED_WIP_0'],
    ['WP501_MAIN_PRODUCT_STAGE_ADMISSION',expectation.predecessorAdmissionDigest,'ADMITTED'],
    ['WP501_TERMINAL_RECEIPT',expectation.predecessorTerminalReceiptDigest,'PRECOMPUTED_CONDITIONAL_TERMINAL_RECEIPT_PENDING_EXTERNAL_GATES'],
  ]) assert(predecessorById.get(id)?.digest===digest&&predecessorById.get(id)?.status===status,'E_WP501_GATE_EXCEPTION_PREDECESSOR',id);
  const operations=instance.value.operations;
  assert(Array.isArray(operations.readPaths)&&Array.isArray(operations.modifyPaths)&&Array.isArray(operations.createPaths)&&Array.isArray(operations.deletePaths)&&Array.isArray(operations.renamePairs),'E_WP501_GATE_EXCEPTION_OPERATIONS');
  const writeSet={createPaths:operations.createPaths,deletePaths:operations.deletePaths,modifyPaths:operations.modifyPaths,renamePairs:operations.renamePairs};
  assert(h(canonicalBytes(writeSet).subarray(0,-1))===expectation.writeSetDigest,'E_WP501_GATE_EXCEPTION_WRITE_SET_DIGEST');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length,'E_WP501_GATE_EXCEPTION_DUPLICATE_PATH');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);
  try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_WP501_GATE_EXCEPTION_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_WP501_GATE_EXCEPTION_UNADMITTED_PATH',changedPath);
  return{schemaVersion:'WP501_GATE_INTEGRATION_POST_EVALUATION_EXCEPTION_VERIFICATION_V1',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,admittedPathDenominator:admitted.length,changedPaths:changed,admittedPaths:admitted,sourcePlanRoles:{...sourceRoles,rolesDistinct:true}};
}

export function verifyWp501PerformanceIntegrationPostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const expectation=WP501_PERFORMANCE_INTEGRATION_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest,'E_WP501_PERFORMANCE_EXCEPTION_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId===expectation.authorityId&&authority.value.stageId===expectation.stageId,'E_WP501_PERFORMANCE_EXCEPTION_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.authorityId===expectation.authorityId&&instance.value.stageId===expectation.stageId,'E_WP501_PERFORMANCE_EXCEPTION_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR','E_WP501_PERFORMANCE_EXCEPTION_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest,'E_WP501_PERFORMANCE_EXCEPTION_CHAIN');
  const sourceRoles={externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST};
  for(const [label,value] of [['authority',authority.value],['instance',instance.value],['admission',admission.value]])assert(value.externalSourcePlanDigest===sourceRoles.externalSourcePlanDigest&&value.compiledProgramFileDigest===sourceRoles.compiledProgramFileDigest&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_WP501_PERFORMANCE_EXCEPTION_SOURCE_ROLES',label);
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree,'E_WP501_PERFORMANCE_EXCEPTION_BASE');
  assert(instance.value.model==='gpt-5.6-sol'&&instance.value.reasoningEffort==='xhigh','E_WP501_PERFORMANCE_EXCEPTION_RUNTIME');
  assert(instance.value.lease?.fencingCounter===expectation.fencingCounter&&instance.value.lease.status==='ACTIVE'&&instance.value.lease.wip===1&&instance.value.lease.predecessorReleaseDigest===expectation.predecessorLeaseReleaseDigest,'E_WP501_PERFORMANCE_EXCEPTION_LEASE');
  assert(evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_WP501_PERFORMANCE_EXCEPTION_BASE_TREE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_WP501_PERFORMANCE_EXCEPTION_OPERATION_BINDING');
  const predecessorById=new Map(instance.value.predecessors.map((entry)=>[entry.id,entry]));
  for(const [id,digest,status] of [
    ['WP500_LEASE_RELEASE',expectation.predecessorLeaseReleaseDigest,'RELEASED_WIP_0'],
    ['WP501_GATE_INTEGRATION_STAGE_ADMISSION',expectation.predecessorAdmissionDigest,'ADMITTED'],
    ['WP501_TERMINAL_RECEIPT',expectation.predecessorTerminalReceiptDigest,'PRECOMPUTED_CONDITIONAL_TERMINAL_RECEIPT_PENDING_EXTERNAL_GATES'],
  ]) assert(predecessorById.get(id)?.digest===digest&&predecessorById.get(id)?.status===status,'E_WP501_PERFORMANCE_EXCEPTION_PREDECESSOR',id);
  const operations=instance.value.operations;
  assert(Array.isArray(operations.readPaths)&&Array.isArray(operations.modifyPaths)&&Array.isArray(operations.createPaths)&&Array.isArray(operations.deletePaths)&&Array.isArray(operations.renamePairs),'E_WP501_PERFORMANCE_EXCEPTION_OPERATIONS');
  const writeSet={createPaths:operations.createPaths,deletePaths:operations.deletePaths,modifyPaths:operations.modifyPaths,renamePairs:operations.renamePairs};
  assert(h(canonicalBytes(writeSet).subarray(0,-1))===expectation.writeSetDigest,'E_WP501_PERFORMANCE_EXCEPTION_WRITE_SET_DIGEST');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length,'E_WP501_PERFORMANCE_EXCEPTION_DUPLICATE_PATH');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);
  try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_WP501_PERFORMANCE_EXCEPTION_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_WP501_PERFORMANCE_EXCEPTION_UNADMITTED_PATH',changedPath);
  return{schemaVersion:'WP501_PERFORMANCE_INTEGRATION_POST_EVALUATION_EXCEPTION_VERIFICATION_V1',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,admittedPathDenominator:admitted.length,changedPaths:changed,admittedPaths:admitted,sourcePlanRoles:{...sourceRoles,rolesDistinct:true}};
}

export function verifyWp501AuditR2CompatibilityPostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const expectation=WP501_AUDIT_R2_COMPATIBILITY_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest,'E_WP501_AUDIT_R2_EXCEPTION_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId===expectation.authorityId&&authority.value.stageId===expectation.stageId,'E_WP501_AUDIT_R2_EXCEPTION_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.authorityId===expectation.authorityId&&instance.value.stageId===expectation.stageId,'E_WP501_AUDIT_R2_EXCEPTION_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR','E_WP501_AUDIT_R2_EXCEPTION_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest,'E_WP501_AUDIT_R2_EXCEPTION_CHAIN');
  const sourceRoles={externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST};
  for(const [label,value] of [['authority',authority.value],['instance',instance.value],['admission',admission.value]])assert(value.externalSourcePlanDigest===sourceRoles.externalSourcePlanDigest&&value.compiledProgramFileDigest===sourceRoles.compiledProgramFileDigest&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_WP501_AUDIT_R2_EXCEPTION_SOURCE_ROLES',label);
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree,'E_WP501_AUDIT_R2_EXCEPTION_BASE');
  assert(instance.value.model==='gpt-5.6-sol'&&instance.value.reasoningEffort==='xhigh','E_WP501_AUDIT_R2_EXCEPTION_RUNTIME');
  assert(instance.value.lease?.fencingCounter===expectation.fencingCounter&&instance.value.lease.status==='ACTIVE'&&instance.value.lease.wip===1&&instance.value.lease.predecessorReleaseDigest===expectation.predecessorLeaseReleaseDigest,'E_WP501_AUDIT_R2_EXCEPTION_LEASE');
  assert(evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_WP501_AUDIT_R2_EXCEPTION_BASE_TREE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_WP501_AUDIT_R2_EXCEPTION_OPERATION_BINDING');
  const predecessorById=new Map(instance.value.predecessors.map((entry)=>[entry.id,entry]));
  for(const [id,digest,status] of [
    ['WP500_LEASE_RELEASE',expectation.predecessorLeaseReleaseDigest,'RELEASED_WIP_0'],
    ['WP501_PERFORMANCE_INTEGRATION_STAGE_ADMISSION',expectation.predecessorAdmissionDigest,'ADMITTED'],
    ['WP501_TERMINAL_RECEIPT',expectation.predecessorTerminalReceiptDigest,'PRECOMPUTED_CONDITIONAL_TERMINAL_RECEIPT_PENDING_EXTERNAL_GATES'],
  ]) assert(predecessorById.get(id)?.digest===digest&&predecessorById.get(id)?.status===status,'E_WP501_AUDIT_R2_EXCEPTION_PREDECESSOR',id);
  const operations=instance.value.operations;
  assert(Array.isArray(operations.readPaths)&&Array.isArray(operations.modifyPaths)&&Array.isArray(operations.createPaths)&&Array.isArray(operations.deletePaths)&&Array.isArray(operations.renamePairs),'E_WP501_AUDIT_R2_EXCEPTION_OPERATIONS');
  const writeSet={createPaths:operations.createPaths,deletePaths:operations.deletePaths,modifyPaths:operations.modifyPaths,renamePairs:operations.renamePairs};
  assert(h(canonicalBytes(writeSet).subarray(0,-1))===expectation.writeSetDigest,'E_WP501_AUDIT_R2_EXCEPTION_WRITE_SET_DIGEST');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length,'E_WP501_AUDIT_R2_EXCEPTION_DUPLICATE_PATH');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);
  try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_WP501_AUDIT_R2_EXCEPTION_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_WP501_AUDIT_R2_EXCEPTION_UNADMITTED_PATH',changedPath);
  return{schemaVersion:'WP501_AUDIT_R2_COMPATIBILITY_POST_EVALUATION_EXCEPTION_VERIFICATION_V1',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,admittedPathDenominator:admitted.length,changedPaths:changed,admittedPaths:admitted,sourcePlanRoles:{...sourceRoles,rolesDistinct:true}};
}

export function verifyWp501InventoryFinalizationPostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const expectation=WP501_INVENTORY_FINALIZATION_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest,'E_WP501_INVENTORY_EXCEPTION_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId===expectation.authorityId&&authority.value.stageId===expectation.stageId,'E_WP501_INVENTORY_EXCEPTION_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.authorityId===expectation.authorityId&&instance.value.stageId===expectation.stageId,'E_WP501_INVENTORY_EXCEPTION_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR','E_WP501_INVENTORY_EXCEPTION_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest,'E_WP501_INVENTORY_EXCEPTION_CHAIN');
  const sourceRoles={externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST};
  for(const [label,value] of [['authority',authority.value],['instance',instance.value],['admission',admission.value]])assert(value.externalSourcePlanDigest===sourceRoles.externalSourcePlanDigest&&value.compiledProgramFileDigest===sourceRoles.compiledProgramFileDigest&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_WP501_INVENTORY_EXCEPTION_SOURCE_ROLES',label);
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree,'E_WP501_INVENTORY_EXCEPTION_BASE');
  assert(instance.value.model==='gpt-5.6-sol'&&instance.value.reasoningEffort==='xhigh','E_WP501_INVENTORY_EXCEPTION_RUNTIME');
  assert(instance.value.lease?.fencingCounter===expectation.fencingCounter&&instance.value.lease.status==='ACTIVE'&&instance.value.lease.wip===1&&instance.value.lease.predecessorReleaseDigest===expectation.predecessorLeaseReleaseDigest,'E_WP501_INVENTORY_EXCEPTION_LEASE');
  assert(evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_WP501_INVENTORY_EXCEPTION_BASE_TREE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_WP501_INVENTORY_EXCEPTION_OPERATION_BINDING');
  const predecessorById=new Map(instance.value.predecessors.map((entry)=>[entry.id,entry]));
  for(const [id,digest,status] of [
    ['WP500_LEASE_RELEASE',expectation.predecessorLeaseReleaseDigest,'RELEASED_WIP_0'],
    ['WP501_AUDIT_R2_COMPATIBILITY_STAGE_ADMISSION',expectation.predecessorAdmissionDigest,'ADMITTED'],
    ['WP501_TERMINAL_RECEIPT',expectation.predecessorTerminalReceiptDigest,'PRECOMPUTED_CONDITIONAL_TERMINAL_RECEIPT_PENDING_EXTERNAL_GATES'],
  ]) assert(predecessorById.get(id)?.digest===digest&&predecessorById.get(id)?.status===status,'E_WP501_INVENTORY_EXCEPTION_PREDECESSOR',id);
  const operations=instance.value.operations;
  assert(Array.isArray(operations.readPaths)&&Array.isArray(operations.modifyPaths)&&Array.isArray(operations.createPaths)&&Array.isArray(operations.deletePaths)&&Array.isArray(operations.renamePairs),'E_WP501_INVENTORY_EXCEPTION_OPERATIONS');
  const writeSet={createPaths:operations.createPaths,deletePaths:operations.deletePaths,modifyPaths:operations.modifyPaths,renamePairs:operations.renamePairs};
  assert(h(canonicalBytes(writeSet).subarray(0,-1))===expectation.writeSetDigest,'E_WP501_INVENTORY_EXCEPTION_WRITE_SET_DIGEST');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length,'E_WP501_INVENTORY_EXCEPTION_DUPLICATE_PATH');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);
  try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_WP501_INVENTORY_EXCEPTION_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_WP501_INVENTORY_EXCEPTION_UNADMITTED_PATH',changedPath);
  return{schemaVersion:'WP501_INVENTORY_FINALIZATION_POST_EVALUATION_EXCEPTION_VERIFICATION_V1',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,admittedPathDenominator:admitted.length,changedPaths:changed,admittedPaths:admitted,sourcePlanRoles:{...sourceRoles,rolesDistinct:true}};
}

const WP501_FINAL_PATHS=Object.freeze({
  provenance:'docs/OPS/R24/CORRECTIVE/WP501_INVENTORY_FINALIZATION_PROVENANCE_CORRECTION_V1.json',
  matrix:'docs/OPS/R24/CORRECTIVE/WP501_FINAL_ACCEPTANCE_MATRIX_V1.json',
  effective:'docs/OPS/R24/CORRECTIVE/WP501_FINAL_EFFECTIVE_STATE_V1.json',
  registry:'docs/OPS/R24/CORRECTIVE/WP501_FINAL_STAGE_REGISTRY_V1.json',
  release:'docs/OPS/R24/CORRECTIVE/WP501_FINAL_LEASE_RELEASE_V1.json',
  receipt:'docs/OPS/R24/CORRECTIVE/WP501_FINAL_TERMINAL_RECEIPT_V1.json',
  before:'docs/OPS/R24/CORRECTIVE/WP501_TERMINAL_EXCEPTION_PROTECTED_WIP_BEFORE_V1.json',
  after:'docs/OPS/R24/CORRECTIVE/WP501_TERMINAL_EXCEPTION_PROTECTED_WIP_AFTER_V1.json'
});
const terminalFile=(key,overrides)=>{
  if(overrides?.[key]!==undefined){const value=overrides[key],bytes=canonicalBytes(value);return{value,bytes,digest:h(bytes)};}
  return readJsonFile(WP501_FINAL_PATHS[key]);
};
const verifyProtectedSnapshot=(file,label)=>{
  const value=file.value,{snapshotSha256,...payload}=value;
  assert(value.schemaVersion==='YALKEN_PROTECTED_WIP_SNAPSHOT_V2'&&value.algorithm?.id==='YALKEN_PROTECTED_WIP_SNAPSHOT_ALGORITHM_V2','E_WP501_FINAL_WIP_SCHEMA',label);
  assert(h(Buffer.from(`${JSON.stringify(payload)}\n`))===snapshotSha256,'E_WP501_FINAL_WIP_SNAPSHOT_DIGEST',label);
  assert(value.completeDenominator===value.entries.length&&value.presentDenominator===value.entries.filter((entry)=>entry.present).length&&value.prunableDenominator===value.entries.filter((entry)=>entry.prunable).length&&value.dirtyDenominator===value.entries.filter((entry)=>entry.dirty).length,'E_WP501_FINAL_WIP_DENOMINATOR',label);
  assert(value.completeDenominator===254&&value.presentDenominator===251&&value.prunableDenominator===3&&value.dirtyDenominator===7,'E_WP501_FINAL_WIP_EXPECTED_DENOMINATOR',label);
  assert(value.excludedTaskWorktrees.length===1&&value.excludedTaskWorktrees[0].role==='writer','E_WP501_FINAL_WIP_EXCLUSION',label);
  assert(value.entries.every((entry)=>!Object.hasOwn(entry,'path')&&!Object.hasOwn(entry,'statusBytes')),'E_WP501_FINAL_WIP_PRIVACY',label);
  assert(canonicalBytes(value.protectedDirtySet).equals(canonicalBytes(value.entries.filter((entry)=>entry.dirty).map(({pathIdentitySha256,head,statusByteLength,statusSha256})=>({pathIdentitySha256,head,statusByteLength,statusSha256})))),'E_WP501_FINAL_WIP_DIRTY_SET',label);
  return value;
};
const verifyWp501ProviderEvidence=(providers)=>{
  const expected=WP501_TERMINAL_EXCEPTION_ADMISSION_EXPECTATION.providerDigests;
  assert(providers?.pullRequest?.number===1801&&providers.pullRequest.status==='MERGED'&&providers.pullRequest.headSha==='24eef160b7dfbec4f9f80d50345807dd63450a77'&&providers.pullRequest.mergeSha===WP501_TERMINAL_EXCEPTION_ADMISSION_EXPECTATION.baseSha&&providers.pullRequest.returnedBytesDigest===expected.pr1801&&providers.pullRequest.returnedByteLength===18070,'E_WP501_FINAL_PR_PROVIDER');
  for(const [key,runId,headSha,digest,size,event] of [
    ['candidateCi',33492677387,'24eef160b7dfbec4f9f80d50345807dd63450a77',expected.candidateCi,13419,'pull_request'],
    ['opsVectorClose',33493670939,'24eef160b7dfbec4f9f80d50345807dd63450a77',expected.opsVectorClose,12847,'pull_request'],
    ['postmergeCi',33493671610,WP501_TERMINAL_EXCEPTION_ADMISSION_EXPECTATION.baseSha,expected.postmergeCi,13465,'push']
  ]){const run=providers[key];assert(run?.runId===runId&&run.runAttempt===1&&run.headSha===headSha&&run.event===event&&run.status==='completed'&&run.conclusion==='success'&&run.returnedBytesDigest===digest&&run.returnedByteLength===size,'E_WP501_FINAL_RUN_PROVIDER',key);}
  const ruleset=providers.liveRuleset;
  assert(ruleset?.rulesetId===12270444&&ruleset.enforcement==='active'&&canonicalBytes(ruleset.requiredContexts).equals(canonicalBytes(['merge-gate']))&&ruleset.bypassActorCount===0&&Object.values(ruleset.protections).every(Boolean)&&ruleset.returnedBytesDigest===expected.ruleset&&ruleset.returnedByteLength===1200,'E_WP501_FINAL_RULESET_PROVIDER');
};

export function verifyWp501FinalTerminalCarriers({overrides}={}){
  const provenance=terminalFile('provenance',overrides),matrix=terminalFile('matrix',overrides),effective=terminalFile('effective',overrides),registry=terminalFile('registry',overrides),release=terminalFile('release',overrides),receipt=terminalFile('receipt',overrides),before=terminalFile('before',overrides),after=terminalFile('after',overrides);
  const expectation=WP501_TERMINAL_EXCEPTION_ADMISSION_EXPECTATION;
  const sourceRoles=(value,label)=>assert(value?.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&value.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST&&value.rolesDistinct===true&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_WP501_FINAL_SOURCE_ROLES',label);
  for(const [label,file] of [['provenance',provenance],['matrix',matrix],['effective',effective],['registry',registry],['release',release],['receipt',receipt]])sourceRoles(file.value.sourcePlanRoles,label);
  assert(provenance.value.schemaVersion==='YALKEN_R24_WP501_INVENTORY_FINALIZATION_PROVENANCE_CORRECTION_V1'&&provenance.value.status==='SUPERSEDED_FUTURE_OBSERVED_AT_REJECTED','E_WP501_FINAL_PROVENANCE_SCHEMA');
  const defect=provenance.value.defectiveCarrier;
  assert(defect.sha256===expectation.predecessorAdmissionDigest&&defect.declaredObservedAtUtc==='2026-09-01T09:28:00Z'&&defect.firstCarrierCommitSha==='24eef160b7dfbec4f9f80d50345807dd63450a77'&&defect.firstCarrierCommitTimeUtc==='2026-09-01T09:26:08Z'&&defect.futureDeltaSeconds===112&&defect.classification==='REJECTED_FUTURE_OBSERVED_AT','E_WP501_FINAL_PROVENANCE_DEFECT');
  assert(Date.parse(defect.declaredObservedAtUtc)-Date.parse(defect.firstCarrierCommitTimeUtc)===112000&&provenance.value.correction.immutablePredecessorRewritten===false&&provenance.value.correction.pastEvidenceFabricated===false&&provenance.value.correction.successorAdmissionDigest===expectation.admissionDigest&&provenance.value.correction.successorObservedBeforeFirstCommit===true,'E_WP501_FINAL_PROVENANCE_CORRECTION');
  for(const file of [provenance,matrix,effective,registry,release,receipt])assert(Number.isFinite(Date.parse(file.value.observedAtUtc))&&Date.parse(file.value.observedAtUtc)<=Date.now(),'E_WP501_FINAL_FUTURE_OBSERVED_AT',file.value.schemaVersion);
  const beforeValue=verifyProtectedSnapshot(before,'before'),afterValue=verifyProtectedSnapshot(after,'after');
  assert(before.digest===expectation.protectedWipBeforeDigest&&canonicalBytes(beforeValue.entries).equals(canonicalBytes(afterValue.entries))&&canonicalBytes(beforeValue.protectedDirtySet).equals(canonicalBytes(afterValue.protectedDirtySet)),'E_WP501_FINAL_WIP_BEFORE_AFTER');
  assert(matrix.value.schemaVersion==='YALKEN_R24_WP501_FINAL_ACCEPTANCE_MATRIX_V1'&&matrix.value.status==='PASS'&&matrix.value.rowCount===22&&matrix.value.passedRowCount===22&&matrix.value.failedRowCount===0&&matrix.value.pendingRowCount===0&&matrix.value.rows.length===22&&matrix.value.rows.every((row)=>row.status==='PASS')&&matrix.value.verdict==='PASS','E_WP501_FINAL_MATRIX');
  assert(matrix.value.bindings.authorityDigest===expectation.authorityDigest&&matrix.value.bindings.stageInstanceDigest===expectation.instanceDigest&&matrix.value.bindings.stageAdmissionDigest===expectation.admissionDigest&&matrix.value.bindings.writeSetDigest===expectation.writeSetDigest&&matrix.value.bindings.provenanceCorrectionDigest===provenance.digest&&matrix.value.bindings.protectedWipBeforeDigest===before.digest&&matrix.value.bindings.protectedWipAfterDigest===after.digest,'E_WP501_FINAL_MATRIX_BINDING');
  verifyWp501ProviderEvidence(matrix.value.providerEvidence);
  assert(effective.value.schemaVersion==='YALKEN_R24_WP501_FINAL_EFFECTIVE_STATE_V1'&&effective.value.status==='CERTIFIED_DONE_RELEASED_WIP_0'&&canonicalBytes(effective.value.currentEffectiveState).equals(canonicalBytes({counts:{BLOCKED_TYPED:3,DONE:57,INELIGIBLE_OPTIONAL:10,PENDING:39},wp500State:'DONE',wp501State:'DONE'})),'E_WP501_FINAL_EFFECTIVE_STATE');
  assert(effective.value.acceptance.matrixDigest===matrix.digest&&effective.value.acceptance.rowCount===22&&effective.value.acceptance.passedRowCount===22&&effective.value.acceptance.failedRowCount===0&&effective.value.acceptance.pendingRowCount===0&&effective.value.acceptance.verdict==='PASS'&&effective.value.lease.fencingCounter===64&&effective.value.lease.status==='RELEASED'&&effective.value.lease.wip===0&&effective.value.nextGraphSelection===false,'E_WP501_FINAL_EFFECTIVE_BINDING');
  assert(registry.value.schemaVersion==='YALKEN_R24_WP501_FINAL_STAGE_REGISTRY_V1'&&registry.value.status==='CERTIFIED_DONE'&&registry.value.stageCount===1&&registry.value.certifiedDoneCount===1&&registry.value.failedCount===0&&registry.value.pendingCount===0&&registry.value.stages.length===1&&registry.value.stages[0].status==='CERTIFIED_DONE'&&registry.value.stages[0].acceptanceMatrixDigest===matrix.digest&&registry.value.stages[0].effectiveStateDigest===effective.digest&&registry.value.stages[0].lease.status==='RELEASED'&&registry.value.stages[0].lease.wip===0&&registry.value.nextGraphNodeStarted===false,'E_WP501_FINAL_REGISTRY');
  assert(release.value.schemaVersion==='YALKEN_R24_WP501_FINAL_LEASE_RELEASE_V1'&&release.value.status==='RELEASED_WIP_0'&&release.value.lease.fencingCounter===64&&release.value.lease.status==='RELEASED'&&release.value.lease.wip===0&&release.value.bindings.acceptanceMatrixDigest===matrix.digest&&release.value.bindings.effectiveStateDigest===effective.digest&&release.value.bindings.stageRegistryDigest===registry.digest&&release.value.bindings.provenanceCorrectionDigest===provenance.digest&&release.value.bindings.protectedWipBeforeDigest===before.digest&&release.value.bindings.protectedWipAfterDigest===after.digest&&release.value.noLiveWorkAtRelease===true,'E_WP501_FINAL_RELEASE');
  verifyWp501ProviderEvidence(release.value.providerEvidence);
  assert(receipt.value.schemaVersion==='YALKEN_R24_WP501_FINAL_TERMINAL_RECEIPT_V1'&&receipt.value.status==='CERTIFIED_DONE'&&receipt.value.originIdentity.sha===expectation.baseSha&&receipt.value.originIdentity.treeSha===expectation.baseTree&&receipt.value.bindings.authorityDigest===expectation.authorityDigest&&receipt.value.bindings.stageInstanceDigest===expectation.instanceDigest&&receipt.value.bindings.stageAdmissionDigest===expectation.admissionDigest&&receipt.value.bindings.writeSetDigest===expectation.writeSetDigest&&receipt.value.bindings.acceptanceMatrixDigest===matrix.digest&&receipt.value.bindings.effectiveStateDigest===effective.digest&&receipt.value.bindings.stageRegistryDigest===registry.digest&&receipt.value.bindings.leaseReleaseDigest===release.digest&&receipt.value.bindings.provenanceCorrectionDigest===provenance.digest,'E_WP501_FINAL_RECEIPT_BINDING');
  assert(receipt.value.predecessorCorrections?.pr1776?.candidateSha==='77354cfe994588dc1771f3eded29d1e7e68d703f'&&receipt.value.predecessorCorrections.pr1776.mergeSha==='af0bfb704c13b0195c12b0144415f2e769f99752'&&receipt.value.predecessorCorrections.pr1777?.candidateSha==='bf3d21072879d276ca3489b0bbead780fb39f596'&&receipt.value.predecessorCorrections.pr1777.mergeSha==='0a8837ae8b0724fa9c258d98281cae693ce0693e','E_WP501_FINAL_PREDECESSOR_PR_IDENTITY');
  assert(receipt.value.acceptance.passedRowCount===22&&receipt.value.acceptance.failedRowCount===0&&receipt.value.acceptance.pendingRowCount===0&&receipt.value.acceptance.verdict==='PASS'&&receipt.value.effectiveState.counts.DONE===57&&receipt.value.effectiveState.counts.PENDING===39&&receipt.value.effectiveState.wp501State==='DONE'&&receipt.value.stageRegistry.certifiedDoneCount===1&&receipt.value.stageRegistry.pendingCount===0&&receipt.value.leaseDisposition.status==='RELEASED'&&receipt.value.leaseDisposition.wip===0&&receipt.value.leaseDisposition.releaseDigest===release.digest&&receipt.value.nextGraphNodeStarted===false&&receipt.value.programDone===false,'E_WP501_FINAL_RECEIPT_STATE');
  verifyWp501ProviderEvidence(receipt.value.providerEvidence);
  for(const file of [matrix,effective,registry,release,receipt,provenance])assert(file.value.programDone===false,'E_WP501_FINAL_PROGRAM_DONE',file.value.schemaVersion);
  return{schemaVersion:'WP501_FINAL_TERMINAL_CARRIERS_VERIFICATION_V1',status:'PASS',provenanceCorrectionDigest:provenance.digest,acceptanceMatrixDigest:matrix.digest,effectiveStateDigest:effective.digest,stageRegistryDigest:registry.digest,leaseReleaseDigest:release.digest,terminalReceiptDigest:receipt.digest,protectedWipBeforeDigest:before.digest,protectedWipAfterDigest:after.digest,acceptanceRows:22,doneCount:57,pendingCount:39,leaseStatus:'RELEASED',wip:0,programDone:false};
}

export function verifyWp501TerminalExceptionPostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const expectation=WP501_TERMINAL_EXCEPTION_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest,'E_WP501_TERMINAL_EXCEPTION_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId===expectation.authorityId&&authority.value.stageId===expectation.stageId,'E_WP501_TERMINAL_EXCEPTION_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.authorityId===expectation.authorityId&&instance.value.stageId===expectation.stageId&&instance.value.model==='gpt-5.6-sol'&&instance.value.reasoningEffort==='xhigh','E_WP501_TERMINAL_EXCEPTION_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR'&&Date.parse(admission.value.observedAtUtc)<=Date.now(),'E_WP501_TERMINAL_EXCEPTION_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest&&admission.value.commandScopeDigest===expectation.commandScopeDigest&&admission.value.acceptanceSignalsDigest===expectation.acceptanceSignalsDigest,'E_WP501_TERMINAL_EXCEPTION_CHAIN');
  for(const [label,value] of [['authority',authority.value],['instance',instance.value],['admission',admission.value]])assert(value.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&value.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_WP501_TERMINAL_EXCEPTION_SOURCE_ROLES',label);
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree&&evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_WP501_TERMINAL_EXCEPTION_BASE');
  assert(instance.value.lease?.fencingCounter===expectation.fencingCounter&&instance.value.lease.status==='ACTIVE'&&instance.value.lease.wip===1&&instance.value.lease.predecessorReleaseDigest===expectation.predecessorLeaseReleaseDigest,'E_WP501_TERMINAL_EXCEPTION_LEASE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_WP501_TERMINAL_EXCEPTION_OPERATION_BINDING');
  const predecessorById=new Map(instance.value.predecessors.map((entry)=>[entry.id,entry]));
  for(const [id,digest] of [['WP500_LEASE_RELEASE',expectation.predecessorLeaseReleaseDigest],['WP501_INVENTORY_FINALIZATION_ADMISSION_V1',expectation.predecessorAdmissionDigest],['WP501_TERMINAL_RECEIPT_V1',expectation.predecessorTerminalReceiptDigest],['PR_1801_PROVIDER_BYTES',expectation.providerDigests.pr1801],['PR_1801_CANDIDATE_CI_PROVIDER_BYTES',expectation.providerDigests.candidateCi],['PR_1801_OPS_VECTOR_CLOSE_PROVIDER_BYTES',expectation.providerDigests.opsVectorClose],['PR_1801_POSTMERGE_CI_PROVIDER_BYTES',expectation.providerDigests.postmergeCi],['LIVE_RULESET_12270444_PROVIDER_BYTES',expectation.providerDigests.ruleset],['WP501_EXCEPTION_PROTECTED_WIP_BEFORE',expectation.protectedWipBeforeDigest]])assert(predecessorById.get(id)?.digest===digest,'E_WP501_TERMINAL_EXCEPTION_PREDECESSOR',id);
  const operations=instance.value.operations,writeSet={createPaths:operations.createPaths,deletePaths:operations.deletePaths,modifyPaths:operations.modifyPaths,renamePairs:operations.renamePairs};
  assert(h(canonicalBytes(writeSet).subarray(0,-1))===expectation.writeSetDigest,'E_WP501_TERMINAL_EXCEPTION_WRITE_SET_DIGEST');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length&&admitted.length===18,'E_WP501_TERMINAL_EXCEPTION_PATH_DENOMINATOR');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_WP501_TERMINAL_EXCEPTION_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_WP501_TERMINAL_EXCEPTION_UNADMITTED_PATH',changedPath);
  const finalCarriers=verifyWp501FinalTerminalCarriers();
  return{schemaVersion:'WP501_TERMINAL_EXCEPTION_POST_EVALUATION_EXCEPTION_VERIFICATION_V1',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,admittedPathDenominator:admitted.length,changedPaths:changed,admittedPaths:admitted,finalCarriers,sourcePlanRoles:{externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST,rolesDistinct:true}};
}

export function verifyWp502MainProductPostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const expectation=WP502_MAIN_PRODUCT_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath),failure=readJsonFile(expectation.failurePath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest&&failure.digest===expectation.failureDigest,'E_WP502_EXCEPTION_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId===expectation.authorityId&&authority.value.stageId===expectation.stageId,'E_WP502_EXCEPTION_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.authorityId===expectation.authorityId&&instance.value.stageId===expectation.stageId&&instance.value.model==='gpt-5.6-sol'&&instance.value.reasoningEffort==='xhigh','E_WP502_EXCEPTION_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR'&&Date.parse(admission.value.observedAtUtc)<=Date.now(),'E_WP502_EXCEPTION_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest&&admission.value.commandScopeDigest===expectation.commandScopeDigest&&admission.value.acceptanceSignalsDigest===expectation.acceptanceSignalsDigest,'E_WP502_EXCEPTION_CHAIN');
  for(const [label,value] of [['authority',authority.value],['instance',instance.value],['admission',admission.value],['failure',failure.value.sourcePlanRoles]])assert(value.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&value.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_WP502_EXCEPTION_SOURCE_ROLES',label);
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree&&evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_WP502_EXCEPTION_BASE');
  assert(instance.value.lease?.fencingCounter===expectation.fencingCounter&&instance.value.lease.status==='ACTIVE'&&instance.value.lease.wip===1&&instance.value.lease.predecessorReleaseDigest===expectation.predecessorLeaseReleaseDigest,'E_WP502_EXCEPTION_LEASE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_WP502_EXCEPTION_OPERATION_BINDING');
  const predecessorById=new Map(instance.value.predecessors.map((entry)=>[entry.id,entry]));
  for(const [id,digest] of [['WP502_V1_AUTHORITY',expectation.predecessorAuthorityDigest],['WP502_V1_STAGE_INSTANCE',expectation.predecessorInstanceDigest],['WP502_V1_STAGE_ADMISSION',expectation.predecessorAdmissionDigest],['WP502_V1_WRITE_SET',expectation.predecessorWriteSetDigest],['WP502_V1_COMMAND_SCOPE',expectation.predecessorCommandScopeDigest],['CANDIDATE_CI_RUN_33506532912',expectation.failureDigest]])assert(predecessorById.get(id)?.digest===digest,'E_WP502_EXCEPTION_PREDECESSOR',id);
  assert(failure.value.schemaVersion==='WP502_CANDIDATE_CI_FAILURE_V1'&&failure.value.status==='BOUND_FAILED_CANDIDATE'&&failure.value.runId===33506532912&&failure.value.runAttempt===1&&failure.value.headSha==='7f74a14f1f8c388fbd11147358fb3fcd18e98bcd'&&failure.value.conclusion==='failure','E_WP502_EXCEPTION_FAILURE_IDENTITY');
  assert(failure.value.rootFailure?.code==='E_WP501_TERMINAL_EXCEPTION_UNADMITTED_PATH'&&failure.value.rootFailure.path==='.github/workflows/oss-policy.yml'&&failure.value.rootFailure.directFailedJobs?.length===5&&failure.value.aggregateFailedJobs?.length===2&&failure.value.successfulJobs?.length===10,'E_WP502_EXCEPTION_FAILURE_DENOMINATOR');
  const operations=instance.value.operations,writeSet={createPaths:operations.createPaths,deletePaths:operations.deletePaths,modifyPaths:operations.modifyPaths,renamePairs:operations.renamePairs};
  assert(h(canonicalBytes(writeSet).subarray(0,-1))===expectation.writeSetDigest,'E_WP502_EXCEPTION_WRITE_SET_DIGEST');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length&&admitted.length===40,'E_WP502_EXCEPTION_PATH_DENOMINATOR');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_WP502_EXCEPTION_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_WP502_EXCEPTION_UNADMITTED_PATH',changedPath);
  const finalCarriers=verifyWp502TerminalCarriers();
  return{schemaVersion:'WP502_MAIN_PRODUCT_POST_EVALUATION_EXCEPTION_VERIFICATION_V1',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,failedCandidateCiCarrierDigest:failure.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,admittedPathDenominator:admitted.length,changedPaths:changed,admittedPaths:admitted,finalCarriers,sourcePlanRoles:{externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST,rolesDistinct:true}};
}

export function verifyWp503V6MainProductPostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const expectation=WP503_V6_MAIN_PRODUCT_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath),failure=readJsonFile(expectation.failurePath),successor=readJsonFile(expectation.successorPath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest&&failure.digest===expectation.failureDigest,'E_WP503_EXCEPTION_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId===expectation.authorityId&&authority.value.stageId===expectation.stageId,'E_WP503_EXCEPTION_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.authorityId===expectation.authorityId&&instance.value.stageId===expectation.stageId&&instance.value.model==='gpt-5.6-sol'&&instance.value.reasoningEffort==='xhigh','E_WP503_EXCEPTION_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR'&&Date.parse(admission.value.observedAtUtc)<=Date.now(),'E_WP503_EXCEPTION_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest&&admission.value.commandScopeDigest===expectation.commandScopeDigest&&admission.value.acceptanceSignalsDigest===expectation.acceptanceSignalsDigest,'E_WP503_EXCEPTION_CHAIN');
  for(const [label,value] of [['authority',authority.value],['instance',instance.value],['admission',admission.value],['failure',failure.value.sourcePlanRoles],['successor',successor.value.sourcePlanRoles]])assert(value.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&value.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_WP503_EXCEPTION_SOURCE_ROLES',label);
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree&&evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_WP503_EXCEPTION_BASE');
  assert(instance.value.lease?.fencingCounter===expectation.fencingCounter&&instance.value.lease.status==='ACTIVE'&&instance.value.lease.wip===1&&instance.value.lease.predecessorReleaseDigest===expectation.predecessorLeaseReleaseDigest,'E_WP503_EXCEPTION_LEASE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_WP503_EXCEPTION_OPERATION_BINDING');
  const predecessorById=new Map(instance.value.predecessors.map((entry)=>[entry.id,entry]));
  for(const [id,digest] of [['WP503_V5_AUTHORITY',expectation.predecessorAuthorityDigest],['WP503_V5_STAGE_INSTANCE',expectation.predecessorInstanceDigest],['WP503_V5_STAGE_ADMISSION',expectation.predecessorAdmissionDigest],['WP503_V5_WRITE_SET',expectation.predecessorWriteSetDigest],['WP503_V5_COMMAND_SCOPE',expectation.predecessorCommandScopeDigest],['WP503_LOCAL_POST_AUDIT_FAILURE',expectation.failureDigest]])assert(predecessorById.get(id)?.digest===digest,'E_WP503_EXCEPTION_PREDECESSOR',id);
  assert(failure.value.schemaVersion==='WP503_LOCAL_POST_AUDIT_FAILURE_V1'&&failure.value.status==='FAIL_CLOSED_SUPERSEDED_BY_APPEND_ONLY_CERTIFICATION_CHAIN_SUCCESSOR'&&failure.value.candidateSha==='25910cd47369495d9bdafb2a78db20ac75b78abc'&&failure.value.candidateTreeSha==='0776736febe6e6264dcb3f48563d6bb49fd0b5d2'&&failure.value.rootFailure?.code==='E_WP502_EXCEPTION_UNADMITTED_PATH'&&failure.value.rootFailure.path==='docs/OPS/R24/CORRECTIVE/AUDIT_R2_CARRIER_REGISTRY_V12.json','E_WP503_EXCEPTION_FAILURE_IDENTITY');
  assert(successor.value.schemaVersion==='WP503_POST_AUDIT_CERTIFICATION_SUCCESSOR_V1'&&successor.value.status==='CURRENT_APPEND_ONLY_SUCCESSOR'&&successor.value.bindings.authorityDigest===authority.digest&&successor.value.bindings.stageInstanceDigest===instance.digest&&successor.value.bindings.stageAdmissionDigest===admission.digest&&successor.value.bindings.failureDigest===failure.digest,'E_WP503_EXCEPTION_SUCCESSOR_BINDING');
  assert(successor.value.bindings.verifierDigest===h(objectBytes(git,'fdd6a88834e090f2830ba23ca8a9489f1a95964a','scripts/ops/r24/corrective/post-audit-certification-set.mjs'))&&successor.value.bindings.contractTestDigest===h(objectBytes(git,'fdd6a88834e090f2830ba23ca8a9489f1a95964a','test/contracts/r24-post-audit-certification-set.contract.test.mjs'))&&successor.value.programDone===false,'E_WP503_EXCEPTION_SUCCESSOR_BYTES');
  const operations=instance.value.operations,writeSet={createPaths:operations.createPaths,deletePaths:operations.deletePaths,modifyPaths:operations.modifyPaths,renamePairs:operations.renamePairs};
  assert(h(canonicalBytes(writeSet).subarray(0,-1))===expectation.writeSetDigest,'E_WP503_EXCEPTION_WRITE_SET_DIGEST');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length&&admitted.length===76,'E_WP503_EXCEPTION_PATH_DENOMINATOR');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_WP503_EXCEPTION_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_WP503_EXCEPTION_UNADMITTED_PATH',changedPath);
  return{schemaVersion:'WP503_MAIN_PRODUCT_POST_EVALUATION_EXCEPTION_VERIFICATION_V1',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,failureDigest:failure.digest,successorDigest:successor.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,admittedPathDenominator:admitted.length,changedPaths:changed,admittedPaths:admitted,sourcePlanRoles:{externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST,rolesDistinct:true}};
}

export function verifyWp503V7MainProductPostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const predecessor=verifyWp503V6MainProductPostEvaluationException({candidateSha:WP503_V7_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha,git});
  const expectation=WP503_V7_MAIN_PRODUCT_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath),failure=readJsonFile(expectation.failurePath),successor=readJsonFile(expectation.successorPath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest&&failure.digest===expectation.failureDigest,'E_WP503_TEMPORAL_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId===expectation.authorityId&&authority.value.stageId===expectation.stageId,'E_WP503_TEMPORAL_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.authorityId===expectation.authorityId&&instance.value.stageId===expectation.stageId&&instance.value.model==='gpt-5.6-sol'&&instance.value.reasoningEffort==='xhigh','E_WP503_TEMPORAL_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR'&&Date.parse(admission.value.observedAtUtc)<=Date.now(),'E_WP503_TEMPORAL_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest&&admission.value.commandScopeDigest===expectation.commandScopeDigest&&admission.value.acceptanceSignalsDigest===expectation.acceptanceSignalsDigest,'E_WP503_TEMPORAL_CHAIN');
  for(const [label,value] of [['authority',authority.value],['instance',instance.value],['admission',admission.value],['failure',failure.value.sourcePlanRoles],['successor',successor.value.sourcePlanRoles]])assert(value.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&value.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_WP503_TEMPORAL_SOURCE_ROLES',label);
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree&&evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_WP503_TEMPORAL_BASE');
  assert(instance.value.lease?.fencingCounter===expectation.fencingCounter&&instance.value.lease.status==='ACTIVE'&&instance.value.lease.wip===1&&instance.value.lease.predecessorReleaseDigest===expectation.predecessorLeaseReleaseDigest,'E_WP503_TEMPORAL_LEASE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_WP503_TEMPORAL_OPERATION_BINDING');
  const predecessorById=new Map(instance.value.predecessors.map((entry)=>[entry.id,entry]));
  for(const [id,digest] of [['WP503_V6_AUTHORITY',expectation.predecessorAuthorityDigest],['WP503_V6_STAGE_INSTANCE',expectation.predecessorInstanceDigest],['WP503_V6_STAGE_ADMISSION',expectation.predecessorAdmissionDigest],['WP503_V6_WRITE_SET',expectation.predecessorWriteSetDigest],['WP503_V6_COMMAND_SCOPE',expectation.predecessorCommandScopeDigest],['WP503_TEMPORAL_EVIDENCE_FAILURE',expectation.failureDigest]])assert(predecessorById.get(id)?.digest===digest,'E_WP503_TEMPORAL_PREDECESSOR',id);
  assert(failure.value.schemaVersion==='WP503_TEMPORAL_EVIDENCE_FAILURE_V1'&&failure.value.status==='FAIL_CLOSED_SUPERSEDED_BY_APPEND_ONLY_TEMPORAL_EVIDENCE_SUCCESSOR'&&failure.value.exactOrigin.sha===expectation.baseSha&&failure.value.exactOrigin.tree===expectation.baseTree&&failure.value.rootFailure?.code==='E_GOVERNANCE_APPROVAL_APPROVED_AT_FUTURE'&&failure.value.rootFailure.futureCarriers.length===3,'E_WP503_TEMPORAL_FAILURE_IDENTITY');
  assert(failure.value.rootFailure.futureCarriers.every((entry)=>Date.parse(entry.approvedAtUtc??entry.observedAtUtc)>Date.parse(failure.value.rootFailure.providerClockUtc)),'E_WP503_TEMPORAL_FAILURE_CHRONOLOGY');
  assert(successor.value.schemaVersion==='WP503_TEMPORAL_EVIDENCE_SUCCESSOR_V1'&&successor.value.status==='CURRENT_APPEND_ONLY_SUCCESSOR'&&successor.value.bindings.authorityDigest===authority.digest&&successor.value.bindings.stageInstanceDigest===instance.digest&&successor.value.bindings.stageAdmissionDigest===admission.digest&&successor.value.bindings.failureDigest===failure.digest,'E_WP503_TEMPORAL_SUCCESSOR_BINDING');
  assert(successor.value.bindings.verifierDigest===h(objectBytes(git,'acc19208d94c6be40e0f627cec218191171ae583','scripts/ops/r24/corrective/post-audit-certification-set.mjs'))&&successor.value.bindings.contractTestDigest===h(objectBytes(git,'acc19208d94c6be40e0f627cec218191171ae583','test/contracts/r24-post-audit-certification-set.contract.test.mjs'))&&successor.value.bindings.testInventoryDigest===h(objectBytes(git,'acc19208d94c6be40e0f627cec218191171ae583','docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json'))&&successor.value.programDone===false,'E_WP503_TEMPORAL_SUCCESSOR_BYTES');
  const operations=instance.value.operations,writeSet={createPaths:operations.createPaths,deletePaths:operations.deletePaths,modifyPaths:operations.modifyPaths,renamePairs:operations.renamePairs};
  assert(h(canonicalBytes(writeSet).subarray(0,-1))===expectation.writeSetDigest,'E_WP503_TEMPORAL_WRITE_SET_DIGEST');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length&&admitted.length===16,'E_WP503_TEMPORAL_PATH_DENOMINATOR');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_WP503_TEMPORAL_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_WP503_TEMPORAL_UNADMITTED_PATH',changedPath);
  const admittedPaths=[...new Set([...predecessor.admittedPaths,...admitted])].sort();
  assert(admittedPaths.length===86,'E_WP503_TEMPORAL_CUMULATIVE_PATH_DENOMINATOR');
  return{schemaVersion:'WP503_MAIN_PRODUCT_POST_EVALUATION_EXCEPTION_VERIFICATION_V2',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,failureDigest:failure.digest,successorDigest:successor.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,deltaAdmittedPathDenominator:admitted.length,admittedPathDenominator:admittedPaths.length,changedPaths:changed,admittedPaths,predecessor,sourcePlanRoles:{externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST,rolesDistinct:true}};
}

export function verifyWp503V8MainProductPostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const predecessor=verifyWp503V7MainProductPostEvaluationException({candidateSha:WP503_V8_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha,git});
  const expectation=WP503_V8_MAIN_PRODUCT_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath),failure=readJsonFile(expectation.failurePath),successor=readJsonFile(expectation.successorPath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest&&failure.digest===expectation.failureDigest,'E_WP503_REGISTRY_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId===expectation.authorityId&&authority.value.stageId===expectation.stageId,'E_WP503_REGISTRY_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.authorityId===expectation.authorityId&&instance.value.stageId===expectation.stageId&&instance.value.model==='gpt-5.6-sol'&&instance.value.reasoningEffort==='xhigh','E_WP503_REGISTRY_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR'&&Date.parse(admission.value.observedAtUtc)<=Date.now(),'E_WP503_REGISTRY_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest&&admission.value.commandScopeDigest===expectation.commandScopeDigest&&admission.value.acceptanceSignalsDigest===expectation.acceptanceSignalsDigest,'E_WP503_REGISTRY_CHAIN');
  for(const [label,value] of [['authority',authority.value],['instance',instance.value],['admission',admission.value],['failure',failure.value.sourcePlanRoles],['successor',successor.value.sourcePlanRoles]])assert(value.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&value.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_WP503_REGISTRY_SOURCE_ROLES',label);
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree&&evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_WP503_REGISTRY_BASE');
  assert(instance.value.lease?.fencingCounter===expectation.fencingCounter&&instance.value.lease.status==='ACTIVE'&&instance.value.lease.wip===1&&instance.value.lease.predecessorReleaseDigest===expectation.predecessorLeaseReleaseDigest,'E_WP503_REGISTRY_LEASE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_WP503_REGISTRY_OPERATION_BINDING');
  const predecessorById=new Map(instance.value.predecessors.map((entry)=>[entry.id,entry]));
  for(const [id,digest] of [['WP503_V7_AUTHORITY',expectation.predecessorAuthorityDigest],['WP503_V7_STAGE_INSTANCE',expectation.predecessorInstanceDigest],['WP503_V7_STAGE_ADMISSION',expectation.predecessorAdmissionDigest],['WP503_V7_WRITE_SET',expectation.predecessorWriteSetDigest],['WP503_V7_COMMAND_SCOPE',expectation.predecessorCommandScopeDigest],['WP503_CANDIDATE_CI_RUN_33536582620',expectation.failureDigest]])assert(predecessorById.get(id)?.digest===digest,'E_WP503_REGISTRY_PREDECESSOR',id);
  assert(failure.value.schemaVersion==='WP503_CANDIDATE_CI_AUDIT_R2_FAILURE_V1'&&failure.value.status==='FAIL_CLOSED_SUPERSEDED_BY_APPEND_ONLY_AUDIT_R2_REGISTRY_SUCCESSOR'&&failure.value.pullRequest?.number===1805&&failure.value.pullRequest.candidateSha===expectation.baseSha&&failure.value.pullRequest.candidateTreeSha===expectation.baseTree&&failure.value.candidateCi?.runId===33536582620&&failure.value.candidateCi.failedJob?.jobId===99952261969&&failure.value.candidateCi.failedJob.code==='E_CARRIER_REGISTRY_DIGEST'&&failure.value.rootCause?.predecessorRegistryDigest==='9da3395a8d3d0e1403bb234f09a318b3e198e0fba7e8a88f64e60cafdcf4b243','E_WP503_REGISTRY_FAILURE_IDENTITY');
  assert(successor.value.schemaVersion==='WP503_AUDIT_R2_REGISTRY_SUCCESSOR_V1'&&successor.value.status==='CURRENT_APPEND_ONLY_SUCCESSOR'&&successor.value.bindings.authorityDigest===authority.digest&&successor.value.bindings.stageInstanceDigest===instance.digest&&successor.value.bindings.stageAdmissionDigest===admission.digest&&successor.value.bindings.failureDigest===failure.digest,'E_WP503_REGISTRY_SUCCESSOR_BINDING');
  assert(successor.value.bindings.auditR2RegistryDigest===h(objectBytes(git,'96cded02b57cf0147ae2d4a063891dd63f0ac212','docs/OPS/R24/CORRECTIVE/AUDIT_R2_CARRIER_REGISTRY_V17.json'))&&successor.value.bindings.auditR2VerifierDigest===h(objectBytes(git,'96cded02b57cf0147ae2d4a063891dd63f0ac212','scripts/ops/r24/corrective/audit-r2-corrections.mjs'))&&successor.value.bindings.auditR2ContractTestDigest===h(objectBytes(git,'96cded02b57cf0147ae2d4a063891dd63f0ac212','test/contracts/r24-audit-r2-corrections.contract.test.mjs'))&&successor.value.bindings.postAuditVerifierDigest===h(objectBytes(git,'96cded02b57cf0147ae2d4a063891dd63f0ac212','scripts/ops/r24/corrective/post-audit-certification-set.mjs'))&&successor.value.bindings.postAuditContractTestDigest===h(objectBytes(git,'96cded02b57cf0147ae2d4a063891dd63f0ac212','test/contracts/r24-post-audit-certification-set.contract.test.mjs'))&&successor.value.programDone===false,'E_WP503_REGISTRY_SUCCESSOR_BYTES');
  const operations=instance.value.operations,writeSet={createPaths:operations.createPaths,deletePaths:operations.deletePaths,modifyPaths:operations.modifyPaths,renamePairs:operations.renamePairs};
  assert(h(canonicalBytes(writeSet).subarray(0,-1))===expectation.writeSetDigest,'E_WP503_REGISTRY_WRITE_SET_DIGEST');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length&&admitted.length===15,'E_WP503_REGISTRY_PATH_DENOMINATOR');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_WP503_REGISTRY_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_WP503_REGISTRY_UNADMITTED_PATH',changedPath);
  const admittedPaths=[...new Set([...predecessor.admittedPaths,...admitted])].sort();
  assert(admittedPaths.length===94,'E_WP503_REGISTRY_CUMULATIVE_PATH_DENOMINATOR');
  return{schemaVersion:'WP503_MAIN_PRODUCT_POST_EVALUATION_EXCEPTION_VERIFICATION_V3',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,failureDigest:failure.digest,successorDigest:successor.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,deltaAdmittedPathDenominator:admitted.length,admittedPathDenominator:admittedPaths.length,changedPaths:changed,admittedPaths,predecessor,sourcePlanRoles:{externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST,rolesDistinct:true}};
}

export function verifyWp503MainProductPostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const predecessor=verifyWp503V8MainProductPostEvaluationException({candidateSha:WP503_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha,git});
  const expectation=WP503_MAIN_PRODUCT_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath),failure=readJsonFile(expectation.failurePath),successor=readJsonFile(expectation.successorPath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest&&failure.digest===expectation.failureDigest,'E_WP503_INVENTORY_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId===expectation.authorityId&&authority.value.stageId===expectation.stageId,'E_WP503_INVENTORY_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.authorityId===expectation.authorityId&&instance.value.stageId===expectation.stageId&&instance.value.model==='gpt-5.6-sol'&&instance.value.reasoningEffort==='xhigh','E_WP503_INVENTORY_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR'&&Date.parse(admission.value.observedAtUtc)<=Date.now(),'E_WP503_INVENTORY_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest&&admission.value.commandScopeDigest===expectation.commandScopeDigest&&admission.value.acceptanceSignalsDigest===expectation.acceptanceSignalsDigest,'E_WP503_INVENTORY_CHAIN');
  for(const [label,value] of [['authority',authority.value],['instance',instance.value],['admission',admission.value],['failure',failure.value.sourcePlanRoles],['successor',successor.value.sourcePlanRoles]])assert(value.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&value.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_WP503_INVENTORY_SOURCE_ROLES',label);
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree&&evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_WP503_INVENTORY_BASE');
  assert(instance.value.lease?.fencingCounter===expectation.fencingCounter&&instance.value.lease.status==='ACTIVE'&&instance.value.lease.wip===1&&instance.value.lease.predecessorReleaseDigest===expectation.predecessorLeaseReleaseDigest,'E_WP503_INVENTORY_LEASE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_WP503_INVENTORY_OPERATION_BINDING');
  const predecessorById=new Map(instance.value.predecessors.map((entry)=>[entry.id,entry]));
  for(const [id,digest] of [['WP503_V8_AUTHORITY',expectation.predecessorAuthorityDigest],['WP503_V8_STAGE_INSTANCE',expectation.predecessorInstanceDigest],['WP503_V8_STAGE_ADMISSION',expectation.predecessorAdmissionDigest],['WP503_V8_WRITE_SET',expectation.predecessorWriteSetDigest],['WP503_V8_COMMAND_SCOPE',expectation.predecessorCommandScopeDigest],['WP503_V8_LOCAL_TEST_INVENTORY_FAILURE',expectation.failureDigest]])assert(predecessorById.get(id)?.digest===digest,'E_WP503_INVENTORY_PREDECESSOR',id);
  assert(failure.value.schemaVersion==='WP503_LOCAL_TEST_INVENTORY_FAILURE_V1'&&failure.value.status==='FAIL_CLOSED_SUPERSEDED_BY_APPEND_ONLY_TEST_INVENTORY_SUCCESSOR'&&failure.value.exactIdentity?.sha===expectation.baseSha&&failure.value.exactIdentity.tree===expectation.baseTree&&failure.value.result?.code==='E_INVENTORY_DIGEST_MISMATCH'&&failure.value.result.mismatchedPaths.length===3&&failure.value.result.requiredSkips===0&&failure.value.result.unexplainedSkips===0,'E_WP503_INVENTORY_FAILURE_IDENTITY');
  assert(successor.value.schemaVersion==='WP503_TEST_INVENTORY_SUCCESSOR_V1'&&successor.value.status==='CURRENT_APPEND_ONLY_SUCCESSOR'&&successor.value.bindings.authorityDigest===authority.digest&&successor.value.bindings.stageInstanceDigest===instance.digest&&successor.value.bindings.stageAdmissionDigest===admission.digest&&successor.value.bindings.failureDigest===failure.digest,'E_WP503_INVENTORY_SUCCESSOR_BINDING');
  assert(successor.value.bindings.auditR2RegistryDigest===h(fs.readFileSync('docs/OPS/R24/CORRECTIVE/AUDIT_R2_CARRIER_REGISTRY_V18.json'))&&successor.value.bindings.testInventoryDigest===h(fs.readFileSync('docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json'))&&successor.value.bindings.auditR2VerifierDigest===h(fs.readFileSync('scripts/ops/r24/corrective/audit-r2-corrections.mjs'))&&successor.value.bindings.auditR2ContractTestDigest===h(fs.readFileSync('test/contracts/r24-audit-r2-corrections.contract.test.mjs'))&&successor.value.bindings.postAuditVerifierDigest===h(fs.readFileSync('scripts/ops/r24/corrective/post-audit-certification-set.mjs'))&&successor.value.bindings.postAuditContractTestDigest===h(fs.readFileSync('test/contracts/r24-post-audit-certification-set.contract.test.mjs'))&&successor.value.programDone===false,'E_WP503_INVENTORY_SUCCESSOR_BYTES');
  const operations=instance.value.operations,writeSet={createPaths:operations.createPaths,deletePaths:operations.deletePaths,modifyPaths:operations.modifyPaths,renamePairs:operations.renamePairs};
  assert(h(canonicalBytes(writeSet).subarray(0,-1))===expectation.writeSetDigest,'E_WP503_INVENTORY_WRITE_SET_DIGEST');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length&&admitted.length===16,'E_WP503_INVENTORY_PATH_DENOMINATOR');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_WP503_INVENTORY_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_WP503_INVENTORY_UNADMITTED_PATH',changedPath);
  const admittedPaths=[...new Set([...predecessor.admittedPaths,...admitted])].sort();
  assert(admittedPaths.length===102,'E_WP503_INVENTORY_CUMULATIVE_PATH_DENOMINATOR');
  return{schemaVersion:'WP503_MAIN_PRODUCT_POST_EVALUATION_EXCEPTION_VERIFICATION_V4',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,failureDigest:failure.digest,successorDigest:successor.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,deltaAdmittedPathDenominator:admitted.length,admittedPathDenominator:admittedPaths.length,changedPaths:changed,admittedPaths,predecessor,sourcePlanRoles:{externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST,rolesDistinct:true}};
}

export function verifyCertificationSet({value,fileDigest,candidateSha='HEAD',git=defaultGit,allowAuditCycle2Admission=false,allowMainProductWp401Admission=false,allowMainProductWp402Admission=false,allowMainProductWp403Admission=false,allowMainProductWp404Admission=false,allowMainProductWp500Admission=false,allowMainProductWp501Admission=false,allowWp501GateIntegrationAdmission=false,allowWp501PerformanceIntegrationAdmission=false,allowWp501AuditR2CompatibilityAdmission=false,allowWp501InventoryFinalizationAdmission=false,allowWp501TerminalExceptionAdmission=false,allowMainProductWp502Admission=false,allowMainProductWp503Admission=false}){
  assert(value?.schemaVersion==='POST_AUDIT_CURRENT_CERTIFICATION_SET_V2'&&value.status==='CERTIFIED_DONE','E_SCHEMA_OR_STATUS');
  assert(value.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&value.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_SOURCE_PLAN_ROLE_BINDING');
  hex(value.evaluationSha,40,'evaluationSha');hex(value.evaluationTreeSha,40,'evaluationTreeSha');hex(fileDigest,64,'fileDigest');
  assert(ensureEvaluationObject(git,value.evaluationSha)===value.evaluationTreeSha,'E_EVALUATION_TREE');
  assert(Array.isArray(value.stages)&&value.stages.length===EXPECTED_STAGE_COUNT&&value.stageCount===EXPECTED_STAGE_COUNT,'E_STAGE_DENOMINATOR');
  let denominator=0;
  for(const [stageIndex,stage] of value.stages.entries()){
    assert(stage.effectiveState==='CERTIFIED_DONE'&&stage.evaluationSha===value.evaluationSha&&stage.evaluationTreeSha===value.evaluationTreeSha,'E_STAGE_EVALUATION',String(stageIndex));
    assert(Array.isArray(stage.artifactBindings)&&stage.artifactBindings.length>0,'E_STAGE_ARTIFACTS',stage.stageId);
    for(const [artifactIndex,binding] of stage.artifactBindings.entries()){
      denominator+=1;hex(binding.sha256,64,`${stage.stageId}:${artifactIndex}`);
      let bytes;try{bytes=objectBytes(git,value.evaluationSha,binding.path);}catch{fail('E_ARTIFACT_MISSING',`${stage.stageId}:${artifactIndex}:${binding.path}`);}
      const actual=h(bytes);assert(actual===binding.sha256,'E_ARTIFACT_DIGEST_MISMATCH',`${stage.stageId}:${artifactIndex}:${binding.path}:${actual}`);
    }
  }
  assert(denominator===EXPECTED_ARTIFACT_BINDING_DENOMINATOR&&value.artifactBindingDenominator===denominator&&value.verifiedArtifactBindingCount===denominator,'E_ARTIFACT_DENOMINATOR',String(denominator));
  assert(value.missingArtifactBindingCount===0&&value.mismatchedArtifactBindingCount===0&&value.allDeclaredBindingsResolvedFromEvaluationGitObjects===true,'E_COMPLETENESS_CLAIM');
  assert(value.postEvaluationCarrierException?.policy==='NON_RECURSIVE_INDEPENDENT_PROOF_CARRIERS_OR_STRICTLY_NECESSARY_GOVERNANCE_APPROVAL_ONLY_NO_CERTIFIED_ARTIFACT_BINDING_MAY_POSTDATE_EVALUATION','E_CARRIER_EXCEPTION_POLICY');
  assert(JSON.stringify(value.postEvaluationCarrierException.allowedPaths)===JSON.stringify([...ALLOWED_POST_EVALUATION_CARRIERS]),'E_CARRIER_EXCEPTION_PATHS');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);
  try{git(['merge-base','--is-ancestor',value.evaluationSha,resolvedCandidate],{encoding:null});}catch{fail('E_EVALUATION_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${value.evaluationSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  let wp401Descendant=false;
  try{git(['merge-base','--is-ancestor',WP401_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha,resolvedCandidate],{encoding:null});wp401Descendant=true;}catch{}
  let wp402Descendant=false;
  try{git(['merge-base','--is-ancestor',WP402_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha,resolvedCandidate],{encoding:null});wp402Descendant=true;}catch{}
  let wp403Descendant=false;
  try{git(['merge-base','--is-ancestor',WP403_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha,resolvedCandidate],{encoding:null});wp403Descendant=true;}catch{}
  let wp404Descendant=false;
  try{git(['merge-base','--is-ancestor',WP404_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha,resolvedCandidate],{encoding:null});wp404Descendant=true;}catch{}
  let wp500Descendant=false;
  try{git(['merge-base','--is-ancestor',WP500_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha,resolvedCandidate],{encoding:null});wp500Descendant=true;}catch{}
  let wp501Descendant=false;
  try{git(['merge-base','--is-ancestor',WP501_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha,resolvedCandidate],{encoding:null});wp501Descendant=true;}catch{}
  let wp501GateDescendant=false;
  try{git(['merge-base','--is-ancestor',WP501_GATE_INTEGRATION_ADMISSION_EXPECTATION.baseSha,resolvedCandidate],{encoding:null});wp501GateDescendant=true;}catch{}
  let wp501PerformanceDescendant=false;
  try{git(['merge-base','--is-ancestor',WP501_PERFORMANCE_INTEGRATION_ADMISSION_EXPECTATION.baseSha,resolvedCandidate],{encoding:null});wp501PerformanceDescendant=true;}catch{}
  let wp501AuditR2Descendant=false;
  try{git(['merge-base','--is-ancestor',WP501_AUDIT_R2_COMPATIBILITY_ADMISSION_EXPECTATION.baseSha,resolvedCandidate],{encoding:null});wp501AuditR2Descendant=true;}catch{}
  let wp501InventoryDescendant=false;
  try{git(['merge-base','--is-ancestor',WP501_INVENTORY_FINALIZATION_ADMISSION_EXPECTATION.baseSha,resolvedCandidate],{encoding:null});wp501InventoryDescendant=true;}catch{}
  let wp501TerminalExceptionDescendant=false;
  try{git(['merge-base','--is-ancestor',WP501_TERMINAL_EXCEPTION_ADMISSION_EXPECTATION.baseSha,resolvedCandidate],{encoding:null});wp501TerminalExceptionDescendant=true;}catch{}
  let wp502Descendant=false;
  try{git(['merge-base','--is-ancestor',WP502_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha,resolvedCandidate],{encoding:null});wp502Descendant=true;}catch{}
  let wp503Descendant=false;
  try{git(['merge-base','--is-ancestor',WP503_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha,resolvedCandidate],{encoding:null});wp503Descendant=true;}catch{}
  const wp503Enabled=allowMainProductWp503Admission||(allowAuditCycle2Admission&&wp503Descendant);
  const wp502Enabled=allowMainProductWp502Admission||(allowAuditCycle2Admission&&wp502Descendant)||wp503Enabled;
  const wp501TerminalExceptionEnabled=allowWp501TerminalExceptionAdmission||(allowAuditCycle2Admission&&wp501TerminalExceptionDescendant)||wp502Enabled;
  const wp501InventoryEnabled=allowWp501InventoryFinalizationAdmission||(allowAuditCycle2Admission&&wp501InventoryDescendant)||wp501TerminalExceptionEnabled;
  const wp501AuditR2Enabled=allowWp501AuditR2CompatibilityAdmission||(allowAuditCycle2Admission&&wp501AuditR2Descendant)||wp501InventoryEnabled;
  const wp501PerformanceEnabled=allowWp501PerformanceIntegrationAdmission||(allowAuditCycle2Admission&&wp501PerformanceDescendant)||wp501AuditR2Enabled;
  const wp501GateEnabled=allowWp501GateIntegrationAdmission||(allowAuditCycle2Admission&&wp501GateDescendant)||wp501PerformanceEnabled;
  const wp501Enabled=allowMainProductWp501Admission||(allowAuditCycle2Admission&&wp501Descendant)||wp501GateEnabled;
  const wp500Enabled=allowMainProductWp500Admission||(allowAuditCycle2Admission&&wp500Descendant)||wp501Enabled;
  const wp404Enabled=allowMainProductWp404Admission||(allowAuditCycle2Admission&&wp404Descendant)||wp500Enabled;
  const wp403Enabled=allowMainProductWp403Admission||(allowAuditCycle2Admission&&wp403Descendant)||wp404Enabled;
  const wp402Enabled=allowMainProductWp402Admission||(allowAuditCycle2Admission&&wp402Descendant)||wp403Enabled;
  const wp401Enabled=allowMainProductWp401Admission||(allowAuditCycle2Admission&&wp401Descendant)||wp402Enabled;
  const cycle2Exception=allowAuditCycle2Admission?verifyAuditCycle2PostEvaluationException({candidateSha:wp401Enabled?WP401_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha:resolvedCandidate,git}):null;
  const wp401Exception=wp401Enabled?verifyWp401MainProductPostEvaluationException({candidateSha:wp402Enabled?WP402_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha:resolvedCandidate,git}):null;
  const wp402Exception=wp402Enabled?verifyWp402MainProductPostEvaluationException({candidateSha:wp403Enabled?WP403_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha:resolvedCandidate,git}):null;
  const wp403Exception=wp403Enabled?verifyWp403MainProductPostEvaluationException({candidateSha:wp404Enabled?WP404_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha:resolvedCandidate,git}):null;
  const wp404Exception=wp404Enabled?verifyWp404MainProductPostEvaluationException({candidateSha:wp500Enabled?WP500_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha:resolvedCandidate,git}):null;
  const wp500Exception=wp500Enabled?verifyWp500MainProductPostEvaluationException({candidateSha:wp501Enabled?WP501_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha:resolvedCandidate,git}):null;
  const wp501Exception=wp501Enabled?verifyWp501MainProductPostEvaluationException({candidateSha:wp501GateEnabled?WP501_GATE_INTEGRATION_ADMISSION_EXPECTATION.baseSha:resolvedCandidate,git}):null;
  const wp501GateException=wp501GateEnabled?verifyWp501GateIntegrationPostEvaluationException({candidateSha:wp501PerformanceEnabled?WP501_PERFORMANCE_INTEGRATION_ADMISSION_EXPECTATION.baseSha:resolvedCandidate,git}):null;
  const wp501PerformanceException=wp501PerformanceEnabled?verifyWp501PerformanceIntegrationPostEvaluationException({candidateSha:wp501AuditR2Enabled?WP501_AUDIT_R2_COMPATIBILITY_ADMISSION_EXPECTATION.baseSha:resolvedCandidate,git}):null;
  const wp501AuditR2Exception=wp501AuditR2Enabled?verifyWp501AuditR2CompatibilityPostEvaluationException({candidateSha:wp501InventoryEnabled?WP501_INVENTORY_FINALIZATION_ADMISSION_EXPECTATION.baseSha:resolvedCandidate,git}):null;
  const wp501InventoryException=wp501InventoryEnabled?verifyWp501InventoryFinalizationPostEvaluationException({candidateSha:wp501TerminalExceptionEnabled?WP501_TERMINAL_EXCEPTION_ADMISSION_EXPECTATION.baseSha:resolvedCandidate,git}):null;
  const wp501TerminalException=wp501TerminalExceptionEnabled?verifyWp501TerminalExceptionPostEvaluationException({candidateSha:wp502Enabled?WP502_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha:resolvedCandidate,git}):null;
  const wp502Exception=wp502Enabled?verifyWp502MainProductPostEvaluationException({candidateSha:wp503Enabled?WP503_V6_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha:resolvedCandidate,git}):null;
  const wp503Exception=wp503Enabled?verifyWp503MainProductPostEvaluationException({candidateSha:resolvedCandidate,git}):null;
  const allowedPaths=new Set([...ALLOWED_POST_EVALUATION_CARRIERS,...(cycle2Exception?.admittedPaths??[]),...(wp401Exception?.admittedPaths??[]),...(wp402Exception?.admittedPaths??[]),...(wp403Exception?.admittedPaths??[]),...(wp404Exception?.admittedPaths??[]),...(wp500Exception?.admittedPaths??[]),...(wp501Exception?.admittedPaths??[]),...(wp501GateException?.admittedPaths??[]),...(wp501PerformanceException?.admittedPaths??[]),...(wp501AuditR2Exception?.admittedPaths??[]),...(wp501InventoryException?.admittedPaths??[]),...(wp501TerminalException?.admittedPaths??[]),...(wp502Exception?.admittedPaths??[]),...(wp503Exception?.admittedPaths??[])]);
  for(const changedPath of changed)assert(allowedPaths.has(changedPath),'E_POST_EVALUATION_PATH',changedPath);
  const boundPaths=new Set(value.stages.flatMap((stage)=>stage.artifactBindings.map((binding)=>binding.path)));
  for(const allowed of ALLOWED_POST_EVALUATION_CARRIERS)assert(!boundPaths.has(allowed),'E_POST_EVALUATION_BOUND_ARTIFACT',allowed);
  assert(value.requiredOrUnexplainedSkips===0&&value.programDone===false&&value.mainProductGraphNodeStarted===false,'E_TERMINAL_SCOPE');
  return{schemaVersion:'POST_AUDIT_CERTIFICATION_SET_VERIFICATION_V1',status:'PASS',certificationSetDigest:fileDigest,evaluationSha:value.evaluationSha,evaluationTreeSha:value.evaluationTreeSha,stageCount:value.stageCount,artifactBindingDenominator:denominator,postEvaluationChangedPaths:changed,auditCycle2PostEvaluationException:cycle2Exception,wp401MainProductPostEvaluationException:wp401Exception,wp402MainProductPostEvaluationException:wp402Exception,wp403MainProductPostEvaluationException:wp403Exception,wp404MainProductPostEvaluationException:wp404Exception,wp500MainProductPostEvaluationException:wp500Exception,wp501MainProductPostEvaluationException:wp501Exception,wp501GateIntegrationPostEvaluationException:wp501GateException,wp501PerformanceIntegrationPostEvaluationException:wp501PerformanceException,wp501AuditR2CompatibilityPostEvaluationException:wp501AuditR2Exception,wp501InventoryFinalizationPostEvaluationException:wp501InventoryException,wp501TerminalExceptionPostEvaluationException:wp501TerminalException,wp502MainProductPostEvaluationException:wp502Exception,wp503MainProductPostEvaluationException:wp503Exception};
}

const ghRaw=(endpoint)=>execFileSync('gh',['api',endpoint],{encoding:null,maxBuffer:128*1024*1024});
function args(argv){const out={};for(let i=0;i<argv.length;i+=1){const item=argv[i];if(!item.startsWith('--'))continue;const key=item.slice(2),next=argv[i+1];out[key]=next&&!next.startsWith('--')?next:true;if(next&&!next.startsWith('--'))i+=1;}return out;}
if(import.meta.url===`file://${process.argv[1]}`){
  try{
    const options=args(process.argv.slice(2));
    if(options['verify-audit-cycle-terminal']){
      const runId=finiteId(options['remote-run'],'remote-run');
      const repository='KirPonomarev/writer-editor';
      const runEvidenceFile=rawJsonBytes(ghRaw(`repos/${repository}/actions/runs/${runId}`),'run');
      const artifactsResponse=JSON.parse(ghRaw(`repos/${repository}/actions/runs/${runId}/artifacts`));
      const matchingArtifacts=artifactsResponse.artifacts.filter((entry)=>entry.name==='r24-audit-cycle1-terminal-attestation');
      assert(matchingArtifacts.length===1,'E_EXACT_ARTIFACT_SELECTION',String(matchingArtifacts.length));
      const artifactEvidence=matchingArtifacts[0];
      const zipBytes=ghRaw(`repos/${repository}/actions/artifacts/${finiteId(artifactEvidence.id,'artifact.id')}/zip`);
      const untrustedMember=JSON.parse(inspectExactZip(zipBytes,'audit-cycle1-terminal-attestation.json'));
      const candidateRunId=finiteId(untrustedMember?.correctionDelivery?.candidateCiRunId,'candidateCiRunId');
      const postmergeRunId=finiteId(untrustedMember?.correctionDelivery?.exactPostmergeCiRunId,'postmergeCiRunId');
      const rulesetEvidenceFile=rawJsonBytes(ghRaw(`repos/${repository}/rulesets/12270444`),'ruleset');
      const candidateCiEvidenceFile=rawJsonBytes(ghRaw(`repos/${repository}/actions/runs/${candidateRunId}`),'candidateCi');
      const postmergeCiEvidenceFile=rawJsonBytes(ghRaw(`repos/${repository}/actions/runs/${postmergeRunId}`),'postmergeCi');
      const verified=verifyAuditCycleTerminalArtifact({zipBytes,runEvidenceFile,artifactEvidence,rulesetEvidenceFile,candidateCiEvidenceFile,postmergeCiEvidenceFile,authorityFile:readJsonFile('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_OWNER_AMENDMENT_V15.json'),instanceFile:readJsonFile('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_INSTANCE_V16.json'),admissionFile:readJsonFile('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_ADMISSION_ATTESTATION_V16.json'),certificationFile:readJsonFile('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CURRENT_CERTIFICATION_SET_V2.json'),beforeFile:readJsonFile('docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_PROTECTED_WIP_BEFORE_V1.json')});
      const carrier=createAuditCycleDurableCarrier({zipBytes,memberBytes:verified.memberBytes,runEvidenceFile,artifactEvidence,verification:verified.verification});
      assert(options['write-durable-carrier'],'E_OUTPUT');
      atomicCanonicalWrite(options['write-durable-carrier'],carrier);
      const carrierFile=readJsonFile(options['write-durable-carrier']);
      process.stdout.write(canonicalBytes({verification:verified.verification,durableCarrierValidation:verifyAuditCycleDurableCarrier(carrierFile),durableCarrierDigest:carrierFile.digest}));
    }
    else if(options['verify-audit-cycle2-terminal']){
      const runId=finiteId(options['remote-run'],'cycle2.remote-run');
      const repository='KirPonomarev/writer-editor';
      const runEvidenceFile=rawJsonBytes(ghRaw(`repos/${repository}/actions/runs/${runId}`),'cycle2.run');
      const artifactsResponse=JSON.parse(ghRaw(`repos/${repository}/actions/runs/${runId}/artifacts`));
      const matchingArtifacts=artifactsResponse.artifacts.filter((entry)=>entry.name==='r24-audit-cycle2-terminal-attestation');
      assert(matchingArtifacts.length===1,'E_CYCLE2_EXACT_ARTIFACT_SELECTION',String(matchingArtifacts.length));
      const artifactEvidence=matchingArtifacts[0];
      const zipBytes=ghRaw(`repos/${repository}/actions/artifacts/${finiteId(artifactEvidence.id,'cycle2.artifact.id')}/zip`);
      const untrustedMember=JSON.parse(inspectExactZip(zipBytes,'audit-cycle2-terminal-attestation.json'));
      const candidateRunId=finiteId(untrustedMember?.correctionDelivery?.candidateCiRunId,'cycle2.candidateCiRunId');
      const postmergeRunId=finiteId(untrustedMember?.correctionDelivery?.exactPostmergeCiRunId,'cycle2.postmergeCiRunId');
      const rulesetEvidenceFile=rawJsonBytes(ghRaw(`repos/${repository}/rulesets/12270444`),'cycle2.ruleset');
      const candidateCiEvidenceFile=rawJsonBytes(ghRaw(`repos/${repository}/actions/runs/${candidateRunId}`),'cycle2.candidateCi');
      const postmergeCiEvidenceFile=rawJsonBytes(ghRaw(`repos/${repository}/actions/runs/${postmergeRunId}`),'cycle2.postmergeCi');
      const verified=verifyAuditCycle2TerminalArtifact({zipBytes,runEvidenceFile,artifactEvidence,rulesetEvidenceFile,candidateCiEvidenceFile,postmergeCiEvidenceFile,authorityFile:readJsonFile('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_OWNER_AMENDMENT_V17.json'),instanceFile:readJsonFile('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_INSTANCE_V18.json'),admissionFile:readJsonFile('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_ADMISSION_ATTESTATION_V18.json'),certificationFile:readJsonFile('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CURRENT_CERTIFICATION_SET_V2.json'),beforeFile:readJsonFile('docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_2_PROTECTED_WIP_BEFORE_V1.json'),predecessorReleaseFile:readJsonFile('docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_CORRECTIONS_LEASE_RELEASE_V1.json'),predecessorReceiptFile:readJsonFile('docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_CORRECTIONS_TERMINAL_RECEIPT_V1.json'),predecessorDurableFile:readJsonFile('docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1.json')});
      const carrier=createAuditCycle2DurableCarrier({zipBytes,memberBytes:verified.memberBytes,runEvidenceFile,artifactEvidence,verification:verified.verification});
      assert(options['write-durable-carrier'],'E_CYCLE2_OUTPUT');
      atomicCanonicalWrite(options['write-durable-carrier'],carrier);
      const carrierFile=readJsonFile(options['write-durable-carrier']);
      process.stdout.write(canonicalBytes({verification:verified.verification,durableCarrierValidation:verifyAuditCycle2DurableCarrier(carrierFile,{expectedCarrierDigest:carrierFile.digest}),durableCarrierDigest:carrierFile.digest}));
    }
    else if(options['verify-audit-cycle-durable']){const expectedDigest=options['expected-carrier-digest']??AUDIT_CYCLE_1_DURABLE_EXPECTATION.carrierDigest;hex(expectedDigest,64,'expected-carrier-digest');assert(expectedDigest===AUDIT_CYCLE_1_DURABLE_EXPECTATION.carrierDigest,'E_DURABLE_EXPECTED_DIGEST_PIN');const file=readJsonFile(options['verify-audit-cycle-durable']);process.stdout.write(canonicalBytes(verifyAuditCycleDurableCarrier(file,{...AUDIT_CYCLE_1_DURABLE_EXPECTATION,carrierDigest:expectedDigest})));}
    else if(options['verify-audit-cycle2-durable']){const expectedDigest=options['expected-carrier-digest'];hex(expectedDigest,64,'cycle2.expected-carrier-digest');const file=readJsonFile(options['verify-audit-cycle2-durable']);process.stdout.write(canonicalBytes(verifyAuditCycle2DurableCarrier(file,{expectedCarrierDigest:expectedDigest})));}
    else if(options.generate){const value=generateCertificationSet({sourceFile:options.source,evaluationSha:options['evaluation-sha'],evaluationTreeSha:options['evaluation-tree']});assert(options.output,'E_OUTPUT');fs.writeFileSync(options.output,`${JSON.stringify(value,null,2)}\n`);process.stdout.write(`${JSON.stringify({status:'GENERATED',output:path.normalize(options.output),evaluationSha:value.evaluationSha,artifactBindingDenominator:value.artifactBindingDenominator})}\n`);}
    else if(options.verify){const file=readJsonFile(options.verify);process.stdout.write(`${JSON.stringify(verifyCertificationSet({value:file.value,fileDigest:file.digest,candidateSha:options['candidate-sha']??'HEAD',allowAuditCycle2Admission:options['audit-cycle2-admission']===true,allowMainProductWp401Admission:options['wp401-admission']===true,allowMainProductWp402Admission:options['wp402-admission']===true,allowMainProductWp403Admission:options['wp403-admission']===true,allowMainProductWp404Admission:options['wp404-admission']===true,allowMainProductWp500Admission:options['wp500-admission']===true,allowMainProductWp501Admission:options['wp501-admission']===true,allowWp501GateIntegrationAdmission:options['wp501-gate-integration-admission']===true,allowWp501PerformanceIntegrationAdmission:options['wp501-performance-integration-admission']===true,allowWp501AuditR2CompatibilityAdmission:options['wp501-audit-r2-compatibility-admission']===true,allowWp501InventoryFinalizationAdmission:options['wp501-inventory-finalization-admission']===true,allowWp501TerminalExceptionAdmission:options['wp501-terminal-exception-admission']===true,allowMainProductWp502Admission:options['wp502-admission']===true}))}\n`);}
    else fail('E_MODE');
  }catch(error){process.stderr.write(`${JSON.stringify({status:'FAIL',code:error.code??'E_UNTYPED',message:error.message})}\n`);process.exitCode=1;}
}
