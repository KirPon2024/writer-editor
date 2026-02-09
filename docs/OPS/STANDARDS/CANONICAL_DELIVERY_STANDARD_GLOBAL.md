# OPS — GLOBAL CANONICAL DELIVERY STANDARD v0.1.2
STATUS: FINAL / EXECUTABLE / FROZEN (UNTIL M6)
MODE: FOUNDATIONAL_OPS_CANON
FORMAT_CANON: ONE_RAW_MD_BLOCK_ONLY

---

## 0) PURPOSE
Канонизировать единый стандарт работы (loop / агент / доставка) для:
- необратимого прогресса через `origin/main`,
- устранения ложных STOP-циклов (DNS / CI / process),
- масштабирования на все будущие сектора,
- ревизии прошлых контуров без переписывания истории,
- сохранения качества без процессного дрейфа и “дрочева”.

Документ является **FOUNDATIONAL** и не привязан к конкретному сектору.

---

## 1) SCOPE & IMMUTABILITY
1. Документ действует для:
   - всех будущих секторов,
   - текущих активных контуров,
   - ревизии legacy-контуров (read-only + review).
2. Документ **заморожен** до завершения фаз M5 и M6.
3. Изменения допускаются **только** при:
   - P0 инциденте (security, data loss, hard CI deadlock),
   - bump версии (`v0.x → v0.(x+1)`).

---

## 2) CANON (SOURCE OF TRUTH)
1. Единственный источник истины о прогрессе — `origin/main`.
2. Локальные ветки и worktree **не каноничны** до merge в `main`.
3. Любые решения, принятые вне каноничного worktree, запрещены.

STOP_CONDITION (GLOBAL POLICY):
- split-brain worktree → `STOP_REQUIRED=1`
- нарушение WIP policy в момент delivery (см. §6) → `STOP_REQUIRED=1`

---

## 3) EXECUTION MODES (REMOVE FALSE BLOCKS)

### 3.1 MODE=LOCAL_EXEC (OFFLINE-OK)
Разрешено:
- разработка,
- локальные тесты,
- doctor / runner,
- подготовка коммитов.

Запрещено:
- push / PR / merge / post-merge verify.

STOP-условия в LOCAL_EXEC:
- допускается STOP только по:
  - G1 (split-brain),
  - G2 (локальные precheck выявили реальную проблему продукта/инвариантов).

LOCAL_EXEC не блокируется отсутствием сети (G0 не применяется).

---

### 3.2 MODE=DELIVERY_EXEC (NETWORK-REQUIRED)
Разрешено:
- push → PR → checks → HO → merge → post-verify.

Обязательные условия входа:
- валидный `TASK_ID`,
- PASS на G0 (см. §4),
- WIP policy соблюдена (см. §6, online validation).

FAIL:
- любой blocking gate FAIL → `STOP_REQUIRED=1`.

---

## 4) HARD GATES (BLOCKING, MAX=5)
Ни один следующий шаг не допускается без PASS на предыдущем (в пределах режима).

### G0 — DELIVERY_NETWORK_GATE (DELIVERY ONLY)
Цель: блокировать **только delivery**, не локальную работу.

#### G0.1 ORIGIN-AWARE CHECK (BLOCKING)
Блокирующий критерий:
- `git ls-remote origin -h` MUST PASS.

Требования:
- gate **обязан** работать с фактическим `origin` URL,
- host/protocol определяется динамически,
- запрещён хардкод `github.com`.

PASS:
- `NETWORK_GATE_GIT_OK=1`
- `NETWORK_GATE_OK=1`

FAIL:
- `FAIL_REASON=NETWORK_GATE_FAIL`
- `RETRY_MAX=1`

#### G0.2 DIAGNOSTIC CHECKS (NON-BLOCKING)
Допускаются:
- `ssh -T <origin-host>`
- `curl -I <origin-host>`

Результаты:
- diagnostic-only, **не влияют** на PASS/FAIL.

---

### G1 — CANON WORKTREE GATE (ALWAYS)
PASS:
- `CANON_WORKTREE_POLICY_OK=1`
- `CANON_WORKTREE_SPLIT_BRAIN_DETECTED=0`

FAIL:
- `FAIL_REASON=CANON_WORKTREE_SPLIT_BRAIN`

---

### G2 — PRECHECK (LOCAL / DELIVERY)
PASS:
- секторные тесты,
- runner `--pack fast`,
- doctor,
- отсутствие регрессий critical tokens (см. §5).

FAIL:
- `FAIL_REASON=CHECKS_FAILED`

---

### G3 — DELIVERY PIPELINE (DELIVERY ONLY)
Линейный путь:
1. `git push`
2. PR (`base=main`)
3. required checks
4. HO comment `GO:<TASK_TOKEN>`
5. merge (repo policy default)

MERGE POLICY RULE (MACHINE):
- delivery должен зафиксировать метод merge в OUT:
  - `MERGE_METHOD=merge_commit|squash|rebase|merge_queue|unknown`
- обязателен токен:
  - `DELIVERY_MERGE_METHOD_OK=1`
- `DELIVERY_MERGE_METHOD_OK=1` означает:
  - выбранный метод разрешён политикой репо (policy default),
  - и он не нарушает пост-проверку G4.

FAIL:
- `FAIL_REASON=DELIVERY_BLOCKED`

---

### G4 — POST-MERGE VERIFY (DELIVERY ONLY)
Требование:
- проверка **строго** на `origin/main`.

Процедура:
1. `git fetch origin`
2. `git worktree add -d /tmp/post-merge-verify-<TASK_ID> origin/main`
3. запуск `doctor` в verify-worktree
4. verify выводит:
   - `POST_MERGE_VERIFY_OK=1|0`
   - `POST_MERGE_VERIFY_DETAIL=...`

