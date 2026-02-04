# OPS-REPORT-FORMAT (CANON)

This file defines a canonical, repo-backed report format for task execution evidence.

## REQUIRED FIELDS (MUST)

- STEP_ID: <string>
  - STEP_ID must be unique across steps in a report.
- CHANGED: <files>
- CHECK: <checks, each with CMD/OUT/PASS|FAIL>
- OUT: <write/commit + post-commit proofs>
- ASSUMPTIONS: (empty)
- FAIL_REASON:
- EVIDENCE:
- REQUIRED_INPUT:

## CHECK ORDER (MUST)

- PRE-CHANGE check MUST exist:
  - CMD: `git status --porcelain --untracked-files=all`
  - PASS: OUT is `(empty)`
- PRE-COMMIT check MUST exist:
  - CMD: `git status --porcelain --untracked-files=all`
  - PASS: OUT matches expected staged/unstaged state for the step

## SRC-ONLY STEPS (MUST)

- A baseline doctor evidence check MUST exist:
  - CMD: `CHECKS_BASELINE_VERSION=v1.3 node scripts/doctor.mjs`
  - PASS: command exits 0 and prints deterministic tokens

## POST-COMMIT PROOFS (MUST)

- POST-COMMIT proof MUST include name-only:
  - POST-COMMIT CMD: `git show --name-only --pretty=format: HEAD`
  - POST-COMMIT OUT: <paths>
- POST-COMMIT proof MUST include name-status:
  - POST-COMMIT CMD: `git show --name-status --pretty=format: HEAD`
  - POST-COMMIT OUT:
```
D  example/deleted-file.txt
M  example/modified-file.txt
```
- POST-COMMIT proof MUST include clean worktree:
  - POST-COMMIT CMD: `git status --porcelain --untracked-files=all`
  - POST-COMMIT OUT: (empty)

## POST-COMMIT BLOB PROOF (MUST)

## COMMAND TEMPLATES (MUST)

- `CMD_TEMPLATE_BLOB_POST`: `git cat-file -t HEAD:<path>`
- `CMD_TEMPLATE_BLOB_PRE`: `git cat-file -t HEAD^:<path>`

- POST-COMMIT BLOB PROOF:
  - CMD: `CMD_TEMPLATE_BLOB_POST`
  - OUT: `blob`
  - PASS|FAIL

Rule: this block MUST appear for each committed file path in the step.

## MODIFICATION BLOB PROOF (MUST)

For each path that appears as `M` in POST-COMMIT `git show --name-status --pretty=format: HEAD` output:

- PRE-COMMIT BLOB PROOF (MODIFIED PATH):
  - CMD: `CMD_TEMPLATE_BLOB_PRE`
  - OUT: `blob`
  - PASS|FAIL
- POST-COMMIT BLOB PROOF (MODIFIED PATH):
  - CMD: `CMD_TEMPLATE_BLOB_POST`
  - OUT: `blob`
  - PASS|FAIL

For each path that appears as `D` in POST-COMMIT `git show --name-status --pretty=format: HEAD` output:

- PRE-COMMIT BLOB PROOF (DELETED PATH):
  - CMD: `CMD_TEMPLATE_BLOB_PRE`
  - OUT: `blob`
  - PASS|FAIL
- POST-COMMIT PATH REMOVED PROOF (DELETED PATH):
  - CMD: `CMD_TEMPLATE_BLOB_POST`
  - OUT: (exit != 0)
  - PASS|FAIL

## NO DUPLICATE CMD RULE (MUST)

- Within a single report, the exact `CMD:` string MUST NOT appear more than once.
- Exception: the report CAN repeat the same command only if:
  - the repetition is explicitly labeled as distinct semantic phases: `PRE-CHANGE`, `PRE-COMMIT`, `POST-COMMIT`, and
  - the expected `OUT:` is explicitly different and phase-bound.
- If the same command is repeated without meeting the exception, the report is invalid.

Example (invalid):

```
- CHECK:
  - CMD: `git status --porcelain --untracked-files=all`
  - OUT: (empty)
  - PASS
  - CMD: `git status --porcelain --untracked-files=all`
  - OUT: (empty)
  - PASS
```

Example (valid):

```
- CHECK:
  - CMD: `git status --porcelain --untracked-files=all` (PRE-CHANGE)
  - OUT: (empty)
  - PASS
  - CMD: `git status --porcelain --untracked-files=all` (PRE-COMMIT)
  - OUT: ` M path/to/file`
  - PASS
```
