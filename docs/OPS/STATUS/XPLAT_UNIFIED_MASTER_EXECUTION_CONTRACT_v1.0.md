# XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_v2.9
## FINAL MASTER — PROOF-BOUND / HEAD-STRICT / TOKEN-AUTHORITATIVE / XPLAT-COST-GUARANTEED / FREEZE-READY

VERSION: v2.9
STATUS: ACTIVE CANON
NOTE: Freeze profile currently governed by runtime evaluator
MODE: PRODUCT_ARCHITECTURE + DELIVERY
CANON: CRAFTSMAN v1.2 (STRICT)
OPS_BASELINE: v1.3 (ACTIVE)
LANG: RU
FORMAT_CANON: ONE_RAW_MD_BLOCK_ONLY
MARKERS: SSOT-only / no runtime wiring / PASS criteria / BLOCKED criteria / sha256

---

# 0. PURPOSE

Контракт фиксирует инженерный стандарт, гарантирующий:

- единый доменный SoT
- детерминизм
- XPLAT-дешевизну (85–95% shared code)
- отсутствие псевдо-DONE
- отсутствие process-tax
- необратимый прогресс

LOCKED ORDER:

CORE_SOT_EXECUTABLE
→ CAPABILITY_ENFORCEMENT
→ XPLAT_ADAPTERS
→ DERIVED/PRODUCT_EXPANSION
→ PERFORMANCE_HARDENING

---

# 1. HEAD-STRICT RULE

## 1.1 DEV MODE
HEAD должен быть потомком origin/main.

## 1.2 RELEASE / FREEZE MODE (STRICT)

HEAD допустим только если:

A) HEAD == origin/main
ИЛИ
B) HEAD имеет tag `release/*`, и origin/main является предком HEAD.

Точный tag-check (без двусмысленности “имеет tag”):

- `git tag --points-at HEAD --list 'release/*'` должен вернуть **хотя бы 1 строку**.
  (Если строк 0 — tag отсутствует.)

ProofHook (строгий, воспроизводимый):

- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `git merge-base --is-ancestor origin/main HEAD`
- `test -n "$(git tag --points-at HEAD --list 'release/*' | head -n 1)"`

Token:
HEAD_STRICT_OK

Нарушение → `E_HEAD_BINDING_INVALID`

---

# 2. TOKEN DECLARATION VALIDATION

Канонический путь:

docs/OPS/TOKENS/TOKEN_DECLARATION.json

Обязательные поля:

- schemaVersion
- existingTokens[]
- targetTokens[]

ProofHook:

- JSON schema validation
- cross-check: каждый existingToken реально эмитится authoritative источниками (doctor/truth-table)
- запрет пересечения: один и тот же token не может быть одновременно в existing и target

Token:
TOKEN_DECLARATION_VALID_OK

Отсутствие или несоответствие → BLOCKED в freeze-mode.

---

# 3. SCR (SHARED CODE RATIO) — STRICT FORMULA + CONCRETE PROOFHOOK

SCR = shared_runtime_loc / total_runtime_loc

Где:

