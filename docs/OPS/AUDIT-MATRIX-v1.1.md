# AUDIT-MATRIX-v1.1.md
## Operational Audit Matrix (Risk → Scenario → Signal → Invariant → Check)

**Статус:** CANON / OPS  
**Цель:** превратить архитектурный аудит в исполнимую систему гейтов.  
**Формат:** каждый вопрос → риск → инвариант → сигнал → CHECK (команда) → hard/soft политика.  
**Нотация обязательности:** MUST / SHOULD / MAY.

---

## 0) Как этим пользоваться (операционно)

1) Любой новый архитектурный риск добавляется в **Risk Registry** (см. §2).  
2) Любой новый инвариант MUST иметь:
   - `signal` (как проявляется в коде/рантайме)
   - `checkId` (как мы это ловим)
3) Любой `checkId` MUST быть:
   - воспроизводимым (node-only, без локальных утилит)
   - детерминированным
4) Любое исключение из инварианта MUST:
   - иметь `debtId`, `owner`, `TTL`, `exitCriteria`
   - попадать в `ARCH_DIFF_LOG` и валидироваться doctor-ом (§9)

---

## 1) Уровни строгости (P0/P1/P2)

### P0 — Hard Stop (не обсуждается)
Инварианты, нарушение которых создаёт архитектурный долг с экспоненциальной стоимостью.
- Любой FAIL = STOP (CI красный).

### P1 — Hard Stop, но допускаются редкие исключения через Debt Registry
- FAIL = STOP, если нет явного `debtId`/TTL/owner.
- Иначе PASS с warning и счётчиком “архитектурного долга”.

### P2 — Soft Fail (warning), но с метрикой/наблюдаемостью
- FAIL не блокирует PR, но MUST создавать видимый сигнал (warning + запись в отчёт).

---

## 2) Risk Registry (канонический формат записи)

Каждый риск оформляется так:

- `RISK_ID`: уникальный id (пример: `RISK-CORE-DET-001`)
- `Severity`: P0 / P1 / P2
- `Owner`: роль/человек (если нет — FAIL)
- `Scenario`: как ломается в реальности
- `Signal`: первый наблюдаемый признак
- `Invariant`: что обязано быть всегда истинным
- `CheckId`: ссылка на CHECK из каталога (§8)
- `FixProtocol`: что делать при FAIL
- `DebtPolicy`: допускается ли временный обход (и как)

---

## 3) CORE — чистота, детерминизм, власть решений

### RISK-CORE-DET-001 (P0) — Недетерминизм из-за времени
- **Scenario:** внутри Core появляется `Date.now()` / `new Date()` или “тайминги” без входов.
- **Signal:** scenario replay даёт разные `state/events/intents`.
- **Invariant (P0):** Core MUST NOT читать время напрямую. Время = вход (`ClockPort`/`EnvironmentSnapshot`).
- **CheckId:** `CHK-CORE-FORBIDDEN-GLOBALS`
- **FixProtocol:** вынести чтение времени в порт / передавать как input.
- **DebtPolicy:** запрещено (no debt).

### RISK-CORE-DET-002 (P0) — Недетерминизм из-за случайности/UUID
- **Scenario:** генерация id внутри Core.
- **Signal:** `stateHash` различается при одинаковых inputs.
- **Invariant:** Random/UUID MUST быть через порт/seed.
- **CheckId:** `CHK-CORE-FORBIDDEN-GLOBALS`
- **DebtPolicy:** запрещено.

### RISK-CORE-DET-003 (P0) — Параллельные команды по одному orderingKey
- **Scenario:** два command pipeline одновременно модифицируют один документ.
- **Signal:** редкие “призрачные” баги, order-dependent state.
- **Invariant:** команды в пределах `orderingKey` MUST исполняться последовательно.
- **CheckId:** `CHK-CMD-QUEUE-ORDERINGKEY`
- **DebtPolicy:** запрещено.

### RISK-CORE-BOUNDARY-001 (P0) — Импорт UI/Platform в Core/Contracts
- **Scenario:** в Core/Contracts появляются зависимости от UI/Electron/Node fs.
- **Signal:** обнаруживаются запрещённые импорты.
- **Invariant:** `src/core` и `src/contracts` MUST NOT импортировать platform/ui/electron.
- **CheckId:** `CHK-LAYER-IMPORT-BOUNDARY`
- **DebtPolicy:** запрещено.

### RISK-CORE-STATE-001 (P1) — Неиммутабельные transitions / скрытые мутации
- **Scenario:** state мутируется in-place, ломая replay/undo.
- **Signal:** флапающие тесты, “невозможные” состояния.
- **Invariant:** transitions SHOULD быть чистыми и не мутировать входной state.
- **CheckId:** `CHK-CORE-IMMUTABILITY`
- **DebtPolicy:** допускается точечно с debtId (P1), но требует exitCriteria.

