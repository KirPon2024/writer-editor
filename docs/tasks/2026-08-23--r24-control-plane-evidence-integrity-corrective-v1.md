# R2.4 Control-Plane Evidence Integrity Corrective V1

TASK_ID: YALKEN-R24-GOV1-CONTROL-PLANE-EVIDENCE-INTEGRITY-CORRECTIVE-20260823
TASK_TYPE: OPS_GOVERNANCE
STATUS: OWNER_AUTHORIZED_ACTIVE
BINDING_BASE_SHA: 64f577e415f475982a79e314c627dd5e59e50b73
GOVERNANCE_CHANGE_APPROVAL: OWNER_PROCESS_CORRECTION_20260823

## Decision

The ordinary scheduler selection is suspended for one bounded corrective
contour. This is an owner-authorized repair amendment using the repository's
existing corrective-contour mechanism; it does not add, remove, reorder, or
renumber nodes in the committed 109-node executable program.

The corrective is admitted only to:

- make PlanState contour transitions executable-replayable after a declared
  pre-v2 baseline, with CAS, idempotency, active-lease, and fencing enforcement;
- bind scheduler receipts to the exact PlanState revision and digest, fencing
  counter, policy epoch and digest, executable graph digest, and evaluation
  repository identities;
- validate claim-bearing evidence artifacts as strict EvidenceStampV2 or
  ClaimBindingV1 objects;
- keep implementation-source, evaluation-head/tree, PR-head, merge, and
  postmerge identities in distinct roles.

## Evidence Basis

- WP-102 changed from its initial pending state to its terminal state in one
  committed PlanState revision while naming an intermediate previous state.
- Replacing in-memory revision and fencing values did not change the generated
  scheduler receipt.
- A stampId-only object resolved a docs claim even though the EvidenceStampV2
  compiler rejected it; eleven committed binding artifacts used the wrong
  schema identity.

## Boundaries

- No product runtime, UI, Word or Drive document, SAFE_APPLY, dependency,
  release, signing, cloud, AI, credential, or destructive authority.
- No mutation of the executable program graph.
- No admission of WP-103 or another ordinary node until this corrective has
  completed delivery and postmerge verification.
- The parked V2 worktree remains untouched.
- Historical direct writes are classified as pre-v2 unreplayable history; no
  synthetic transition evidence may be invented.

## Delivery

One branch, non-force push, one pull request, exact-head required checks, policy
merge, postmerge verification, survivor audit, and fresh scheduler resolution.
Rollback before merge is the bounded branch delta; after merge, any correction
requires a new explicitly authorized contour.
