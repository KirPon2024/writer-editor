TASK_ID: YALKEN_ATLAS_V6_AUDIT_HOLD_REPAIR
MILESTONE: ATLAS_V6_INDEPENDENT_AUDIT_HOLD_REPAIR
TYPE: CORE
STATUS: AUTONOMOUS_WRITE_DELIVERY
CANON_VERSION: v1.0
CHECKS_BASELINE_VERSION: v1.3
EXACT_START_BASE: b54132bb1924c193449310590a9b8f8c8a5e4bdb
DELIVERY_POLICY: COMMIT_REQUIRED_PUSH_REQUIRED_PR_REQUIRED_MERGE_REQUIRED
DESIGN_TOOL_ROUTER: NO_DESIGN_CONTRACT_CHANGE_BEHAVIORAL_WIRING_ONLY
GOVERNANCE_CHANGE_APPROVAL: OWNER_OBJECTIVE_EXPLICITLY_REQUIRES_PRODUCTION_EQUIVALENT_CI_AND_CONTRACT_REPAIRS

## MICRO_GOAL
Close the independently confirmed Atlas HOLD at audited ancestor 52bc24ce on the exact post-Word-N4 base b54132bb by repairing admission, recovery, replay, Manual Map file I/O, append-only compensation, interprocess leasing, Stage-10 state binding, analytics scheduling, Design OS catalog binding, production negatives, and complete BCP47 preservation without replacing canon or changing the visual design contract.

## ARTIFACT
- docs/tasks/YALKEN_ATLAS_V6_AUDIT_HOLD_REPAIR.md
- docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json
- .github/workflows/rtk-required.yml
- package.json
- scripts/ops-gate.mjs
- scripts/ops/sector-m-scope-map.json
- scripts/ops/yalken-atlas-v5-r3-c03-manual-map-attachments-portals-templates.mjs
- src/collab/eventLog.mjs
- src/collab/applyEventLog.mjs
- src/collab/index.mjs
- src/core/notesStorage.mjs
- src/core/projectTreeIdentity.mjs
- src/core/runtime.mjs
- src/derived/atlas/atlasAnalyticsScheduler.cjs
- src/derived/atlas/index.mjs
- src/derived/index.mjs
- src/main.js
- src/preload.js
- src/product/projectLease.mjs
- src/product/notesStoragePersistence.mjs
- src/product/stage10ApplicationBootstrap.mjs
- src/product/stage10ApplicationCommandRoute.mjs
- src/product/stage10CommandReceiptAuthorityHead.mjs
- src/product/stage10MainPersistenceAdapter.mjs
- src/product/stage10ProductWiring.mjs
- src/product/stage10RecoverySnapshot.mjs
- src/renderer/commands/command-catalog.v1.mjs
- src/renderer/design-os/atlasFeatureIntegrationManifest.mjs
- src/renderer/design-os/index.mjs
- src/renderer/design-os/atlasSlotCatalog.v1.mjs
- src/renderer/editor.js
- src/renderer/editor.bundle.js
- src/shared/productCommandRegistry.cjs
- src/shared/workspaceQueryRegistry.cjs
- test/contracts/yalken-atlas-v6-audit-hold-repair.contract.test.js
- test/contracts/yalken-atlas-v6-production-negative.contract.test.js
- test/contracts/yalken-atlas-v5-final-audit-p0-04-design-os-binding.contract.test.js
- test/contracts/yalken-atlas-v5-final-audit-p0-05-manual-map-portability.contract.test.js
- test/contracts/yalken-atlas-v5-stage10-pr1391-audit-repair.contract.test.js
- test/unit/sector-m-s17-notes-schema-storage.test.js
- scripts/ops/yalken-atlas-v6-production-lifecycle.mjs