### RISK-CORE-EVENTS-001 (P0) — События превращаются в RPC (“сделай X”)
- **Scenario:** event включает поля/семантику команды, подписчики начинают “управлять” доменом.
- **Signal:** появляются event-обработчики, которые меняют domain state.
- **Invariant:** DomainEvent MUST быть фактом. Никаких “doX”.
- **CheckId:** `CHK-EVENTS-FACTS-ONLY`
- **DebtPolicy:** запрещено.

---

## 4) Intents & Effects — повтор, идемпотентность, отложенность

### RISK-EFFECTS-IDEMP-001 (P0) — Non-idempotent effect без idempotencyKey
- **Scenario:** save/rename выполняется дважды (replay/crash) и портит данные.
- **Signal:** дубли/повреждения на диске.
- **Invariant:** каждый non-idempotent effect MUST иметь `idempotencyKey`.
- **CheckId:** `CHK-EFFECTS-IDEMPOTENCY`
- **DebtPolicy:** запрещено.

### RISK-EFFECTS-POLICY-001 (P1) — Не определена политика “must/should/best-effort”
- **Scenario:** отказ эффекта приводит к “молчаливой” деградации без диагностики.
- **Signal:** пропажи autosave/backup без ошибок.
- **Invariant:** каждый intent/effect MUST иметь policy.
- **CheckId:** `CHK-INTENT-POLICY-PRESENT`
- **DebtPolicy:** допускается временно (P1) с TTL.

### RISK-EFFECTS-REPLAY-001 (P0) — Эффект неэмулируем в replay
- **Scenario:** intent содержит платформенные структуры, которые нельзя мокать.
- **Signal:** scenario replay невозможно воспроизвести.
- **Invariant:** все эффекты MUST иметь mockable shape.
- **CheckId:** `CHK-REPLAY-HARNESS-COVERAGE`
- **DebtPolicy:** запрещено.

---

## 5) Contracts — время, эволюция, обратимость

### RISK-CONTRACTS-BREAK-001 (P0) — Breaking change без сигнала в CI
- **Scenario:** меняется публичный контракт, но CI зелёный.
- **Signal:** ломаются плагины/интеграции/данные.
- **Invariant:** изменения публичных контрактов MUST триггерить сигнал.
- **CheckId:** `CHK-CONTRACT-DIFF`
- **DebtPolicy:** запрещено.

### RISK-CONTRACTS-APPEND-001 (P0) — Domain events не append-only
- **Scenario:** меняются/удаляются event варианты задним числом.
- **Signal:** история/реплей ломаются.
- **Invariant:** DomainEvents MUST быть append-only.
- **CheckId:** `CHK-EVENTS-APPEND-ONLY`
- **DebtPolicy:** запрещено.

### RISK-CONTRACTS-DATA-001 (P0) — On-disk схемы без version+migration
- **Scenario:** формат проекта меняется, старые проекты не открываются.
- **Signal:** баги “у пользователей”.
- **Invariant:** on-disk схемы MUST иметь `schemaVersion` + migration policy.
- **CheckId:** `CHK-ONDISK-VERSIONING`
- **DebtPolicy:** запрещено.

### RISK-CONTRACTS-VERSION-001 (P1) — Нет deprecation policy на public surface
- **Scenario:** IPC/manifest/contracts меняются хаотично.
- **Signal:** интеграции ломаются, “APIs may change” навсегда.
- **Invariant:** public surface SHOULD иметь version + deprecation fields.
- **CheckId:** `CHK-PUBLIC-VERSIONING`
- **DebtPolicy:** допускается временно (P1) с TTL.

---

## 6) Text Snapshot — истина, версия, конфликт

### RISK-SNAPSHOT-VER-001 (P0) — Snapshot без версии
- **Scenario:** Core применяет операции к устаревшему тексту.
- **Signal:** “пропавшие правки”, трудно воспроизвести.
- **Invariant:** TextSnapshot MUST иметь `docId` + `textVersion` (+ опционально `stateVersion`).
- **CheckId:** `CHK-SNAPSHOT-SHAPE`
- **DebtPolicy:** запрещено.

### RISK-SNAPSHOT-CONFLICT-001 (P0) — Конфликт версий замалчивается
- **Scenario:** при mismatch Core “best effort” продолжает.
- **Signal:** скрытая порча данных.
- **Invariant:** конфликт snapshot/version MUST возвращать структурированную ошибку `ERR_SNAPSHOT_CONFLICT`.
- **CheckId:** `CHK-SNAPSHOT-CONFLICT-TEST`
- **DebtPolicy:** запрещено.

