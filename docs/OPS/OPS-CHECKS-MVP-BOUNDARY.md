# OPS-CHECKS-MVP-BOUNDARY

### 1.2 SSOT_ARTIFACTS (EXACT)
- docs/OPS/OPS-CHECKS-MVP-BOUNDARY.md
- scripts/doctor.mjs
- docs/OPS/CONTOUR-C-ENFORCEMENT.json
- docs/OPS/DEBT_REGISTRY.json
- docs/OPS/INVARIANTS_REGISTRY.json
- docs/OPS/INVENTORY_INDEX.json
- docs/OPS/RUNTIME_SIGNALS.json

### 1.3 VIEW_ARTIFACT (EXACT)
- VIEW := any artifact not listed under `### 1.2 SSOT_ARTIFACTS (EXACT)` MUST be treated as VIEW ONLY and MUST NOT be treated as SSOT.

### 1.4 CHECK (EXACT)
- READ_ONLY := the CHECK MUST NOT modify the git worktree (proved by clean git status before and after).
- READ_ONLY does NOT require "no writes outside the repo".

## 7) CANONICAL COMMAND (EXACT)
- CMD: npm run -s ops:mvp-boundary
- This command is the only canonical entrypoint for enforcing the MVP boundary.
