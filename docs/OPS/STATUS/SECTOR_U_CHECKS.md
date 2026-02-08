# SECTOR U Check-Pack

## FAST (PR)

| CHECK_ID | ORDER | CMD | EXPECT | FAIL_REASON |
|---|---:|---|---|---|
| SECTOR_U_FAST_01 | 1 | `npm run test:sector-u` | exit code `0` | `TEST_FAIL` |
| CHECK_U1_COMMAND_LAYER | 2 | `node --test test/unit/sector-u-u1-command-layer.test.js` | exit code `0` | `CHECK_PACK_FAIL` |
| CHECK_U2_UI_NO_PLATFORM_DIRECT | 3 | `node scripts/guards/sector-u-ui-no-platform-direct.mjs` | DETECT_ONLY mode exits `0`; BLOCKING mode exits `2` on findings | `CHECK_PACK_FAIL` |
| CHECK_U3_EXPORT_WIRING | 4 | `node --test test/unit/sector-u-u3-*.test.js` | exit code `0` | `CHECK_PACK_FAIL` |
| CHECK_U4_UI_TRANSITIONS | 5 | `node scripts/guards/sector-u-ui-state-transitions.mjs --mode BLOCKING` | exit code `0` | `CHECK_PACK_FAIL` |
| CHECK_U4_UI_NO_SIDE_EFFECTS | 6 | `node scripts/guards/sector-u-ui-no-side-effects.mjs --mode DETECT_ONLY` | detect-only mode exits `0` and outputs deterministic violations | `CHECK_PACK_FAIL` |
| CHECK_U4_UI_TESTS | 7 | `node --test test/unit/sector-u-u4-*.test.js` | exit code `0` | `CHECK_PACK_FAIL` |
| CHECK_U5_UI_ERROR_MAPPING | 8 | `node --test test/unit/sector-u-u5-*.test.js` | exit code `0` | `CHECK_PACK_FAIL` |
| SECTOR_U_FAST_02 | 9 | `node scripts/doctor.mjs` | `SECTOR_U_STATUS_OK=1` and `SECTOR_U_NO_RUNTIME_PRODUCT_WAIVERS_OK=1` and `SECTOR_U_FAST_DURATION_OK=1` and `U1_COMMANDS_PROOF_OK=1` and `U2_PROOF_OK=1` and `U2_TTL_EXPIRED=0` and `U3_EXPORT_PROOF_OK=1` and `U4_PROOF_OK=1` and `U5_PROOF_OK=1` | `DOCTOR_FAIL` |

## FULL (merge/nightly)

| CHECK_ID | ORDER | CMD | EXPECT | FAIL_REASON |
|---|---:|---|---|---|
| SECTOR_U_FULL_01 | 1 | `npm test` | exit code `0` | `TEST_FAIL` |
| SECTOR_U_FULL_02 | 2 | `node scripts/doctor.mjs` | `SECTOR_U_STATUS_OK=1` and `SECTOR_U_NO_RUNTIME_PRODUCT_WAIVERS_OK=1` | `DOCTOR_FAIL` |