## ALLOWLIST
- docs/tasks/YALKEN_ATLAS_V6_AUDIT_HOLD_REPAIR.md
- docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json
- .github/workflows/rtk-required.yml
- package.json
- scripts/ops-gate.mjs
- scripts/ops/sector-m-scope-map.json
- scripts/ops/yalken-atlas-v5-r3-c03-manual-map-attachments-portals-templates.mjs
- src/collab/eventLog.mjs
- src/collab/applyEventLog.mjs
- src/collab/index.mjs
- src/core/notesStorage.mjs
- src/core/projectTreeIdentity.mjs
- src/core/runtime.mjs
- src/derived/atlas/atlasAnalyticsScheduler.cjs
- src/derived/atlas/index.mjs
- src/derived/index.mjs
- src/main.js
- src/preload.js
- src/product/projectLease.mjs
- src/product/notesStoragePersistence.mjs
- src/product/stage10ApplicationBootstrap.mjs
- src/product/stage10ApplicationCommandRoute.mjs
- src/product/stage10CommandReceiptAuthorityHead.mjs
- src/product/stage10MainPersistenceAdapter.mjs
- src/product/stage10ProductWiring.mjs
- src/product/stage10RecoverySnapshot.mjs
- src/renderer/commands/command-catalog.v1.mjs
- src/renderer/design-os/atlasFeatureIntegrationManifest.mjs
- src/renderer/design-os/index.mjs
- src/renderer/design-os/atlasSlotCatalog.v1.mjs
- src/renderer/editor.js
- src/renderer/editor.bundle.js
- src/shared/productCommandRegistry.cjs
- src/shared/workspaceQueryRegistry.cjs
- test/contracts/yalken-atlas-v6-audit-hold-repair.contract.test.js
- test/contracts/yalken-atlas-v6-production-negative.contract.test.js
- test/contracts/yalken-atlas-v5-final-audit-p0-04-design-os-binding.contract.test.js
- test/contracts/yalken-atlas-v5-final-audit-p0-05-manual-map-portability.contract.test.js
- test/contracts/yalken-atlas-v5-stage10-pr1391-audit-repair.contract.test.js
- test/unit/sector-m-s17-notes-schema-storage.test.js
- scripts/ops/yalken-atlas-v6-production-lifecycle.mjs

## DENYLIST
- CANON.md and all active canon, COREX, BIBLE, CONTEXT, PROCESS, and HANDOFF replacements
- src/renderer/index.html and src/renderer/styles.css
- any network request, cloud adapter, account, authentication, secret, payment, or production action
- any new dependency or UI framework
- any second journal, renderer-owned author truth, direct reducer promotion, fixture-only capability, or manifest self-certification
- any force-push, rebase, amend, stash, reset, checkout, clean, destructive worktree operation, or mutation of the frozen R1-C checkpoint
- any mutation of the owner checkout
- any self-PASS or release acceptance claim

## CONTRACT / SHAPES
- FEATURE_INTEGRATION_MANIFEST_V1: existing Atlas manifest remains the integration contract and is resolved only against live product command catalog, live provider catalog, and an independent exact slot catalog.
- PRODUCT_AUTHORITY: Product Core plus canonical command and event history own author truth; integrity-bound recovery provenance is the only admitted supplemental source.
- DERIVED_DATA: Atlas analytics results are retained by project, source revision, query identity, and generation and are never author truth.
- COMMAND_AUTHORITY: one Command Kernel path owns local, collaborator, history-compensation, and Manual Map import/export commands.
- WRITE_PATH: visible intent -> command bus -> capability admission -> main-owned lease -> revision and authority CAS -> command and immutable events -> atomic project, session, recovery, and artifact transaction.
- READ_PATH: selected project -> revision-bound query projection -> exact Design OS provider and slot binding -> existing renderer surface.
- EVENTS_AND_QUERIES: original collaborator envelopes are validated before normalization; schema, command version, project, lifecycle, causal, dependency, target, and session identity are preserved.
- PRODUCT_PORTS: Stage-10 persistence, local file authority, project lease, atomic writer, recovery, and analytics scheduler are main-owned ports.
- DESIGN_OS_PORTS: command, provider, and slot catalogs are required inputs; missing or unresolved inputs fail closed.
- DESIGN_OS_CONTRIBUTION: existing surfaces and placement remain unchanged.
- STATE_CLASSES: project author truth, immutable operation history, integrity-bound recovery, derived analytics, shell selection, and transient UI progress remain distinct.
- IDENTITY_GUARDS: projectId, lifecycleId, schemaVersion, commandVersion, currentRevision, priorRevision, authority head, event identity, operation identity, generation, and source revision are checked.
- SECURITY_BOUNDARY: local-only file paths are dialog or test-harness selected, extension and size bounded, symlinks denied, bytes hashed, and no renderer path authority is accepted.
- PLATFORM_FALLBACKS: JSON and SVG produce real local bytes; unavailable PDF returns a truthful typed rejection without claiming binary generation.
- ACCESSIBILITY_AND_LOCALE: existing keyboard controls remain; valid complete BCP47 tags, extensions, private-use, and explicit und policy are preserved without author-text normalization.
- RECOVERY: snapshots are immutable, internally hashed, project and lifecycle bound, revision and authority bound, ancestry checked, and admitted before write or publication.
- MIGRATIONS_AND_COMPATIBILITY: unsupported future collaborator, recovery, event, command, or author schema versions fail closed without normalization loss.
- PERFORMANCE_BUDGET: scheduler coalesces identical work, cancels superseded work, incrementally invalidates by dependency keys, retains bounded results, and discards stale completion.
- HOT_PATH_BOUNDARY: analytics scheduling does not run on editor keystroke mutation and file I/O stays in main.
- NEGATIVE_BYPASS_CHECKS: foreign lifecycle, future versions, stale and rollback recovery, state injection, direct Manual Map persistence, lease conflict, stale CAS, fixed UI payloads, missing catalogs, stale analytics, malformed BCP47, and fake binary exports are executable negatives.
- CURRENT_REALITY: this task repairs only independently confirmed HOLD findings and ends at fresh exact-head audit readiness.
- EVIDENCE_BINDINGS: focused product contracts, production-equivalent lifecycle script, packaged Electron path, promotion suite, strict ops, doctrine, OSS, renderer build, performance, RTK, and Atlas graph checks.
- MATERIALIZATION: EXISTING_SEAM for Command Kernel, persistence, renderer and query bridges; NEW_PORT only for lease, recovery validator, and retained analytics scheduler.