Cleanup:
- best-effort,
- при fail cleanup устанавливать:
  - `POST_MERGE_VERIFY_CLEANUP_OK=0`
  - `POST_MERGE_VERIFY_CLEANUP_DEBT_REPORTED=1`
- threshold-stop:
  - если `POST_MERGE_VERIFY_CLEANUP_FAIL_STREAK>=3` → `STOP_REQUIRED=1`, `FAIL_REASON=OPS_ENV_DEGRADED`

Счётчик streak (норматив):
- хранить в файле:
  - `scripts/ops/.state/post_merge_cleanup_streak.json`
- обновляется только в DELIVERY_EXEC.

FAIL:
- `FAIL_REASON=POST_MERGE_VERIFY_FAIL`

---

## 5) CRITICAL TOKENS (GLOBAL POLICY, SECTOR-SCOPED OUTPUT)
1. Critical tokens определяются в checks-doc активного сектора.
2. Проверка критичных токенов выполняется в G2/G4 и выводится в формате:
   - `SECTOR_<ID>_CRITICAL_TOKENS_OK=1|0`

Global всегда:
- `CANON_WORKTREE_SPLIT_BRAIN_DETECTED=0`

Delivery-only:
- сетевые readiness токены (если есть) проверяются только в DELIVERY_EXEC.

FAIL:
- `FAIL_REASON=CRITICAL_TOKEN_REGRESSION`

---

## 6) WIP POLICY (ANTI-DRIFT)

### 6.1 HARD RULE (GLOBAL POLICY)
- допускается **ровно один** active delivery.

Определение:
- ACTIVE_DELIVERY = open PR в `main`, state != merged/closed.

### 6.2 ENFORCEMENT (WHERE/WHEN)
- WIP policy является глобальной, но **machine-detection** выполняется только в DELIVERY_EXEC.

В DELIVERY_EXEC (blocking):
- `WIP_LIMIT_OK=1`
- `ACTIVE_DELIVERY_COUNT=0|1`
- если `ACTIVE_DELIVERY_COUNT>1` и нет исключения → STOP

В LOCAL_EXEC:
- WIP проверка N/A (не блокирует), но допускается advisory warning.

FAIL:
- `FAIL_REASON=WIP_LIMIT_VIOLATION`

---

## 7) EXCEPTIONS (MACHINE-CHECKABLE, DELIVERY ONLY)
Разрешены:
- `ROLLBACK_PR`
- `EMERGENCY_FIX_PR`

Требование:
- PR comment:
  - `GO:ROLLBACK_PR_APPROVED`
  - или `GO:EMERGENCY_FIX_PR_APPROVED`

Валидация:
- только в DELIVERY_EXEC (через PR metadata/API),
- LOCAL_EXEC → N/A.

FAIL:
- `FAIL_REASON=EXCEPTION_ARTIFACT_MISSING|EXCEPTION_ARTIFACT_INVALID`

---

## 8) NAMING & TOKENS (DOCTOR / RUNNER ONLY)
1. Применяется **только** к machine tokens (doctor/runner/gates).
2. Domain error codes (`E_*`, `MD_*`) **не подпадают** под правило.

Обязательный паттерн:
- `SECTOR_<ID>_*`
- `<PHASE>_<ID>_*`

Требование:
- все токены объявлены в sector checks-doc.

---

## 9) FAST vs FULL (SECTOR-SCOPED)
1. FAST — минимальный блокирующий набор.
2. FULL — FAST + FULL_ONLY_SET.
3. FULL_ONLY_SET ≠ ∅, если FULL объявлен.

Токен (sector-scoped):
- `SECTOR_<ID>_FAST_FULL_DIVERGENCE_OK=1`

FAIL:
- `FAIL_REASON=FULL_DUPLICATES_FAST`

---

## 10) REQUIRED CHECKS SYNC (DELIVERY ONLY, MACHINE)
Требование:
- в DELIVERY_EXEC должен существовать единственный источник truth для expected required checks:
  - `scripts/ops/required-checks.json` (repo-local contract)

PASS:
- `REQUIRED_CHECKS_SYNC_OK=1`

Синхронизация:
- если sync невозможен (API недоступен) → STOP, потому что это delivery-only неопределённость:
  - `FAIL_REASON=REQUIRED_CHECKS_SOURCE_UNAVAILABLE`

---

## 11) LEGACY REVIEW (NON-BLOCKING + EMERGENCY PATH)
Цель:
- выявление рисков,
- перенос знаний,
- без ретро-STOP.

Результат:
- report-only,
- без изменения канона.

Если в legacy-review найден P0 риск:
- разрешён только путь `EMERGENCY_FIX_PR` (см. §7),
- любые прочие изменения запрещены.

---

## 12) PROCESS BALANCE (ADVISORY)
Рекомендации:
- product PR : ops PR ≥ 3 : 1
- одна цель доставки за раз
- ops-фикисы пакетно после фазы

Нарушение:
- advisory-only (не STOP).

---

## 13) ASSUMPTIONS (EXPLICIT)
- доступ к git обязателен,
- gh/API требуется только в DELIVERY_EXEC,
- doctor реализует токены данного стандарта,
- required checks для delivery берутся из `scripts/ops/required-checks.json`.

---

## 14) DONE CRITERIA
Стандарт считается внедрённым, если:
- delivery блокируется **только** сетевыми и продуктными факторами,
- локальная работа возможна offline,
- WIP управляется без ручных споров,
- post-merge verify детерминирован,
- required checks имеют формальный источник truth,
- advisory не превращаются в STOP.

---

END.
