# CODEX_NO_APPROVAL_MODE

## Purpose

Eliminate delivery hangs when Codex approval UI is unresponsive, and keep execution moving through a deterministic fallback.

---

## Symptoms

- Approval dialog appears, but `Yes/No/Submit` is not clickable.
- Approval action is visible but does not trigger command execution.
- Repeated approval retries do not change state.

---

## Quick 30-second workaround

1. Restart Codex app.
2. Hard reload the current session/view.
3. Switch session/mode once and retry exactly one approval action.

If still blocked: switch immediately to `MODE=MANUAL_EXEC`.

Rule: do not retry approval many times. One retry maximum, then fallback.

---

## MODE=AUTO_EXEC

- Agent executes commands directly.
- Before runner commands that write artifacts, set `SECTOR_*_ARTIFACTS_ROOT` to `/tmp/<task-id>/...` when worktree write safety is uncertain.
- If any of these occurs, auto-switch to manual mode:
  - approval hang after one retry,
  - `mkdir denied`,
  - sandbox write denied,
  - cannot write under `artifacts/**`.

---

## MODE=MANUAL_EXEC

- Agent does not request approval.
- Agent prints a complete block:
  - `MODE=MANUAL_EXEC`
  - `Run these commands`
  - `Expected PASS signals`
  - `STOP_CONDITION`
  - `Paste outputs here`
- Human runs commands and returns raw output.
- Agent continues using only returned evidence.

### Required agent output template

```text
MODE=MANUAL_EXEC
Run these commands:
<commands block>

Expected PASS signals:
<tokens/exit codes>

STOP_CONDITION:
<explicit fail criteria>

Paste outputs here:
<human pastes raw output>
```

---

## TRIGGERS

Switch from `MODE=AUTO_EXEC` to `MODE=MANUAL_EXEC` immediately when:

1. Approval UI hangs after one retry.
2. Any `Operation not permitted` / sandbox-denied write to worktree.
3. Any runner cannot create paths under `artifacts/**`.

---

## Artifacts root policy (`/tmp/**`)

Use temporary artifacts roots by default when write stability is not guaranteed.

- U:
  - `SECTOR_U_ARTIFACTS_ROOT=/tmp/<task-id>/sector-u-run`
- M:
  - `SECTOR_M_ARTIFACTS_ROOT=/tmp/<task-id>/sector-m-run`
- Future sectors:
  - `SECTOR_<X>_ARTIFACTS_ROOT=/tmp/<task-id>/sector-<x>-run`

Rule:
- `node scripts/sector-*-run.mjs --pack ...` should be executed with `SECTOR_*_ARTIFACTS_ROOT=/tmp/...` whenever worktree artifact writes may be denied.

---

## COPY-PASTE COMMANDS

### U smoke (post-merge / pre-HO GO tag)

```bash
node scripts/doctor.mjs | rg "SECTOR_U_PHASE=|SECTOR_U_.*OK=|NEXT_SECTOR_READY="
SECTOR_U_ARTIFACTS_ROOT=/tmp/u-smoke/sector-u-run node scripts/sector-u-run.mjs --pack fast
SECTOR_U_ARTIFACTS_ROOT=/tmp/u-smoke/sector-u-run node scripts/sector-u-run.mjs --pack full
npm run test:sector-u
npm run test:sector-u-full
```

Expected PASS signals:
- `exit 0` for each command
- `SECTOR_U_RUN_OK=1` for fast/full runner
- required doctor tokens present

### M0 smoke

```bash
node scripts/doctor.mjs | rg "SECTOR_M_|NEXT_SECTOR_READY="
SECTOR_M_ARTIFACTS_ROOT=/tmp/m0-smoke/sector-m-run node scripts/sector-m-run.mjs --pack fast
npm run test:sector-m
```

Expected PASS signals:
- `exit 0` for each command
- `SECTOR_M_RUN_OK=1`
- `SECTOR_M_STATUS_OK=1`

---

## STOP_CONDITION

Fail immediately when any of the following is true:

1. Command exit code is non-zero.
2. Expected token is missing.
3. `*_RUN_OK=0`.
4. Output shows sandbox denied / write denied and no manual fallback is engaged.

---

## Operational note

This runbook is a process workaround for Codex UI instability. It does not change product code, sector logic, or runtime behavior.
