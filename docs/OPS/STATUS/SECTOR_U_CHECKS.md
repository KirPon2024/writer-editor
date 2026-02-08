# SECTOR U Check-Pack

## FAST (PR)

| CHECK_ID | ORDER | CMD | EXPECT | FAIL_REASON |
|---|---:|---|---|---|
| SECTOR_U_FAST_01 | 1 | `npm run test:sector-u` | exit code `0` | `TEST_FAIL` |
| CHECK_U1_COMMAND_LAYER | 2 | `node --test test/unit/sector-u-u1-command-layer.test.js` | exit code `0` | `CHECK_PACK_FAIL` |
| CHECK_U2_UI_NO_PLATFORM_DIRECT | 3 | `node scripts/guards/sector-u-ui-no-platform-direct.mjs` | DETECT_ONLY mode exits `0`; BLOCKING mode exits `2` on findings | `CHECK_PACK_FAIL` |
| SECTOR_U_FAST_02 | 4 | `node scripts/doctor.mjs` | `SECTOR_U_STATUS_OK=1` and `SECTOR_U_NO_RUNTIME_PRODUCT_WAIVERS_OK=1` and `SECTOR_U_FAST_DURATION_OK=1` and `U1_COMMANDS_PROOF_OK=1` and `U2_PROOF_OK=1` and `U2_TTL_EXPIRED=0` | `DOCTOR_FAIL` |

## FULL (merge/nightly)

| CHECK_ID | ORDER | CMD | EXPECT | FAIL_REASON |
|---|---:|---|---|---|
| SECTOR_U_FULL_01 | 1 | `npm test` | exit code `0` | `TEST_FAIL` |
| SECTOR_U_FULL_02 | 2 | `node scripts/doctor.mjs` | `SECTOR_U_STATUS_OK=1` and `SECTOR_U_NO_RUNTIME_PRODUCT_WAIVERS_OK=1` | `DOCTOR_FAIL` |