### RISK-SNAPSHOT-UILEAK-001 (P1) — Snapshot тащит UI-состояние
- **Scenario:** selection/decoration попадают в snapshot и ломают headless.
- **Signal:** contracts начинают включать UI поля.
- **Invariant:** snapshot SHOULD отражать только доменную текстовую сущность.
- **CheckId:** `CHK-SNAPSHOT-NO-UI-FIELDS`
- **DebtPolicy:** допускается (P1) с TTL, но требует ADR.

---

## 7) Platform & Adapters — деградация вместо аварии

### RISK-PLATFORM-POLICY-001 (P0) — Adapter содержит бизнес-решения
- **Scenario:** адаптер решает “что делать”, а не “как сделать”.
- **Signal:** расхождение поведения между платформами.
- **Invariant:** Adapter MUST NOT содержать domain policy.
- **CheckId:** `CHK-ADAPTERS-NO-DOMAIN-TYPES`
- **DebtPolicy:** запрещено.

### RISK-PLATFORM-DEGRADE-001 (P1) — Нет таблицы деградации (fail policy)
- **Scenario:** любой сбой порта валит приложение.
- **Signal:** падения вместо деградации.
- **Invariant:** каждый порт SHOULD иметь fail policy: hard-fail / degrade / best-effort.
- **CheckId:** `CHK-PORT-FAIL-POLICIES`
- **DebtPolicy:** допускается (P1) с TTL.

### RISK-PLATFORM-FS-001 (P0) — Atomic write semantics не специфицированы
- **Scenario:** Windows locks/rename ломают сохранение.
- **Signal:** corruption.
- **Invariant:** StorageBackendPolicy MUST декларировать гарантии.
- **CheckId:** `CHK-STORAGE-POLICY-PRESENT`
- **DebtPolicy:** запрещено.

---

## 8) Backpressure & Queues — пределы и последствия

### RISK-QUEUE-UNBOUNDED-001 (P0) — Неограниченные очереди
- **Scenario:** event/autosave/watchers растут без лимита.
- **Signal:** рост памяти, лаги.
- **Invariant:** каждая очередь MUST иметь `maxSize` + overflow policy.
- **CheckId:** `CHK-QUEUE-POLICIES`
- **DebtPolicy:** запрещено.

### RISK-QUEUE-NO-OBS-001 (P2) — Нет наблюдаемости очередей
- **Scenario:** “тормозит”, но непонятно почему.
- **Signal:** нет метрик.
- **Invariant:** очереди SHOULD быть наблюдаемыми (минимум diagnostics).
- **CheckId:** `CHK-OBSERVABILITY-MINIMUM`
- **DebtPolicy:** допускается (P2).

---

## 9) OPS — строгость и экономика

### RISK-OPS-TRUST-001 (P0) — Правила “на доверии” без механического контроля
- **Scenario:** allowlist/denylist декларированы, но не проверяются.
- **Signal:** случайные изменения вне scope.
- **Invariant:** allowlist/denylist MUST проверяться автоматически по diff.
- **CheckId:** `CHK-ALLOWLIST-DIFF`
- **DebtPolicy:** запрещено.

### RISK-OPS-DEBT-001 (P0) — Исключения без TTL/owner
- **Scenario:** “временно” стало каноном.
- **Signal:** растёт число исключений.
- **Invariant:** любое исключение MUST иметь TTL + owner + exitCriteria.
- **CheckId:** `CHK-DEBT-TTL`
- **DebtPolicy:** запрещено.

---

## 10) UI — протечки власти и источники истины

### RISK-UI-DOMAINIF-001 (P0) — Доменные if-правила в UI
- **Scenario:** UI решает доменные правила (валидность, autosave, routing).
- **Signal:** решения невозможно воспроизвести без UI.
- **Invariant:** UI MUST NOT содержать доменные if-правила; только отображение + вызов команд.
- **CheckId:** `CHK-UI-NO-DOMAIN-BRANCHES`
- **DebtPolicy:** запрещено.

### RISK-UI-IO-001 (P0) — UI делает IO напрямую
- **Scenario:** UI импортирует FS/IPC/платформу.
- **Signal:** обход команд/undo/логики.
- **Invariant:** UI MUST NOT делать IO напрямую.
- **CheckId:** `CHK-LAYER-IMPORT-BOUNDARY`
- **DebtPolicy:** запрещено.

---

## 11) Мультиплатформа — capability-driven деградация

