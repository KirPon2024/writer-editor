# BASELINE_FIX_DUP_TOKEN_SECTOR_M_PHASE_REPORT

## FACTS
- ROOT_CAUSE: `scripts/doctor.mjs` emitted canonical key `SECTOR_M_PHASE` twice (compat + canonical).
- BLOCKER: CP-6 path failed before contract test with `DUP_TOKEN_SECTOR_M_PHASE=1`.
- FIX: compatibility output moved to advisory key `SECTOR_M_PHASE_COMPAT`, canonical key remains single `SECTOR_M_PHASE`.

## CHANGED_FILES
- `scripts/doctor.mjs`
- `test/unit/doctor-no-dup-sector-m-phase.test.js`

## CHECK_RESULTS
- BF-0: `git status --porcelain` before baseline fix = clean
- BF-1: `npm test -- test/contracts/codex-automation-policy.test.js` reproduced `DUP_TOKEN_SECTOR_M_PHASE=1`
- BF-2: patch scope = allowlist only
- BF-3: `node --test test/unit/doctor-no-dup-sector-m-phase.test.js` = PASS
- BF-4: `node scripts/doctor.mjs | rg '^SECTOR_M_PHASE=' | wc -l` = 1
- BF-5: `npm run -s test:ops` = PASS
- BF-6: report created, `ASSUMPTIONS=[]`

## NOTES
- After removing duplicate phase token, CP-6 no longer fails on `DUP_TOKEN_SECTOR_M_PHASE`.
- Remaining failures in full `npm test -- test/contracts/codex-automation-policy.test.js` are unrelated baseline failures (`M_STABILITY_003`, `M8/M9 phase expectations`, `allowlist violations in sector-m/sector-w runner tests`).

## ASSUMPTIONS
- []
