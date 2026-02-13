# macOS Release Readiness Matrix v1.0

## Current Status (Snapshot)
- Estimated Readiness: ~30%
- Target: Release Candidate (RC)
- Canon priority: macOS first (ref `docs/corex/COREX.v1.md`, section 14.1)

---

## 8-Criteria Scale (0-100)

| Criterion           | Status % | Definition of 100%                                                                                   | Gap                                                                                      |
|--------------------|----------|-------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| Core Engine        | 35%      | Stable scene-centric editor core, no blocking regressions, deterministic behavior under long sessions | Finish migration to vNext editor/storage flow and remove critical legacy edge-cases      |
| Storage Layer      | 25%      | Project format v1 fully active (`manifest/styles/scenes/assets/backups`) + atomic writes + recovery  | Complete v1 storage rollout, recovery guarantees, and corruption/fallback handling       |
| Export System      | 20%      | DOCX v1 production-ready with predictable formatting and regression coverage                          | Finalize DOCX pipeline and cover major writing structures with golden tests              |
| Packaging/Notarize | 15%      | Signed + notarized macOS app, reproducible release packaging, documented release pipeline            | Build hardened macOS release pipeline (signing, notarization, artifact verification)     |
| QA Coverage        | 25%      | Contract + integration + smoke coverage for macOS release path with stable CI signal                  | Expand release-focused automated checks and manual release checklist                      |
| Performance        | 30%      | Baseline defined and locked (startup, editing latency, large project behavior) with guard thresholds | Establish baseline metrics and enforce perf gates on critical user flows                 |
| Security           | 45%      | Security policy fully enforced (CSP/navigation/window/IPC/path guards) with verification evidence     | Close remaining verification gaps and attach policy-to-check traceability                |
| UX / Menu System   | 45%      | macOS-native UX consistency (menus, shortcuts, editing ergonomics) validated in RC checklist          | Final polish for menu/shortcut behavior and UX acceptance sweep across key writing flows |

---

## Required Milestones to Reach RC

- M1 - Core feature completeness
  - Close editor-core migration gaps and freeze behavior-critical invariants.
- M2 - Stable local storage
  - Complete project format v1 implementation and recovery/atomic-write guarantees.
- M3 - Packaging + signing
  - Implement release packaging, signing, notarization, and reproducibility checks.
- M4 - E2E macOS QA pass
  - Pass release smoke/E2E matrix and resolve all blocker-level defects.
- M5 - Performance baseline freeze
  - Define, measure, and lock macOS baseline thresholds with regression alerts.
- M6 - UX finalization
  - Complete macOS interaction polish, shortcut reliability, and final RC checklist.

---

## Estimated Remaining Execution Tickets

- Total rough range to macOS RC: **18-28 tickets**
- By milestone:
  - M1: 4-6 tickets
  - M2: 4-6 tickets
  - M3: 3-5 tickets
  - M4: 3-4 tickets
  - M5: 2-3 tickets
  - M6: 2-4 tickets

---

## Dependency Clarification

- Windows/Linux follow macOS reference implementation after macOS baseline stabilization.
- Web/mobile are out of current release scope.
- No cross-platform adapters before macOS baseline freeze.

---

## Acceptance Mapping (for this document step)

- Added a formal 8-criteria readiness matrix (0-100 scale).
- Defined concrete RC milestones and a bounded ticket estimate range.
- Separated Product-grade closure work from OPS-grade hardening sequence.
