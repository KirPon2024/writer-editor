# U Detect-Only Carveout (post U DONE)

TASK_ID=OPS-P0-SECTOR-M-PREP-001
CARVEOUT_SCHEMA=u-detect-only-carveout.v1
WHAT=U2/U4 guards remain DETECT_ONLY after SECTOR_U DONE
WHY=Legacy renderer paths still contain known direct API usage; tightening is deferred by design
UNTIL=Separate tightening task/sector is approved and scheduled
NON_BLOCKING_FOR_SECTOR_M=1
FAIL_REASON=E_U_DETECT_ONLY_CARVEOUT_MISSING

References:
- scripts/guards/sector-u-ui-no-platform-direct.mjs (U2-RULE-001)
- scripts/guards/sector-u-ui-no-side-effects.mjs (U4-RULE-002)
