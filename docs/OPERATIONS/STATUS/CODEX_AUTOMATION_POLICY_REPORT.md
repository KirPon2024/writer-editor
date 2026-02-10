# CODEX_AUTOMATION_POLICY_REPORT

## ENV
- MODE: PR-1 bootstrap
- WORKTREE: `/private/tmp/writer-editor-codex-automation-fast-v1`
- CANON: CRAFTSMAN v1.2 (unchanged)

## RUNNER_PROFILE
- REF: `docs/OPERATIONS/STATUS/CODEX_RUNNER_PROFILE.md`

## PROMPT_MODE
- target: `prompt_disabled`

## PROMPT_DETECTION_METHOD
- markerRegex: `(permission|allowlist|approve|apply\\s+changes)`
- exitCodeOnPrompt: `97`
- synthetic prompt elimination: `NOT_RUN_IN_PR1`

## HASHES
- ALLOWLIST_HASH: `TBD_PR2`
- DENYLIST_HASH: `TBD_PR2`
- COMMAND_ALLOWLIST_HASH: `TBD_PR2`
- POLICY_JSON_SHA256: `TBD_PR2`

## CHECK_RESULTS
| CHECK_ID | RESULT |
|---|---|
| CP-0 | PASS |
| CP-1 | PASS |
| CP-2 | PASS |
| CP-3 | PASS |
| CP-4 | PASS |
| CP-5 | PASS |
| CP-6 | FAIL (`DUP_TOKEN_SECTOR_M_PHASE=1` from `npm run -s test:ops`) |

## STOP_EVENTS
- `CP-6 blocked by baseline: DUP_TOKEN_SECTOR_M_PHASE=1`

## ASSUMPTIONS
- []