### RISK-MULTI-CAP-001 (P1) — Feature flags через “if (isWeb)” вместо capabilities
- **Scenario:** платформенные ветки расползаются, ломая переносимость.
- **Signal:** много `isWeb/isMac` в UI/runtime.
- **Invariant:** platform differences SHOULD выражаться через capability matrix, не через ad-hoc ветвления.
- **CheckId:** `CHK-CAPABILITIES-MATRIX`
- **DebtPolicy:** допускается (P1) с TTL.

---

## 12) Debt Registry (исключения и долги)

### Формат debt записи (MUST)
- `debtId`
- `title`
- `owner`
- `createdAt`
- `ttlUntil`
- `scope` (paths/modules)
- `reason`
- `exitCriteria`
- `links` (PR/ADR)

**Правило:** просроченный TTL = FAIL CI.

---

## 13) Definition of Breaking Change (канон для contracts)

**Breaking change (MUST сигнал в CI):**
- удаление поля/варианта union
- изменение смысла поля (semantic change)
- изменение типа поля без back-compat
- изменение поведения policy по умолчанию
- изменение wire-format (IPC, manifests, on-disk)

**Non-breaking change (MAY):**
- добавление optional поля с понятным дефолтом
- добавление нового варианта union (если consumer tolerant)
- расширение diagnostics без изменения кодов

---

## 14) CHECK Catalog (канонический список CHECK-ов)

> Все CHECK-и должны быть node-only, без `rg`. Допустим `grep` только если есть fallback через `node -e`.

### P0 CHECKS (hard-stop)
- `CHK-LAYER-IMPORT-BOUNDARY`
- `CHK-CORE-FORBIDDEN-GLOBALS`
- `CHK-CMD-QUEUE-ORDERINGKEY`
- `CHK-EVENTS-FACTS-ONLY`
- `CHK-EVENTS-APPEND-ONLY`
- `CHK-EFFECTS-IDEMPOTENCY`
- `CHK-SNAPSHOT-SHAPE`
- `CHK-SNAPSHOT-CONFLICT-TEST`
- `CHK-CONTRACT-DIFF`
- `CHK-ONDISK-VERSIONING`
- `CHK-QUEUE-POLICIES`
- `CHK-ALLOWLIST-DIFF`
- `CHK-DEBT-TTL`
- `CHK-UI-NO-DOMAIN-BRANCHES`

### P1 CHECKS
- `CHK-PUBLIC-VERSIONING`
- `CHK-PORT-FAIL-POLICIES`
- `CHK-SNAPSHOT-NO-UI-FIELDS`
- `CHK-CAPABILITIES-MATRIX`
- `CHK-CORE-IMMUTABILITY`
- `CHK-INTENT-POLICY-PRESENT`
- `CHK-REPLAY-HARNESS-COVERAGE`

### P2 CHECKS
- `CHK-OBSERVABILITY-MINIMUM`

---

## 15) CHECK Templates (описание, не реализация)

### CHK-LAYER-IMPORT-BOUNDARY (P0)
- **Goal:** запрет импортов core/contracts → platform/ui/electron.
- **PASS:** не найдено запрещённых импортов.
- **Implementation:** `scripts/check-layer-imports.mjs` (AST/import graph).
- **Output:** список нарушений: file → forbiddenImport → ruleId.

### CHK-CORE-FORBIDDEN-GLOBALS (P0)
- **Goal:** запрет `Date.now`, `new Date`, `Math.random`, `process.env`, `process.platform`, `setTimeout` в core.
- **PASS:** нет совпадений в `src/core/**`.
- **Implementation:** AST scan + denylist symbols (не regex-only).
- **Output:** file:line:symbol.

### CHK-CMD-QUEUE-ORDERINGKEY (P0)
- **Goal:** команды в пределах одного `orderingKey` выполняются последовательно.
- **PASS:** тест подтверждает строгий порядок.
- **Implementation:** unit test + harness.
- **Output:** trace of execution order.

### CHK-EVENTS-FACTS-ONLY (P0)
- **Goal:** события не содержат “do/execute/command-like” семантики.
- **PASS:** schema/тип проверка.
- **Implementation:** lint on event names/fields + ADR exceptions via debtId.
- **Output:** offending event variant + field.

### CHK-EVENTS-APPEND-ONLY (P0)
- **Goal:** события не редактируются/не удаляются задним числом.
- **PASS:** сравнение с baseline snapshot (храним в `contracts-baseline/`).
- **Implementation:** contract-diff tool.
- **Output:** removed/changed event variants.