## IMPLEMENTATION_STEPS
0) Capture clean exact-base status and run the gated prechecks before product edits.
1) Admit collaborator envelopes before normalization and preserve immutable causal provenance through append and replay.
2) Introduce strict recovery envelopes and remove canonicalTruthLink state substitution from write and replay paths.
3) Convert restore and undo into append-only compensating operations with integrity-bound recovery references.
4) Add a main-owned interprocess lease and lock-held revision plus authority CAS around complete Stage-10 transactions.
5) Route Manual Map JSON intake and JSON plus SVG export through capability policy, canonical command dispatch, atomic persistence, recovery, reopen, replay, and real bytes; reject unavailable PDF truthfully.
6) Bind Stage-10 renderer controls to current selected project and immutable comment, conflict, exchange, and event projections; disable unavailable actions instead of creating fixtures.
7) Integrate a retained Atlas analytics scheduler with coalescing, invalidation, cancellation, bounded retention, and stale discard.
8) Resolve Atlas surfaces against live command and provider catalogs plus an independent exact slot catalog and fail closed on missing bindings.
9) Preserve complete syntactically valid BCP47 tags, including extensions and private-use, with explicit und policy and unchanged manuscript text.
10) Add executable positive and negative product tests and a production lifecycle harness, then run all required promotion and packaged checks.
11) Commit, push, open PR, wait for required CI, merge, verify exact merged head, clean only this task worktree if safe, and stop at fresh independent exact-head audit readiness.

## CHECKS
CHECK_01_PRE_EXACT_BASE_AND_CLEAN_ISOLATION
CMD: git rev-parse HEAD && git rev-parse origin/main && git status --porcelain --untracked-files=all
PASS: both SHAs equal b54132bb1924c193449310590a9b8f8c8a5e4bdb before this task artifact and no unrelated delta exists

CHECK_02_PRE_CANON_RESOLUTION
CMD: node -e 'const fs=require("node:fs");const j=JSON.parse(fs.readFileSync("docs/OPS/STATUS/CANON_STATUS.json","utf8"));if(j.status!=="ACTIVE_CANON"||!j.canonicalDocPath||!fs.existsSync(j.canonicalDocPath))process.exit(1);if(!Array.isArray(j.activeFeatureExtensions)||j.activeFeatureExtensions.length<2)process.exit(1);process.exit(0);'
PASS: exit 0 with active canon and at least the bound Atlas plus Word extensions

CHECK_03_PRE_FOCUSED_BASELINE
CMD: npm run test:atlas-event-contract && npm run test:atlas-release-truth
PASS: baseline result recorded without interpreting existing green as repaired capability

