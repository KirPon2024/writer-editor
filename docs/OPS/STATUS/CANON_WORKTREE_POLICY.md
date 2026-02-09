# CANON WORKTREE POLICY

CANON_WORKTREE_POLICY_SCHEMA=canon-worktree-policy.v1
CANON_WORKTREE_SOURCE=origin/main
CANON_WORKTREE_MUST_BE_CLEAN=1
CANON_WORKTREE_DECISION_SOURCE=origin/main_only
CANON_WORKTREE_NON_CANON_PREFIX=/Volumes/
CANON_WORKTREE_NON_CANON_PREFIX_2=/private/tmp/
CANON_WORKTREE_SPLIT_BRAIN_DETECT_MODE=DETECT_ONLY
FAIL_REASON=E_CANON_WORKTREE_SPLIT_BRAIN

## Rule
- Canonical decisions for sector status/gates are taken only from a clean worktree synced with `origin/main`.
- Any divergent local tree (stale branch, dirty worktree, or ad-hoc path copy) is non-canonical for STOP/GO decisions.

## Detection
- If ops docs contain explicit non-canonical path markers, doctor sets `CANON_WORKTREE_SPLIT_BRAIN_DETECTED=1` (detect-only).
- `CANON_WORKTREE_POLICY_OK=1` requires this policy file and schema markers above.