### CHK-EFFECTS-IDEMPOTENCY (P0)
- **Goal:** non-idempotent эффекты обязаны иметь idempotencyKey.
- **PASS:** все intents данного класса содержат ключ.
- **Implementation:** schema/тип + unit tests.

### CHK-SNAPSHOT-SHAPE (P0)
- **Goal:** TextSnapshot имеет docId + textVersion (+ stateVersion если нужно).
- **PASS:** тип/схема соответствует, без UI полей.
- **Implementation:** JSON schema + unit tests.

### CHK-SNAPSHOT-CONFLICT-TEST (P0)
- **Goal:** конфликт snapshot/version возвращает `ERR_SNAPSHOT_CONFLICT`.
- **PASS:** тест обязателен и падает при любом “best effort”.
- **Implementation:** scenario test.

### CHK-CONTRACT-DIFF (P0)
- **Goal:** изменения контрактов вызывают сигнал, breaking требует ADR.
- **PASS:** если breaking — присутствует ADR + version bump; если non-breaking — ok.
- **Implementation:** сравнение baseline типов/схем.

### CHK-ONDISK-VERSIONING (P0)
- **Goal:** on-disk данные имеют schemaVersion и описан migration.
- **PASS:** schemaVersion обязателен + есть `migrations/`.
- **Implementation:** doctor checks.

### CHK-QUEUE-POLICIES (P0)
- **Goal:** каждая очередь имеет лимит и overflow policy.
- **PASS:** `QueuePolicies` заполнен.
- **Implementation:** doctor reads `docs/OPS/QUEUE_POLICIES.json`.

### CHK-ALLOWLIST-DIFF (P0)
- **Goal:** изменения файлов соответствуют allowlist/denylist task-а.
- **PASS:** `git diff --name-only` ⊆ allowlist и ∩ denylist = ∅.
- **Implementation:** script reads task header, checks diff.

### CHK-DEBT-TTL (P0)
- **Goal:** любой debt имеет TTL/owner и не просрочен.
- **PASS:** все записи валидны, TTL не истёк.
- **Implementation:** doctor reads `docs/OPS/DEBT_REGISTRY.json`.

### CHK-UI-NO-DOMAIN-BRANCHES (P0)
- **Goal:** запрет доменных if-правил в UI (policy/решения).
- **PASS:** lint/AST не находит запрещённых паттернов.
- **Implementation:** ESLint rule + allowlist исключений через debtId.

---

## 16) Canonical files (куда положить)

- `docs/OPS/AUDIT-MATRIX-v1.1.md`  ← этот документ
- `docs/OPS/DEBT_REGISTRY.json`     ← долги/исключения
- `docs/OPS/QUEUE_POLICIES.json`    ← лимиты очередей
- `docs/OPS/CAPABILITIES_MATRIX.json` ← платформенные capabilities
- `scripts/doctor.mjs`             ← валидирует все выше
- `scripts/check-layer-imports.mjs`
- `scripts/check-contract-diff.mjs`
- `scripts/check-debt-ttl.mjs`
- `scripts/check-allowlist-diff.mjs`

---

## 17) STOP / FAIL Protocol (единый)

При FAIL любого P0:
- STOP немедленно.
- В отчёте:
  - `FAIL_REASON` (что сломано)
  - `EVIDENCE` (вывод CHECK)
  - `REQUIRED_INPUT` (если нужно)
  - `NEXT_ACTION` (минимальный фикс)

При FAIL P1:
- STOP, если нет debtId.
- Если debtId есть — PASS с warning и записью в debt ledger.

При FAIL P2:
- PASS с warning, но MUST записать метрику/сигнал.

---

## 18) Exit Markers (когда матрица “работает”)

Матрица считается внедрённой, если:
- `doctor` читает и валидирует registry/policies/debts
- P0 CHECKS покрывают core purity + determinism + boundaries
- есть хотя бы 1 scenario replay test, который гарантированно падает при недетерминизме
- исключения невозможно “протащить молча” (TTL+owner обязательны)

---

## 19) Приложение: минимальные “must-exist” таблицы

### QUEUE_POLICIES.json (минимальная форма)
Каждая запись:
- `queueId`
- `maxSize`
- `overflow` = `drop_oldest | drop_newest | hard_fail | degrade`
- `orderingKey` (если применимо)
- `owner`

### CAPABILITIES_MATRIX.json (минимальная форма)
- `platformId`
- `capabilities`: `{ fs: true/false, watchers: ..., network: ... }`
- `disabledCommands`: `[commandId]`
- `degradedFeatures`: `[featureId]`

### DEBT_REGISTRY.json (минимальная форма)
- `debtId`, `owner`, `ttlUntil`, `exitCriteria`, `scope`

---

**Конец документа.**
