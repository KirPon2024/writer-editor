# CONTOUR-C — Runtime Execution & Causality (CANON / OPS)

**Статус:** CANON / TRANSITIONAL  
**Версия:** v1.0  
**Тип документа:** Guardrail Spec (не SOP, не roadmap)

---

## 1) Назначение и Scope

### 1.1 Scope (жёстко зафиксирован)

**CONTOUR-C = Runtime Execution Layer**

Входит:
- жизненный цикл выполнения: `enqueue → execute → result`
- причинно-следственный порядок (ordering / causality)
- backpressure, retry, overflow semantics
- выполнение эффектов и их попытки
- runtime state (временное состояние исполнения)

Не входит:
- структура данных и типы (CONTOUR-B)
- публичные контракты и схемы (CONTOUR-B)
- UI-логика и поведение

**Правило:** любое расширение scope требует ADR + bump версии документа.

### 1.2 Определение runtime state

Runtime state — это временное состояние исполнения (очереди, in-flight попытки, результаты попыток, деградации, backpressure),
которое:
- не является domain state,
- не считается частью public contracts,
- не является источником истины для Core.

---

## 2) Граница ответственности (B ↔ C)

### 2.1 Non-Overlap Contract

- **CONTOUR-B отвечает за:**  
  *что существует* и *какой формы* (schemas, contracts, inventories).
- **CONTOUR-C отвечает за:**  
  *как и когда исполняется* (порядок, попытки, сбои, деградации).

**Разрешённое пересечение:**  
CONTOUR-C может определять **ops-инвентари и trace-shapes**, если:
- они не являются public contracts,
- не используются как входы Core,
- существуют исключительно для исполнения и диагностики.

---

## 3) Core ↔ Runtime Boundary

### RUNTIME-BOUNDARY-001 (P0)

- Core формирует **решение** (command, intent).
- Runtime исполняет решение и возвращает **результат как факт**.

**Запрещено:**
- доменные if-правила в runtime (бизнес-валидация, выбор доменной политики)
- платформенные предположения в Core

**Разрешено:**
- runtime if-правила, основанные на runtime signals и runtime state (очереди, backpressure, retries, overflow).
- Core принимает результат выполнения как входной факт,
  без предположений о платформе и механизме исполнения.

---

## 4) Runtime Signals (ops-only)

### 4.1 Типы runtime-записей

Runtime использует **два типа trace-записей**:

#### CommandTrace (обязательные поля)
- `executionId`
- `orderingKey`
- `logicalTimestamp`

#### EffectTrace (обязательные поля)
- `executionId`
- `effectId`
- `attempt`
- `logicalTimestamp`

**Правило:**  
Command без эффектов обязан иметь CommandTrace.  
EffectTrace существует только если эффект был инициирован.

### 4.2 logicalTimestamp

- не wall-clock
- монотонен **в пределах одного orderingKey**
- не сравнивается глобально между разными orderingKey

---

## 5) Enforcement Matrix и Severity

### 5.1 Initial Enforcement Mode (на инвариант)

| Mode | Семантика |
|-----|-----------|
| off | инвариант задекларирован, проверка не исполняется |
| soft | нарушение = WARN; требование debt зависит от правил ниже |
| hard | нарушение = FAIL |

Каждый инвариант **обязан** иметь initial mode.

### 5.2 Связь с Severity

- Severity (P0/P1/P2) определяет **важность**
- Enforcement Mode определяет **реакцию**

### 5.3 Статусы проверки (для механического checker-а)

Каждая проверка инварианта должна завершаться одним статусом:
- `OK` — нарушений нет, либо effective mode = `off`.
- `WARN` — нарушение есть, и оно допускается в TRANSITIONAL только при наличии matching active debt.
- `WARN_MISSING_DEBT` — нарушение есть, но matching active debt отсутствует.
- `FAIL` — нарушение есть в `hard`, либо конфигурация enforcement некорректна.

**Правило:** `WARN_MISSING_DEBT` блокирует принятие нарушения как допустимого и блокирует Exit Criteria (см. §9).

### 5.4 Effective enforcement (TRANSITIONAL / STRICT)

**TRANSITIONAL:**
- effective mode = initial mode.
- `hard` → нарушение = `FAIL`.
- `soft` → нарушение = `WARN` при наличии matching active debt, иначе `WARN_MISSING_DEBT`.
- `off` → `OK`.

**STRICT:**
- для P0: effective mode = `hard` всегда.
  - initial mode = `off` для P0 запрещён и трактуется как `FAIL` конфигурации.
