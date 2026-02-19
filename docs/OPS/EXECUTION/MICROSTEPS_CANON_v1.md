# MICROSTEPS CANON v1

Status: CANONICAL  
Supersedes: CODEX↔GPT CLOSED-LOOP SPEC v3.3 (for daily execution only)  
Purpose: Microstep execution discipline without autocycle orchestration

## 1. Core Principles

- Zero semantic drift
- No silent failures
- Bounded patches (<=2 per unit)
- One controlled allowlist expansion max
- No rollback post-merge (emergency only forward)

## 2. Roles

GPT:
- Defines MAIN_TZ and PATCH_TZ
- Defines DONE
- Localizes root cause

Codex:
- Executes via runner
- Applies diffs
- Runs required gate pack
- Emits evidence

## 3. Microstep Flow

MAIN_TZ  
-> Implement  
-> Run required gates  
-> PASS -> PR -> merge  
-> FAIL -> GPT root cause  
-> PATCH_TZ  
-> resume

Bounded:
- <=3 MAIN_TZ per batch
- <=2 PATCH per unit

## 4. Required Discipline (from autocycle learnings)

Keep:
- Split hash thinking (determinism vs environment awareness)
- Controlled freeze
- Side-effect EPHEMERAL default
- Unique approvals by filePath
- Anti-swap before merge
- Cache never committed
- Risk-based smoke (only for RUNTIME_FEATURE/CORE)

Remove:
- Autocycle state machine
- Stagnation counters
- Automatic GPT escalation logic
- Autocycle-specific snapshots
- Autocycle-only CLI flags

## 5. Tier Model

DOCS_ONLY:
- Governance change detection

RUNTIME_LIGHT:
- Governance change detection
- Strict doctor
- dev:fast

RUNTIME_FEATURE:
- RUNTIME_LIGHT gate pack
- Risk-based smoke for changed runtime area

CORE:
- RUNTIME_FEATURE gate pack
- Extended risk-based smoke across affected cross-runtime/core paths

## 6. Emergency Policy (Forward Only)

- `BREAK_GLASS=1`
- Incident required
- Forward-only patch
- Audited
