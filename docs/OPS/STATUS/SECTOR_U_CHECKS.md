# SECTOR U Check-Pack

## FAST (PR)

| CHECK_ID | ORDER | CMD | EXPECT | FAIL_REASON |
|---|---:|---|---|---|
| SECTOR_U_FAST_01 | 1 | `npm run test:sector-u` | exit code `0` | `TEST_FAIL` |
| SECTOR_U_FAST_02 | 2 | `node scripts/doctor.mjs` | `SECTOR_U_STATUS_OK=1` and `SECTOR_U_NO_RUNTIME_PRODUCT_WAIVERS_OK=1` and `SECTOR_U_FAST_DURATION_OK=1` | `DOCTOR_FAIL` |

## FULL (merge/nightly)

| CHECK_ID | ORDER | CMD | EXPECT | FAIL_REASON |
|---|---:|---|---|---|
| SECTOR_U_FULL_01 | 1 | `npm test` | exit code `0` | `TEST_FAIL` |
| SECTOR_U_FULL_02 | 2 | `node scripts/doctor.mjs` | `SECTOR_U_STATUS_OK=1` and `SECTOR_U_NO_RUNTIME_PRODUCT_WAIVERS_OK=1` | `DOCTOR_FAIL` |