- для P1/P2: effective mode = initial mode (если не задано иное отдельной ADR).

### 5.5 Matching active debt (норма)

Debt считается matching и active, если запись в `docs/OPS/DEBT_REGISTRY.json`:
- имеет неистёкший `ttlUntil` (UTC day compare),
- и поле `scope` включает:
  - либо идентификатор инварианта (например, `RUNTIME-ORDER-001`),
  - либо путь к артефакту, который валидирует проверка (например, `docs/OPS/RUNTIME_SIGNALS.json`).

---

## 6) Runtime Invariants (минимум)

### RUNTIME-ORDER-001 (P0, soft)
Команды с одинаковым `orderingKey` выполняются строго последовательно.

### RUNTIME-EFFECT-001 (P0, soft)
Каждый эффект обязан иметь:
- `effectId`
- `attempt`
- терминальное состояние (`success | failure | abandoned`)

### RUNTIME-BACKPRESSURE-001 (P1, soft)
Каждая runtime-очередь обязана декларировать:
- `maxSize`
- `overflow policy`
- `owner`

---

## 7) Signals Presence (bootstrap)

### RUNTIME-SIGNALS-001 (P0, soft)

**Invariant:**  
Runtime обязан производить CommandTrace и EffectTrace
с обязательными полями (см. §4).

**Назначение:**  
разрешает catch-22: отсутствие сигналов выявляется этим инвариантом.

---

## 8) EXPLORATORY Submode (ограниченный)

EXPLORATORY допускается **только в TRANSITIONAL** и должен быть зафиксирован в `docs/OPS/CONTOUR-C-ENFORCEMENT.json`.

- enforcement = WARN-only для инвариантов (никаких hard-stop по нарушениям инвариантов)
- запись в `DEBT_REGISTRY` обязательна
- TTL обязателен
- максимальная длительность: **14 дней**

**Правило:**  
превышение TTL (истечение `ttlUntil`) = `FAIL` независимо от WARN-only режима.

---

## 9) Exit Criteria

CONTOUR-C считается завершённым, если:
- doctor покрывает ≥ 3 runtime P0 инварианта (initial mode != `off`).
- существует ≥ 1 execution-trace replay test, зафиксированный как ops-артефакт (см. §10.2).
- ни одно P0-нарушение не может быть принято без debt:
  - `WARN_MISSING_DEBT` для P0 считается блокирующим.
- зафиксирован `OPS-CONTOUR-C-EXIT.md`.

---

## 10) Обязательные артефакты (ops-only)

### 10.1 `docs/OPS/RUNTIME_SIGNALS.json` (MUST)

Минимальная форма:
- root object:
  - `schemaVersion: 1`
  - `traceTypes: array` (non-empty)
- каждый элемент `traceTypes`:
  - `traceType: "CommandTrace" | "EffectTrace"`
  - `requiredFields: string[]` (non-empty)
  - `optionalFields: string[]`

**Правило:** requiredFields для `CommandTrace` и `EffectTrace` должны соответствовать §4.1.

### 10.2 `docs/OPS/CONTOUR-C-ENFORCEMENT.json` (MUST)

Минимальная форма:
- root object:
  - `schemaVersion: 1`
  - `mode: "TRANSITIONAL" | "STRICT"`
  - `submode: "STANDARD" | "EXPLORATORY"` (optional; default `STANDARD`)
  - `submodeTtlUntil: string` (required if `submode="EXPLORATORY"`)
  - `invariants: array` (non-empty)
  - `replayTests: array` (required; may be empty until Exit)
- каждый элемент `invariants`:
  - `id: string` (non-empty)
  - `severity: "P0" | "P1" | "P2"`
  - `initialMode: "off" | "soft" | "hard"`

Минимальная форма `replayTests` (ops-only inventory):
- каждый элемент:
  - `id: string` (non-empty)
  - `purpose: string`
  - `artifactRef: string` (logical ref; не обязан быть путём)

### 10.3 `docs/OPERATIONS/OPS-CONTOUR-C-EXIT.md` (MUST)

Документ фиксирует закрытие CONTOUR-C декларативно, без SOP и без внедрения runtime логики.

### 10.4 Этот документ (MUST)

- `docs/OPS/CONTOUR-C-SCOPE.md`

---

## 11) Governance

- изменение scope, signals, enforcement → ADR
- STRICT для C включается отдельно
- обход инвариантов без debt запрещён

---

**Конец документа.**