CHECK_04_POST_ALLOWED_DELTA_ONLY
CMD: node -e 'const {execSync}=require("node:child_process");const allow=new Set(process.argv.slice(1));if(!allow.size){console.error("ALLOWLIST is empty");process.exit(2);}const out=execSync("git status --porcelain --untracked-files=all",{encoding:"utf8"}).trimEnd();if(!out){console.error("Working tree is clean");process.exit(1);}for(const line of out.split("\n")){const p=line.slice(3).split(" -> ").at(-1);if(!allow.has(p)){console.error(`Disallowed change: ${p}`);process.exit(1);}}process.exit(0);' .github/workflows/rtk-required.yml docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json docs/tasks/YALKEN_ATLAS_V6_AUDIT_HOLD_REPAIR.md package.json scripts/ops-gate.mjs scripts/ops/sector-m-scope-map.json scripts/ops/yalken-atlas-v5-r3-c03-manual-map-attachments-portals-templates.mjs src/collab/eventLog.mjs src/collab/applyEventLog.mjs src/collab/index.mjs src/core/notesStorage.mjs src/core/projectTreeIdentity.mjs src/core/runtime.mjs src/derived/atlas/atlasAnalyticsScheduler.cjs src/derived/atlas/index.mjs src/derived/index.mjs src/main.js src/preload.js src/product/notesStoragePersistence.mjs src/product/projectLease.mjs src/product/stage10ApplicationBootstrap.mjs src/product/stage10ApplicationCommandRoute.mjs src/product/stage10CommandReceiptAuthorityHead.mjs src/product/stage10MainPersistenceAdapter.mjs src/product/stage10ProductWiring.mjs src/product/stage10RecoverySnapshot.mjs src/renderer/commands/command-catalog.v1.mjs src/renderer/design-os/atlasFeatureIntegrationManifest.mjs src/renderer/design-os/index.mjs src/renderer/design-os/atlasSlotCatalog.v1.mjs src/renderer/editor.js src/renderer/editor.bundle.js src/shared/productCommandRegistry.cjs src/shared/workspaceQueryRegistry.cjs test/contracts/yalken-atlas-v5-final-audit-p0-04-design-os-binding.contract.test.js test/contracts/yalken-atlas-v5-final-audit-p0-05-manual-map-portability.contract.test.js test/contracts/yalken-atlas-v5-stage10-pr1391-audit-repair.contract.test.js test/contracts/yalken-atlas-v6-audit-hold-repair.contract.test.js test/contracts/yalken-atlas-v6-production-negative.contract.test.js test/unit/sector-m-s17-notes-schema-storage.test.js scripts/ops/yalken-atlas-v6-production-lifecycle.mjs
PASS: exit 0 and every changed path is allowlisted

CHECK_05_POST_FOCUSED_ATLAS
CMD: npm run test:atlas-event-contract && npm run test:atlas-release-truth
PASS: all focused positive and negative contracts pass

CHECK_06_POST_PRODUCTION_NEGATIVES
CMD: node scripts/ops/yalken-atlas-v6-production-lifecycle.mjs --negative-matrix && node --test test/contracts/yalken-atlas-v6-production-negative.contract.test.js
PASS: every bounded HOLD item has an executable production-path rejection

CHECK_07_POST_STRICT_GOVERNANCE
CMD: GOVERNANCE_CHANGE_APPROVED=1 npm run test:ops && npm run design-os:doctrine && npm run oss:policy && npm run build:renderer
PASS: all commands exit 0 and generated renderer bundle is current

CHECK_08_POST_MAINTAINED_PRODUCT
CMD: npm run test:rtk && npm run test:atlas-graph && npm run test:performance
PASS: maintained RTK, Atlas graph, and performance checks pass

CHECK_09_POST_PROMOTION_AND_PACKAGED_LIFECYCLE
CMD: npm run promotion:check && npm run test:electron && node scripts/ops/yalken-atlas-v6-production-lifecycle.mjs --packaged
PASS: full promotion and packaged control-to-command-to-persistence-to-reopen-to-replay lifecycle pass

CHECK_10_POST_DELIVERY
CMD: git status --short && git log -1 --format=%H && gh pr checks --required
PASS: scoped commit pushed, PR required checks green, PR merged, and origin main exact-head post-merge checks pass

## STOP_CONDITION
- Stop with STOP_NOT_DONE on any canon contradiction, wrong T7 identity, frozen checkpoint mutation, owner checkout mutation, dependency addition, design-contract expansion, secret or account prompt, force-push requirement, protection bypass, irreversible deletion, or unrepairable merge-base drift.
- Stop with STOP_NOT_DONE if any required check, push, PR, required CI, merge, or exact-head verification remains incomplete.
- On success stop only at READY_FOR_FRESH_INDEPENDENT_EXACT_HEAD_AUDIT and do not self-accept the release.

## REPORT_FORMAT
- TASK_ID
- HEAD_SHA_BEFORE
- HEAD_SHA_AFTER
- COMMIT_SHA
- CHANGED_BASENAMES
- STAGED_SCOPE_MATCH
- COMMIT_OUTCOME
- PUSH_RESULT
- PR_RESULT
- MERGE_RESULT
- DESIGN_TOOL_ROUTER
- CHECKS_RESULT
- INVARIANTS_RESULT
- NEXT_STEP

## FAIL_PROTOCOL
- Preserve every scoped write and report the exact typed blocker.
- Do not reset, stash, clean, checkout, rebase, amend, force-push, or mutate the frozen checkpoint or owner checkout.
- Do not widen canon, dependencies, UI structure, network scope, or delivery authority.
- Do not bypass failed CI, branch protection, capability admission, lease ownership, recovery validation, or exact-head verification.
- Do not issue PASS; independent audit remains the next authority after successful merge.