shared_runtime_loc включает (канонический scope):
- src/core/**
- src/shared/**
- src/ports/**
- src/adapters/** (только shared adapters, не platform-specific реализации)

Исключаются из подсчёта LOC:
- test/**
- scripts/**
- dev-tools/**
- vendor/**
- node_modules/**
- generated/**
- blank lines
- comment-only lines

Единственный канонический proofHook (конкретная команда):

- `node scripts/ops/scr-calc.mjs --json`

Требования к `scripts/ops/scr-calc.mjs` (метод нельзя “подкрутить”):
- один фиксированный список include/exclude (как выше)
- считает LOC как: non-blank AND not comment-only
- выдаёт JSON с полями:
  - runtime_shared_loc
  - runtime_total_loc
  - runtime_scr (0..1)
  - app_total_loc
  - app_scr (0..1)
  - runtime_platform_breakdown (top platform-specific runtime paths)
  - toolVersion
  - configHash (sha256 от нормализованного runtime/app scope rules)

Blocking token:
SCR_RUNTIME_SHARED_RATIO_OK

Info token (non-blocking):
SCR_APP_TOTAL_SHARED_RATIO_INFO

Legacy compatibility:
SCR_SHARED_CODE_RATIO_OK = alias(SCR_RUNTIME_SHARED_RATIO_OK)

PASS для экономического claim (85–95% shared code) возможен только если одновременно:
- SCR_RUNTIME_SHARED_RATIO_OK = 1 (runtime_scr ≥ 0.85)
- PLATFORM_COVERAGE_BOUNDARY_TESTED_OK = 1
- CAPABILITY_ENFORCED_OK = 1
- ADAPTERS_ENFORCED_OK = 1

---

# 4. TTL & DEBT — STRICT ENFORCEMENT

Каждый debt обязан иметь:

- owner (GitHub handle или команда)
- severity (D0–D3)
- ttlUntil (ISO date)
- createdAt
- exitCriteria
- rollbackPlan

Severity:

D0 informational
D1 ≤ 30 дней
D2 ≤ 90 дней
D3 release-blocking

Grace window:

TTL_ENFORCE_FROM + максимум 14 дней (upper bound жёсткий).

После grace:

DEBT_TTL_EXPIRED_COUNT > 0 → BLOCKED

Token:
DEBT_TTL_VALID_OK

---

# 5. CRITICAL_ROLLUPS_BASELINE (FREEZE REQUIRED)

Обязательные =1:

CRITICAL_CLAIM_MATRIX_OK
CORE_SOT_EXECUTABLE_OK
COMMAND_SURFACE_ENFORCED_OK
CAPABILITY_ENFORCED_OK
RECOVERY_IO_OK
PERF_BASELINE_OK
GOVERNANCE_STRICT_OK
XPLAT_CONTRACT_OK
HEAD_STRICT_OK
TOKEN_DECLARATION_VALID_OK
SCR_RUNTIME_SHARED_RATIO_OK

Optional (только если feature входит в release-scope):

COLLAB_STRESS_SAFE_OK
COMMENTS_HISTORY_SAFE_OK
SIMULATION_MIN_CONTRACT_OK

---

# 6. CRITICAL CLAIM MATRIX (MACHINE-READABLE)

Канонический путь:

docs/OPS/CLAIMS/CRITICAL_CLAIM_MATRIX.json

Назначение:
- единая машинная таблица связей: claimId → requiredToken → proofHook → failSignal → blocking → sourceBinding
- не второй SoT: только агрегирует ссылки на authoritative proofHooks

ProofHook:
- JSON schema validation
- contract-test: все requiredToken реально существуют/эмитятся authoritative источниками
- contract-test: нет конфликтов sourceBinding/namespace

Token:
CRITICAL_CLAIM_MATRIX_OK

---

# 7. DRIFT CONTROL

DRIFT_UNRESOLVED_P0_COUNT = 0 обязательно.

ProofHook:
- drift scanner
- token source cross-check

---

# 8. COLLAB / COMMENTS / HISTORY (SCOPE-GATED)

Если feature входит в релиз:

COLLAB_STRESS_SAFE_OK требует:
- deterministic merge policy
- typed conflict envelope
- replay determinism
- no network state mutation bypass Core/Command Surface

COMMENTS_HISTORY_SAFE_OK требует:
- no second SoT
- deterministic derivation
- recovery-safe integration

TelemetryPort в MVP: offline-only.

---

# 9. PASS criteria

PASS только если:

- все CRITICAL_ROLLUPS_BASELINE = 1
- DRIFT_UNRESOLVED_P0_COUNT = 0
- DEBT_TTL_VALID_OK = 1
- HEAD_STRICT_OK = 1
- TOKEN_DECLARATION_VALID_OK = 1
- SCR_RUNTIME_SHARED_RATIO_OK = 1

---

# 10. BLOCKED criteria

BLOCKED если:

- HEAD strict нарушен
- placeholder Core
- capability matrix пустая при заявке на B DONE
- missing required token
- token source conflict
- expired TTL
- CRITICAL_CLAIM_MATRIX отсутствует/невалиден
- TOKEN_DECLARATION отсутствует/невалиден
- runtime_scr < 0.85 (при заявке на экономический claim)

---

# 11. FINAL VERDICT

v2.9:

- полностью устраняет двусмысленность release-tag rule
- фиксирует конкретный SCR proofHook и анти-подкрутку методики
- делает claim-matrix обязательным baseline-роллапом
- сохраняет архитектурную подвижность (UI/меню/форматы/фичи)
- запрещает только дорогие и опасные нарушения (второй SoT, silent fallback, недетерминизм, platform-ветвления в домене)

Это freeze-grade мастер-контракт при условии фактической реализации и эмиссии proofHooks/токенов.

# 12. RUNTIME_ALIGNMENT_NOTE

На момент активации v2.9 фактический freeze-profile
определяется `scripts/ops/freeze-ready-evaluator.mjs`.

Документ v2.9 задаёт целевую модель.
Runtime alignment выполняется отдельными микрошагами.

Это intentional staged activation.

END
