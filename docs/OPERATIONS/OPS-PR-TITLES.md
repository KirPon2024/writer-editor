# Closure PR Title/Description Templates

## Purpose
- Provide a consistent title/description shape for PRs that close a contour.
- Improve traceability without changing execution rules.

## Scope
- Applies to closure PRs that summarize and finalize a contour outcome.
- Does not alter contour definitions or enforcement.

## PR Title Template
- `CONTOUR-A: close and stabilize (summary)`

## PR Description Template
- Summary:
  - What is closed and why it is considered closed.
- Guarantees:
  - What invariants are satisfied.
- Artifacts:
  - Key documents and scripts that represent the closure state.

## Forbidden Patterns
- Using the branch name as the PR title.
- Promising future work or future scope expansions.
- Turning the description into a roadmap.

## Examples
- Title: `CONTOUR-A: close and stabilize (summary)`
- Description:
  - Summary: CONTOUR-A closed with contracts layer stabilized and drift controls in place.
  - Guarantees: export surface complete; core purity enforced; smoke check available.
  - Artifacts: ops-gate; smoke script; contracts docs; contour completion marker.
