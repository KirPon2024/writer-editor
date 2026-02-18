# XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_v3.13a-final
## CANONICAL FINAL — LOSSLESS / DUAL-LAYER / PROCESS-LEAN / RUNTIME-SAFE / XPLAT-COLLAB-SECURE / AUTOMATION-NON-FRAGILE

STATUS: ACTIVE_CANON
MODE: PRODUCT_ARCHITECTURE + DELIVERY
PRINCIPLE: ONLY WHAT DRIVES IRREVERSIBLE PROGRESS
RULE: NO FALSE-GREEN / NO STALE-GREEN / NO PROCESS-DRIFT / NO PLATFORM-LOSS
MARKERS: SSOT-only / no runtime wiring / PASS criteria / BLOCKED criteria / sha256
TRANSITION_EXIT: CLOSED (stage_axis_lock, prompt_layer_single_source, command_surface_bus_only, failsignal_token_wiring, dev_fast_lane)

---

# PART I
# EXECUTION KERNEL

## PART A — GOVERNING LAYER (ПОЛИТИКА)

**Rule A-0 (DUAL-LAYER):** если правило не имеет machine-binding в PART B, оно автоматически `ADVISORY` и не может быть release/promotion blocking по умолчанию.

### A0) ТЕКУЩАЯ СТАДИЯ (CONTEXT, NON-BINDING)
- MVP: desktop-first, offline-first.
- XPLAT и COLLAB: архитектурная фиксация без раннего runtime wiring.
- Release-tier: строго 80/20 (минимальный blocking).
- GitHub/Codex automation: сохранена, но не сетево-хрупкая.

### A1) EXECUTION SEQUENCE (BINDING)
`CORE_SOT_EXECUTABLE`
→ `CAPABILITY_ENFORCEMENT`
→ `OPS_INTEGRITY_P0`
→ `XPLAT_ARCHITECTURE_CONTRACT`
→ `XPLAT_ADAPTERS`
→ `COLLAB_LOCAL_FIRST`
→ `DERIVED_PRODUCT_EXPANSION`
→ `PERFORMANCE_HARDENING`
→ `COLLAB_TRANSPORT`

Fail signal: `E_SEQUENCE_ORDER_DRIFT` (PR/Core advisory; Release/Promotion blocking via registry binding)

#### A1.1) OPS_INTEGRITY_P0 (DEFINITION, BINDING)
`OPS_INTEGRITY_P0 = { TOKEN_CATALOG_VALID_OK, FAILSIGNAL_REGISTRY_VALID_OK, PROOFHOOK_INTEGRITY_OK, CONFIG_HASH_LOCK_OK, REQUIRED_SET_NO_TARGET_OK, TOKEN_SOURCE_CONFLICT_OK }`

### A2) CORE VS ARCHITECTURE (BINDING, CONCEPT-COMPATIBLE)
**Фиксируемое ядро (Controlled Mutability):**
- schema
- operations semantics
- migrations
- recovery
- normalization
- roundtrip invariants

**Подвижная архитектура (Free Zone):**
- UI / меню / flows
- дизайн
- Markdown
- интеллект-карты (derived view)
- platform shells
- collab UX

Rule: UI не источник истины. Core меняется только по tiered DoD + machine-check.

### A3) TIERED CORE CHANGE DoD (BINDING)
**Tier A (Schema/Migration/Recovery/Normalization):**
- versioned migration
- N-1 compatibility
- roundtrip
- recovery
- negative corruption test

**Tier B (Core logic без смены формата):**
- targeted regression
- roundtrip affected path

**Tier C (UI/Architecture only):**
- запрещён core contract leak (UI-change не должен менять core invariants)

Fail: `E_CORE_CHANGE_DOD_MISSING` (PR/Core=ADVISORY, Release/Promotion=BLOCK)

### A4) EXECUTION PROFILE (BINDING)
Обязательные поля запуска:
- `profile: dev | pr | release`
- `gateTier: core | release`
- `scopeFlags`

Required-set только через:
- `node scripts/ops/generate-required-token-set.mjs --json`

Единственный источник допустимых scopeFlags:
- `docs/OPS/STATUS/SCOPEFLAGS_REGISTRY_v3_12.json`

Fail:
- `E_EXECUTION_PROFILE_INVALID` (BLOCK)
- `E_SCOPEFLAG_UNKNOWN` (BLOCK)
- `E_REQUIRED_TOKEN_SET_DRIFT` (BLOCK)

#### A4.1) PROMPT-LAYER POLICY (BINDING, NON-FRAGILE)
- `PROMPT_LAYER=RUNNER_UI` допускается **ровно один раз за запуск** и только в выводе `node scripts/ops/run-wave.mjs`.
- Скрипты bootstrap/assist не печатают `PROMPT_LAYER=RUNNER_UI`; допускаются только нейтральные bootstrap-токены без `PROMPT_LAYER`.
- Любой `PROMPT_LAYER=REPO` = нарушение.
- Любой повторный `PROMPT_LAYER=RUNNER_UI` вне `run-wave` = нарушение.

Fail: `E_PROMPT_LAYER_POLICY_INVALID`
Mode: PR/Core=ADVISORY, Release/Promotion=BLOCK
Registry: failSignal registered + contract-bound.

### A5) SINGLE-RUN WAVE + FRESHNESS (BINDING: ANTI PROCESS-TAX + ANTI STALE-GREEN)
- Heavy checks исполняются **1 раз** на wave.
- Повторное использование результата допустимо **только** при совпадении `WAVE_INPUT_HASH` и валидном TTL.
- Иначе обязателен re-run.

Fail: `E_WAVE_RESULT_STALE` (PR/Core=ADVISORY, Release/Promotion=BLOCK)

`WAVE_INPUT_HASH` обязан включать минимум:
- execution profile
- relevant SSOT (ALWAYS_ON + активные STAGE_GATED)
- relevant ops scripts/proofhooks
- config fingerprints / locks

### A6) 80/20 RELEASE BLOCKING (BINDING)
Release blocking = только 3 корзины (остальное advisory/conditional до ROI).

**A6.1 CORE DATA SAFETY (ALWAYS BLOCKING в release):**
- `CORE_SOT_EXECUTABLE_OK`
- `RECOVERY_IO_OK`
- `MIGRATIONS_POLICY_OK`
- `MIGRATIONS_ATOMICITY_OK`
- `NORMALIZATION_XPLAT_OK`
- `E2E_CRITICAL_USER_PATH_OK`

**A6.2 RELEASE INTEGRITY (ALWAYS BLOCKING в release):**
- `HEAD_STRICT_OK`
- `PROOFHOOK_INTEGRITY_OK`
- `CONFIG_HASH_LOCK_OK`
- `TOKEN_SOURCE_CONFLICT_OK`
- `REQUIRED_SET_NO_TARGET_OK`

**A6.3 VERIFY MINIMUM (ALWAYS BLOCKING в release):**
- `SINGLE_VERIFY_CONTOUR_ENFORCED_OK`
- `VERIFY_ATTESTATION_OK`
- `ATTESTATION_SIGNATURE_OK`

Offline-verifiable rule (binding):
- verify/signature должны быть оффлайн-верифицируемы; chain-of-trust локально доступна через SSOT/lock.
- сеть не является required зависимостью для release-blocking verify/signature.

### A7) BLOCKING TOKEN LAW (BINDING, ANTI FALSE-GREEN)
Blocking токен валиден только если одновременно:
- behavioral proof (сценарий/харнесс/реальная проверка, а не “только JSON-schema”)
- negative contract test
- однозначный failSignal
- sourceBinding

Fail: `E_BLOCKING_TOKEN_UNBOUND` (PR/Core=ADVISORY, Release/Promotion=BLOCK)

### A8) INFRA VS RUNTIME WIRING (BINDING)
**Runtime wiring** = всё, что достижимо из production entrypoints:
- main bootstrap
- packaged entry
- production CLI
- auto-loaded modules/plugins

До разрешённой стадии runtime wiring запрещён.

Fail: `E_RUNTIME_WIRING_BEFORE_STAGE` (PR/Core=ADVISORY, Release/Promotion=BLOCK)

### A9) HARD VS SOFT PARITY (BINDING)
**HARD parity (promotion-critical):**
- schema
- operations semantics
- migrations
- recovery
- normalization
- roundtrip
- export/import semantics

**SOFT parity (non-blocking):**
- UI
- hotkeys
- layout
- platform UX

Rule: HARD обязателен для promotion; SOFT не блокирует release.

### A10) STAGE ACTIVE RULE (BINDING, LEAN)
Стадия активна только если одновременно:
1) `docs/OPS/STATUS/XPLAT_ROLLOUT_PLAN_v3_12.json` содержит `activeStageId = Xn`
2) соответствующий scopeFlag включён (если стадия требует scopeFlag)
3) для promotion допускается временный `promotionMode`, фиксируемый в promotion record

Иначе STAGE_GATED артефакты не становятся blocking.

Fail: `E_STAGE_PROMOTION_INVALID` (PR/Core=ADVISORY, Release=BLOCK, Promotion=BLOCK)

### A11) XPLAT STAGES + LEAN METRICS (BINDING)
**X0 (CONTRACT ONLY):** только SSOT + proof + tests (никакого runtime wiring).
**X1 (DESKTOP win/linux):** infra + parity; метрики минимум:
- `parityPassRatePct`
- `flakyRatePct`
- `maxDocSizeMb`

**X2 (WEB):** storage profile + parity subset; добавить:
- `openP95Ms`
- `saveP95Ms`
- `reopenP95Ms`
- `exportP95Ms`

**X3 (MOBILE android/ios):** sandbox + background constraints + critical subset; минимум:
- `parityPassRatePct`
- `flakyRatePct`
- `maxDocSizeMb`
- `resumeRecoverySmokePass`

**X4 (TRANSPORT):** network canon + security + replay protection + conflict strategy; минимум:
- `contractPassRatePct`
- `flakyRatePct`
- `replayProtectionPass`

Promotion без evidence:
- `E_STAGE_METRICS_MISSING` (PR/Core=ADVISORY, Release=ADVISORY, Promotion=BLOCK)
- `E_STAGE_PROMOTION_INVALID` (PR/Core=ADVISORY, Release=BLOCK, Promotion=BLOCK)

До X4:
- `transportMode=network` запрещён → `E_COLLAB_TRANSPORT_FORBIDDEN_IN_MVP` (BLOCK in Release/Promotion)

### A12) PLATFORM DoD (BINDING)
Для каждой платформы (по stage/scope):
- open/save/reopen
- export/import
- recovery
- filesystem behavior (case/reserved names/separators where relevant)
- large-doc handling

`comments/history local` обязательны только при `COLLAB_SCOPE_LOCAL=1`.

### A13) CONCURRENCY UNIT (BINDING)
Atomic concurrency unit = `Scene`.

Bridge допускается временно при document-level модели только если:
- не нарушается replay determinism
- есть явный sunset-план (в SSOT)

### A14) COLLAB LOCAL-FIRST CONTRACT (BINDING)
Local-first до X4:
- append-only event log
- versioned schema
- deterministic replay
- idempotent apply
- comments: `anchor + author + timestamp + threadId + resolved`
- history: operation timeline
- snapshot/compaction safe (не ломает determinism)
- до X4: `transportMode = disabled | local_only`

Network до X4 запрещён:
- `E_COLLAB_TRANSPORT_FORBIDDEN_IN_MVP` (PR/Core=ADVISORY, Release/Promotion=BLOCK)

### A15) GITHUB / CODEX AUTOMATION (BINDING, NON-FRAGILE)
- Merge только через PR path.
- Hard-block:
  - `E_DIRECT_PROTECTED_BRANCH_PUSH`
  - `E_MERGE_BYPASS_ATTEMPT`
- При `E_REMOTE_UNAVAILABLE`:
  - automation checks advisory
  - auto-merge запрещён
  - release не блокируется только из-за network degradation

### A16) FAILSIGNAL MODE MATRIX (BINDING)
| Тип | PR/Core | Release | Promotion |
|---|---|---|---|
| Data corruption | BLOCK | BLOCK | BLOCK |
| Merge bypass/direct push | BLOCK | BLOCK | BLOCK |
| Proofhook tamper | BLOCK | BLOCK | BLOCK |
| Execution profile invalid | BLOCK | BLOCK | BLOCK |
| Required drift/target-in-required | BLOCK | BLOCK | BLOCK |
| Prompt-layer policy invalid | ADVISORY | BLOCK | BLOCK |
| Sequence order drift (machine-bound) | ADVISORY | BLOCK | BLOCK |
| Runtime wiring before stage | ADVISORY | BLOCK | BLOCK |
| Stage metrics missing | ADVISORY | ADVISORY | BLOCK |
| Execution item unowned | ADVISORY | ADVISORY | BLOCK |
| Remote unavailable | ADVISORY | ADVISORY | ADVISORY |
| Network degrade | ADVISORY | ADVISORY | ADVISORY |

### A17) PASS / BLOCK (BINDING)
PASS если:
- все 80/20 release-blocking tokens PASS
- `DRIFT_UNRESOLVED_P0_COUNT=0`
- conditional gates корректны (если активированы)

BLOCK если:
- любой активный blocking failSignal по режимной матрице

---

## PART B — EXECUTION ANNEX (MACHINE-BINDING)

**Rule B-0:** только machine-bound элементы могут быть blocking (в соответствии с mode matrix).

### B0) SSOT CLASSES
- `ALWAYS_ON` — обязателен всегда
- `STAGE_GATED` — обязателен только при активной стадии/scope
- `ADVISORY` — не блокирует обычные PR; может блокировать promotion по матрице

### B1) ALWAYS_ON (SSOT ANCHORS)
- `docs/OPS/TOKENS/TOKEN_CATALOG.json`
- `docs/OPS/TOKENS/TOKEN_DECLARATION.json`
- `docs/OPS/CLAIMS/CRITICAL_CLAIM_MATRIX.json`
- `docs/OPS/FAILSIGNALS/FAILSIGNAL_REGISTRY.json`
- `docs/OPS/STATUS/SCOPEFLAGS_REGISTRY_v3_12.json`
- `docs/OPERATIONS/STATUS/CODEX_AUTOMATION_POLICY.json`
- `docs/OPS/LOCKS/CONFIG_HASH_LOCK.json`
- `docs/OPS/PROOFHOOKS/PROOFHOOK_INTEGRITY_LOCK.json`
- `docs/OPS/EXECUTION/EXECUTION_PROFILE.schema.json`
- `docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json`

### B2) STAGE_GATED
- `docs/OPS/STATUS/XPLAT_ROLLOUT_PLAN_v3_12.json`
- `docs/OPS/STATUS/XPLAT_STAGE_METRICS_v3_12.json`
- `docs/OPS/STATUS/XPLAT_PARITY_BASELINE_v3_12.json`
- `docs/OPS/STATUS/STAGE_PROMOTION_RECORD_v3_12.json`
- `docs/OPS/STATUS/THIRD_PARTY_NOTICES_READINESS.json`

Rule: неактивная стадия не может требовать свои STAGE_GATED SSOT как blocking.

### B3) ADVISORY
- `docs/OPS/STATUS/EXECUTION_ROADMAP_BOARD_v3_12.json`

Rule: `E_EXECUTION_ITEM_UNOWNED` блокирует только promotion (не обычные PR).

### B4) MACHINE-BINDING LAW (FOR RELEASE-BLOCKING TOKENS)
Каждый release-blocking token обязан иметь:
- proofHook
- positive + negative contract tests
- failSignal
- sourceBinding
- closure sha256
- fixturesHash (если применимо)

Иначе: `E_BLOCKING_TOKEN_UNBOUND` (mode: PR/Core=ADVISORY, Release/Promotion=BLOCK)

### B5) REQUIRED-SET SAFETY (ALWAYS-ON)
- `REQUIRED_SET_NO_TARGET_OK` обязателен.
- target не может быть release-required.
- bridge допускается только для target (и не делает его required).

### B6) WAVE INPUT HASH (ALWAYS-ON)
`WAVE_INPUT_HASH` включает:
- execution profile
- relevant SSOT (ALWAYS_ON + active STAGE_GATED)
- ops scripts/proofhooks
- config fingerprints
TTL обязателен.

### B7) STAGE ACTIVATION BINDING (STAGE-GATED, BUT PROMOTION-CRITICAL)
Источник истины:
- `XPLAT_ROLLOUT_PLAN_v3_12.json` + `SCOPEFLAGS_REGISTRY_v3_12.json`
Promotion-mode фиксируется отдельным promotion record (SSOT/lock-defined).
Иначе: `E_STAGE_PROMOTION_INVALID` (Promotion=BLOCK)

---

## PART C — IMPLEMENTATION PROGRAM (LEAN)

### P0 (CLOSED FOR ACTIVE_CANON)
1. Stage-axis lock (`X0..X4`) зафиксирован и проверяется контрактно.
2. Prompt-layer single-source (`RUNNER_UI` только в `run-wave`) закрыт и проверяется контрактно.
3. Command surface unification (bus-only, bypass-negative pack) закрыта и проверяется контрактно.
4. FailSignal registration + token wiring для P0 drift-сигналов закрыты.
5. `DEV_FAST_LANE` реализован как исполняемый path без auto-upgrade в heavy lane.
6. Governance/strict контуры подтверждают закрытие без раздувания release required-set.

### P1
1. Активировать `XPLAT_PROFILE_BINDINGS` при первом реальном scope-driven required.
2. Execution board остаётся advisory.
3. Promotion pipeline strict (metrics + activation + mode-matrix).

### P2
1. Performance hardening.
2. Transactional migration strengthening.
3. Extended parity packs.
4. Transport rollout (X4) после network canon update + security model.

---

## FINAL AGREEMENT
Этот документ:
- не противоречит концепции “фиксируемое ядро + подвижная архитектура”;
- не теряет web/win/linux/android/ios (через anchors: decisions + capability + parity + staged rollout);
- не теряет collab/comments/history (local-first contract + scene unit + запрет сети до X4);
- не раздувает release-tier (80/20);
- не ломает автоматизацию (hard-block только bypass/direct-push; остальное advisory при сети);
- не создаёт process-tax (single-run wave + freshness; stage-gated SSOT);
- не допускает false-green и stale-green.

END PART I.
## END PART I — EXECUTION KERNEL (LAW, PAYLOAD-LOCKED)

---

## BEGIN PART II — PRODUCT CONSTITUTION (MAP, PAYLOAD-LOCKED)
# UNIFIED MASTER SPEC v1.2 (FULL, AUDITED FINAL)

`researchOnly: true`
`implementationBinding: false`
`canonClass: ADVISORY_NORTH_STAR`
`canonDeltaRequired: true`
`repoChanges: none`
`fullContextRule: preserve_all_sections`
`normativeTagging: required`
`falseGreenGuard: required`

Этот документ — полный синтез обсуждений: архитектура, UX, меню, режимы, плагины, качество, безопасность, платформы, roadmap.
Он не заменяет канон `XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_v3.12`, а живёт рядом как `North Star + execution map`.

---

## 0) Режим документа и правило полноты контекста
### 0.1 Full Context Rule
1. Этот документ не сокращается и не “обедняется” ради упрощения процесса.
2. Любые изменения делаются через уточнение статусов, критериев, тестируемости и этапности.
3. Содержание разделов сохраняется как полный контекст.

### 0.2 Authority Rule
1. Этот документ `ADVISORY_NORTH_STAR`.
2. Обязательность исполнения задаётся каноном `v3.12` и его machine-check контурами.
3. Маркер `BINDING NOW` в этом документе означает: “связано с уже обязательным каноном”, а не “этот файл сам стал каноном”.

### 0.3 Эволюция ядра без противоречия
1. Ядро фиксируемо по инвариантам.
2. Ядро изменяемо только через versioned migrations + compatibility + recovery proof.
3. L2/L3 (архитектурный shell, дизайн, меню, UX) подвижны и могут меняться быстро.

### 0.4 Irreversible Progress Rule
1. Строгий governance применяется в первую очередь к L1/L2 и изменениям класса риска `R1/R2`.
2. L3 UI/UX итерации идут в ускоренном контуре.
3. Процесс не должен блокировать полезные изменения, повышающие reliability/writing speed/export quality.

---

## 1) Продукт: что именно строим
**Писательская offline-first система**, где:
1. Данные максимально защищены от потерь.
2. Базовый режим — минималистичный и тихий.
3. Продвинутый режим — глубоко настраиваемый.
4. Пользователь может собирать интерфейс и рабочий процесс под себя.
5. Сеть, коллаб и облачный AI не ломают локальную модель и подключаются поэтапно.

## 2) Канон-связка (v3.12) без конфликтов
| Область | Статус в этом документе | Привязка к канону |
|---|---|---|
| Offline-first, desktop-first | BINDING NOW (via canon) | A0 |
| Data-core (schema/ops/migrations/recovery) | BINDING NOW (via canon) | A2, A3, A6.1 |
| Scene как atomic concurrency unit | BINDING NOW (via canon) | A13 |
| Local-first collab contract до X4 | BINDING NOW (via canon) | A14 |
| Network transport только после X4 | BINDING NOW (via canon) | A11, A14 |
| Write/Plan/Review как product-shell | STAGE-GATED | A2 |
| Полная кастомизация UI/меню | STAGE-GATED | A6, A8 |
| Plugin ecosystem | STAGE-GATED | A8, A10 |
| Cloud AI | LATE STAGE ONLY | A0, A11, A14 |

## 3) Архитектурная иерархия (anti-chaos)
```text
L0 Governance
L1 Data-core
L2 Product-shell
L3 UX-constructor
L4 Platform adapters
L5 Expansion (plugins/collab/AI)
```

|**Уровень**|**Что внутри**|**Что нельзя**|
|---|---|---|
|L0|SSOT, policy, fail-signals, stage activation|Смешивать advisory и blocking|
|L1|Формат, операции, миграции, recovery|UI-логика в core|
|L2|Режимы, команды, policy, поиск, экспорт|Нарушать core-invariants|
|L3|Меню/панели/темы/профили|Влиять на формат данных|
|L4|mac/win/linux/web/mobile adapters|Форкать доменную логику|
|L5|Плагины, transport, AI|Ранний runtime auto-load и cloud-first|

### 3.1 Разрешённый коридор изменений

Архитектура shell-уровня подвижна.

Дизайн и структура меню подвижны.

Экспорт в текстовые форматы расширяем.

Markdown, mindmap, review/history, cross-platform адаптация поддерживаются стадийно.

Изменения L1 проходят через миграционный и recovery-контур.

## 4) Полная модель системы (модули)

|**Модуль**|**Ответственность**|**Вход**|**Выход**|
|---|---|---|---|
|core.schema|структура проекта|raw JSON/files|validated model|
|core.ops|семантика изменений|command payload|op events|
|core.migrations|версионность|old format|current format|
|core.recovery|восстановление|snapshots/log|restored project|
|storage.atomic|безопасная запись|file payload|durable write|
|storage.snapshot|слепки/бэкапы|state|snapshot pack|
|command.bus|единый запуск команд|UI/hotkey/palette|op dispatch|
|capability.policy|доступность команд|mode/profile/context|allow/deny|
|projection.outline|структура документа|scene tree|outline index|
|projection.timeline|временные связи|entities/events|timeline graph|
|projection.mindmap|derived map|entities/scenes|visual graph|
|review.engine|comments/changes/history|edits/comments|review model|
|export.compiler|DOCX/PDF/MD сборка|project model|output artifacts|
|search.index|scene/project/global search|normalized text/meta|ranked results|
|plugin.host|управление расширениями|plugin manifest|isolated extension runtime|
|security.guard|IPC/CSP/policy/audit|runtime calls|verified operations|
|platform.adapter.*|платформенные оболочки|command/view states|native behavior|

## 5) Полная модель данных (канонический минимум)

|**Сущность**|**Ключевые поля**|**Инварианты**|
|---|---|---|
|ProjectManifest|id, version, title, createdAt, updatedAt, settings|version обязателен|
|Scene|id, title, content, order, status, refs|отдельная сущность|
|Entity|id, type(character/location/thread), attrs|refs на scenes|
|TimelineEvent|id, dateRange, linkedSceneIds|непротиворечивость дат|
|CommentThread|id, anchor, author, status, messages|anchor должен быть валиден|
|ChangeRecord|id, opId, author, ts, diff|replay determinism|
|EventLogEntry|seq, opType, payload, ts|append-only|
|Snapshot|id, sourceSeq, hash, createdAt|hash verified|
|RecoveryReport|checkId, status, findings|хранимо и читаемо|
|CommandDef|id, scope, availability, effects|registry unique ids|
|MenuOverlay|baseRef, inserts, hides, orderRules|не ломает registry|
|ProfilePreset|id, name, enabledCommands, panels|валидируется policy|
|PluginManifest|id, version, type, capabilities, signature|unsigned blocked|
|DiagnosticsBundle|app/build/platform/log refs|репродуцируемость|

## 6) Полный интерфейс

|**Зона**|**Назначение**|
|---|---|
|Top Menu|иерархия команд|
|Toolbar|быстрые действия|
|Left Sidebar|проекты, сцены, фильтры, outline|
|Center Editor|текст, split, composable blocks|
|Right Panel|свойства, review, инспектор|
|Bottom Status|статус сохранения, метрики, warnings|
|Overlays|command palette, quick open, global search, diagnostics|

## 7) Полная строка меню (разделы + наполнение)

|**Раздел**|**Группы команд**|
|---|---|
|File|project lifecycle, open/recent, save/save all, backup/restore, import/export, settings, close|
|Edit|undo/redo, clipboard, paste plain, find/replace, find in project, text ops|
|View|mode switch, focus, panels, zoom, fullscreen, layout presets|
|Insert|scene/comment/footnote/table/link/image/ref markers|
|Format|headings/styles/lists/paragraph/font/typography/clear|
|Plan|characters/locations/timeline/scene cards/mind map/continuity|
|Review|track changes/comments/accept-reject/history/compare/export review|
|Tools|goals/stats/spell/style/conflict resolver/diagnostics/palette|
|Window|new window/tab/split/navigation/layouts|
|Help|shortcuts/docs/quick start/logs/diagnostics/about|

## 8) Режимы и профили

### 8.1 Mode DNA

|**Mode**|**Приоритет**|
|---|---|
|Write|скорость письма, минимум шума|
|Plan|структурирование и связность проекта|
|Review|редакторский процесс и контроль изменений|

### 8.2 Профили

|**Profile**|**Состав**|
|---|---|
|Minimal|core writing only|
|Pro|стандартный рабочий набор (поэтапно)|
|Guru|полный экспертный набор|

Правило: Pro и Guru расширяются стадийно, не “всё сразу”.

## 9) Menu Composer и кастомизация

### 9.1 Сборка меню

Base -> Platform -> Profile -> Workspace -> User -> Plugin

### 9.2 Лестница кастомизации

|**Уровень**|**Что можно**|
|---|---|
|L0|выбрать готовый профиль|
|L1|hide/reorder по allowlist|
|L2|сохранить личные пресеты|
|L3|расширять через plugin overlays|

## 10) Plugins: окончательная policy

|**Правило**|**Статус**|
|---|---|
|Default plugins = data packs (theme/menu/presets/templates)|BINDING FOR MVP|
|Executable plugins запрещены до отдельной стадии|BINDING FOR MVP|
|Требуются signed packages + explicit install|BINDING FOR EXEC PLUGINS|
|Auto-load из сети/папки запрещён|BINDING|
|Capability manifest обязателен|BINDING|
|Sandbox обязателен|BINDING|

### 10.1 Типы плагинов

|**Тип**|**Разрешено**|**Запрещено**|
|---|---|---|
|data-only|темы, пресеты, меню-overlays, шаблоны без исполнения|JS/WASM/native код, eval, IPC вызовы, сеть|
|executable|только в поздней стадии при отдельной policy|ранний auto-load, обход capability policy|

## 11) Поиск, индексация, навигация

|**Контур**|**Функции**|
|---|---|
|Scene Search|поиск в текущей сцене|
|Project Search|поиск по текущему проекту|
|Global Search|поиск по всем проектам|
|Saved Queries|сохранённые фильтры|
|Quick Open|мгновенный переход|
|Context Jumps|переход “результат -> сцена -> сущность”|

## 12) Экспорт/импорт (полный контур)

### 12.1 Export

DOCX-first pipeline (обязательный baseline).

PDF, MD bundle (stage-gated расширение).

Publisher presets (draft/review/print).

Export Truth Meter (риск несовпадений).

### 12.2 Import

TXT/MD/DOCX/structured JSON.

Mapping в scene model.

Отчёт о конфликтных местах и потере структуры.

### 12.3 Приоритет обязательности

Blocking: DOCX baseline + golden fixtures.

Advisory/Stage-gated: расширенные export/import режимы.

## 13) Review и история

|**Контур**|**Что поддерживаем**|
|---|---|
|Comments|threadId, anchor, author, resolved|
|Track Changes|change records с автором и временем|
|Accept/Reject|по одному, диапазоном, массово|
|Version Compare|scene-level и project-level|
|Time Machine|откат к snapshots и по change segments|

### 13.1 Локальность до X4

В X1–X2 review/history/comments работают как local-first.

Сетевой transport для совместного редактирования подключается только на X4+.

## 14) Безопасность и приватность

|**Область**|**Политика**|
|---|---|
|Electron|CSP, blocked navigation, blocked new-window, no remote code|
|IPC|allowlist + payload validation|
|Storage|локальные данные, atomic writes, hash checks|
|Privacy|no cloud dependency by default|
|Crypto roadmap|encryption-at-rest optional, E2EE only at transport stage|
|Audit|diagnostics + reproducible evidence|

## 15) AI roadmap

|**Этап**|**AI**|
|---|---|
|MVP|локальная орфография/пунктуация|
|Post-MVP|локальный style-check|
|Late|cloud AI opt-in plugin only|
|Всегда|voice-lock: AI предлагает, автор решает|

## 16) Платформы и сторы

### 16.1 macOS (first-class)

Native UX polish.

Signing + notarization + sandbox readiness.

Store compliance contour.

Меню/хоткеи через platform overlay.

### 16.2 Windows

Parity behavior.

MSIX/store packaging contour.

Подпись и policy compliance.

### 16.3 Linux

Desktop parity.

Пакетные каналы без форка core.

### 16.4 iOS/Android (stage-gated)

Mobile shell на том же формате данных.

Ограниченный subset сценариев.

Полный перенос desktop UX не требуется.

### 16.5 Web (stage-gated)

Storage/profile parity subset.

Без ломки offline-first домена.

## 17) Этапы внедрения

|**Этап**|**Фокус**|**Результат**|**Стоимость/сложность**|
|---|---|---|---|
|X0|Contract hygiene|дрейф убран, SSOT чистый|низкая|
|X1|Core reliability|storage/recovery/export/search стабильны|средняя|
|X1.5|Controlled UX flexibility|profiles + composer L0-L1|низкая/средняя|
|X2|Extension foundation|data-only plugins + presets|средняя|
|X3|Platform expansion|web/mobile subsets|средняя/высокая|
|X4|Secure collab transport|replay/conflict/security|высокая|
|A+ (Appendix)|Advanced ecosystem roadmap|executable plugins + opt-in cloud AI (research-only, не stage-binding)|высокая|

### 17.1 Entry/Exit критерии

Каждая стадия имеет entry criteria, exit criteria, rollback criteria.

Переход по стадии запрещён при незакрытых P0 рисках предыдущей стадии.

Для каждой стадии фиксируется минимальный gate-pack.

## 18) Quality system

|**Категория**|**Минимум**|
|---|---|
|Correctness|contract + negative tests|
|Recovery|crash/reopen/restore drills|
|Performance|open/save/reopen/export P95|
|Stability|long-run tests + flaky tracking|
|Platform parity|hard vs soft parity checks|
|Release trust|attestation + signature offline-verifiable|

### 18.1 Правило тестируемости

Любой blocking-инвариант должен иметь machine-check.

Любой blocking-gate должен иметь negative contract test.

Отсутствие negative test для blocking-gate считается P0 риском.

## 19) Anti-bloat правила

Любая новая функция должна улучшать минимум один из пунктов: reliability, writing speed, export quality.

Если не улучшает, это ADVISORY backlog.

На MVP нельзя вводить функции, которые расширяют матрицу сложности без отдачи.

Любая сложная интеграция должна иметь rollback.

### 19.1 Process-tax guard

Governance-строгость масштабируется по уровню риска и слоям архитектуры.

L1/L2 и R1/R2 — строгий контур.

L3 итерации — облегчённый контур.

## 20) Pain-to-Strength карта

|**Pain**|**Strength Outcome**|
|---|---|
|офлайн ненадёжен|“пишу всегда”|
|боюсь потерять текст|“данные выживают”|
|экспорт ломает работу|“экспорт предсказуем”|
|слишком много приложений|“единый контур”|
|UI шумит|“тишина по умолчанию”|
|сложная настройка|“быстрый старт + постепенная мощь”|
|хаос расширений|“безопасный plugin governance”|

## 21) Что совпадает и где риски с v3.12

Совпадает

Offline-first и desktop-first.

Scene atomicity.

Stage order X0→X4.

Local-first collab до X4.

Hard parity на данных и семантике.

Риски

Перепутать product-shell с data-core.

Пытаться сделать полную кастомизацию в MVP.

Включить executable plugins слишком рано.

Ранний cloud AI.

Ранний network transport.

## 22) North Star (2050)

Личный локальный интеллект автора.

Криптоподтверждаемая история изменений.

Безопасная коллаборация без потери формата.

Долговечный архив на десятилетия.

Интерфейс, который подстраивается под автора, а не наоборот.

## 23) Финальная формула

Жесткий data-core + гибкий product-shell + кастомизируемый UI + stage-gated expansion + поздний transport + поздний opt-in cloud AI.

## 24) Normative Tags

(карточка: reqId, statement, authority, bindingLevel, stage, mode, riskClass, machineCheckRef, failSignal, negativeTestRef, rollbackRef, sourceBinding)

## 25) Invariant Map

(минимум: schema, scene atomicity, atomic write, recovery drill, command single-entry, IPC policy, electron security, DOCX baseline, perf baseline)

## 26) Mode Matrix (pr/release/audit)

(PR — быстрые гейты; Release — full blocking; Audit — расширенный full)

## 27) Command Surface Hardening

command.bus — единственный путь выполнения команд + 5 обязательных bypass-negative сценариев.

## 28) Source Binding Policy

SSOT + commit SHA + shipping path; запрет derived-only binding.

## 29) Gate Packs + MIN_BLOCKING_SET_80_20

FAST_PACK / RELEASE_PACK / AUDIT_PACK и обязательный 80/20 минимум.

## 30) False Green Register

обязательный реестр сценариев “PASS токенов при фактической поломке”.

## 31) Cross-platform compatibility matrix

FS/locale/newlines/Unicode/case/locking — обязательный минимум контроля.

## 32) Migration & Rollback Safety

atomic migrations + rollback обязательность для blocking контуров.

## 33) Race-safe Governance

registry/token/failSignal изменения: monotonic versioning + collision checks.

## 34) FailSignal Glossary Rule

1 смысл = 1 failSignal, без semantic overlap.

## 35) Process-tax budget

жесткость по риску, без блокировки L3 итераций.

## 36) Red-team closure

20 red-team вопросов закрываются секциями 24–35.

## 37) Совместимость с концепцией

ядро контролируемо и эволюционируемо; shell/UI подвижны; stage-gated expansion сохраняется.

## 38) MINIMAL BOOK LAYOUT PLUGIN TRACK (ADDITIVE, STAGE-GATED)

### 38.1 Назначение

Трек фиксирует минимальный функционал книжной верстки как доп-функцию/плагин, совместимую с Law+Map.

### 38.2 Minimal Baseline

Book Profile — формат страницы, поля, стиль глав.

Style Map — heading/scene -> export style.

TOC Generator — авто-оглавление из структуры.

Front/Back Matter Templates — титул, выходные данные, благодарности.

Preflight Lite — пустые главы, дубли заголовков, битые ссылки/refs.

### 38.3 Layer Placement

L1: не меняется источник истины формата.

L2: правила компоновки и экспорта.

L3: UI-конфигуратор профиля/шаблонов.

L5: packaging по plugin policy.

### 38.4 Stage Binding

X1.5: контракты + fixtures + preflight протокол.

X2: рабочая desktop интеграция.

X3+: web/mobile subset.

До X4: без network transport dependency.

### 38.5 DoD

DOCX-export учитывает Book Profile + Style Map.

TOC детерминирован.

Front/Back matter шаблоны вставляются без ручной правки.

Preflight Lite даёт машиночитаемый отчёт.

## 39) AUDIT DEBT RECONCILIATION (LATEST AUDIT SOURCE OF TRUTH)

### 39.1 Canonical Audit State

AUDIT_NOW_REMediation_AND_RECONFIRM_v1.0:

STATUS: PASS

FINAL_DECISION: GO_UI_DESIGN

STOP_REQUIRED: false

P0: 0, P1: 3, P2: 2, P3: 2

### 39.2 Active P1 Debt Set

Dependency security remediation plan.

CI/OPS injection hardening.

Centralized path-boundary guard for IPC/file operations.

## 40) DEBT EXECUTION POLICY WHILE PLAN EVOLVES

### 40.1 Two-Lane Execution

Lane A (UI/DESIGN): разрешён при P0=0 и зелёных strict fast-gates.

Lane B (Debt): параллельно закрывает P1.

### 40.2 Hard Stop Conditions

STOP_UI_DESIGN, если:

появляется новый P0,

ломается baseline binding (HEAD != origin/main),

падают strict-gates в подтверждённом повторе.

### 40.3 Release/Promotion Constraint

UI-итерации разрешены, но release/promotion не игнорируют активный P1 debt-set.

### 40.4 Process-Tax Guard

L3 — fast lane, L1/L2 и R1/R2 — полный governance.

## 41) PERF SHARPNESS TRACK (ADDITIVE, NON-REDUCTIVE)

### 41.1 Current Perf Baseline State

PERF_BASELINE_OK=1

HOTPATH_POLICY_OK=1

PERF_THRESHOLD_OK=1

### 41.2 15-Point Checklist

SLO как контракт: релиз “быстрый” только при PERF_BASELINE_OK=1.

Dev-ритуал: perf-lite-check.sh (+ –json при необходимости).

Пороги ужесточать поэтапно (без резких скачков).

Расширить perf-fixture длинным реальным сценарием текста.

Убрать полный перерендер на каждый input (setPlainText -> renderStyledView -> innerHTML).

Ввести инкрементальный рендер/патчинг (или полный Tiptap path).

Убрать transform: scale(…) с основного текстового полотна.

Zoom через перерасчёт метрик/размеров, не масштаб контейнера.

Автосохранение: единый оркестратор.

Бэкап: только по изменению + idle.

Минимизировать IPC-roundtrips в hot path ввода.

Расширить hotpath-policy запретами тяжёлых anti-pattern.

Разделить bundle по фичам (lazy heavy modules).

Ввести мониторинг long tasks (>=50ms) + p95.

Закрепить визуальный контракт “резкости”.

### 41.3 Execution Priority

P0 (release blocking): 1,2,3,4,14

P1 (parallel debt): 7,8,9,10,11,15

P2 (post-stabilization): 5,6,12,13

### 41.4 Когда запускать

После правок hot-path файлов.

При субъективном лаге/“мыле”.

Перед merge/release: сначала perf-lite, затем strict doctor/perf contour.

FINAL STRUCTURE PRINCIPLE

Execution Kernel (v3.12) = LAW

Product Constitution (v1.2 FULL) = MAP

No Compression.

No Simplification.

No Semantic Loss.

No omissions.

## END PART II — PRODUCT CONSTITUTION (MAP, PAYLOAD-LOCKED)

---

## BEGIN PART III — BINDING_INDEX_v0 (BRIDGE, PAYLOAD-LOCKED)

# BINDING_INDEX_v0

## GOVERNANCE BRIDGE (LAW ↔ MAP)

researchOnly: true

implementationBinding: true

canonClass: BRIDGE_INDEX

repoChanges: none

status: DRAFT_FOR_ITERATION

Назначение: фиксировать трассировку MAP_SECTION -> LAW_SECTION -> GATE/TOKEN -> FAILSIGNAL -> MODE, чтобы убрать дрейф между:
1. Execution Kernel (v3.12) = LAW
2. UNIFIED MASTER SPEC v1.2 (FULL, AUDITED FINAL) = MAP

## 0) Легенда

- MODE: PR/Release/Promotion
- BLK = blocking
- ADV = advisory
- BOUND = уже связано с каноном
- SEMI = связано частично, есть серая зона
- GAP = пока advisory, нет полноценного machine-binding в каноне

---

## 1) Bridge Matrix: MAP 0–23

|**MAP ID**|**MAP Section**|**LAW Section(s)**|**Gate/Token**|**FailSignal**|**MODE**|**Binding**|
|---|---|---|---|---|---|---|
|0|Режим документа/полнота|A0, A4, A17, B0|Execution profile validity|E_EXECUTION_PROFILE_INVALID, E_SCOPEFLAG_UNKNOWN, E_REQUIRED_TOKEN_SET_DRIFT|BLK/BLK/BLK|BOUND|
|1|Продукт (offline-first)|A0, A2, A11, A14|CORE_SOT_EXECUTABLE_OK, E2E_CRITICAL_USER_PATH_OK, local-only transport до X4|E_COLLAB_TRANSPORT_FORBIDDEN_IN_MVP|ADV/BLK/BLK|SEMI|
|2|Канон-связка v3.12|A0, A2, A10, A11, A14|Stage activation + scope discipline|E_STAGE_PROMOTION_INVALID, E_COLLAB_TRANSPORT_FORBIDDEN_IN_MVP|ADV/BLK/BLK|BOUND|
|3|Архитектурная иерархия|A1, A2, A8|Locked order + runtime wiring guard|E_RUNTIME_WIRING_BEFORE_STAGE, E_CORE_CHANGE_DOD_MISSING|ADV/BLK/BLK|BOUND|
|4|Модель системы (модули)|A2, A3, A6.1, A7, A12, A13, A14|Core safety set (RECOVERY_IO_OK, MIGRATIONS_*, NORMALIZATION_XPLAT_OK)|E_CORE_CHANGE_DOD_MISSING, E_BLOCKING_TOKEN_UNBOUND|ADV/BLK/BLK|BOUND|
|5|Модель данных|A2, A3, A6.1, A9, A13, A14|Migration/recovery/roundtrip invariants|E_CORE_CHANGE_DOD_MISSING|ADV/BLK/BLK|BOUND|
|6|Полный интерфейс|A2, A3(Tier C), A9|No core-leak from UI|E_CORE_CHANGE_DOD_MISSING|ADV/BLK/BLK|SEMI|
|7|Полная строка меню|A2, A3(Tier C), A8, A9|UI free-zone + no forbidden runtime wiring|E_RUNTIME_WIRING_BEFORE_STAGE, E_CORE_CHANGE_DOD_MISSING|ADV/BLK/BLK|SEMI|
|8|Режимы и профили|A2, A9, A10, A11|Stage/scope activation for advanced profiles|E_STAGE_PROMOTION_INVALID, E_STAGE_METRICS_MISSING|ADV/ADV/BLK|SEMI|
|9|Menu Composer/кастомизация|A2, A8, A10|Overlay customization without runtime-stage violation|E_RUNTIME_WIRING_BEFORE_STAGE, E_STAGE_PROMOTION_INVALID|ADV/BLK/BLK|SEMI|
|10|Plugins policy|A8, A10, A11|No early executable/runtime wiring|E_RUNTIME_WIRING_BEFORE_STAGE, E_STAGE_PROMOTION_INVALID|ADV/BLK/BLK|BOUND|
|11|Поиск/индексация/навигация|A6.1, A12|E2E_CRITICAL_USER_PATH_OK|token-fail by gate|ADV/BLK/BLK|SEMI|
|12|Экспорт/импорт|A6.1, A9, A12|Hard parity for export/import semantics|token-fail by gate|ADV/BLK/BLK|BOUND|
|12B|Minimal Book Plugin Track|A2, A6.1, A9, A12|BookProfile, StyleMap, TOC, FrontBackMatter, PreflightLite|PROPOSED: E_BOOK_PREFLIGHT_FAIL|ADV/ADV/ADV|GAP|
|13|Review/история|A14, A11|Local-first comments/history до X4|E_COLLAB_TRANSPORT_FORBIDDEN_IN_MVP|ADV/BLK/BLK|BOUND|
|14|Безопасность/приватность|A6.2, A7, A15, A16|Integrity + proofhook + config lock + no bypass|E_DIRECT_PROTECTED_BRANCH_PUSH, E_MERGE_BYPASS_ATTEMPT, integrity class failSignals|BLK/BLK/BLK|BOUND|
|15|AI roadmap|A0, A8, A11, A14|Late-stage cloud, no early runtime cloud wiring|E_RUNTIME_WIRING_BEFORE_STAGE|ADV/BLK/BLK|SEMI|
|16|Платформы/сторы|A9, A11, A12|Stage metrics + hard parity + platform DoD|E_STAGE_METRICS_MISSING, E_STAGE_PROMOTION_INVALID|ADV/ADV/BLK|BOUND|
|17|Этапы внедрения|A1, A10, A11|Locked order + stage activation + evidence|E_SEQUENCE_ORDER_DRIFT, E_STAGE_PROMOTION_INVALID, E_STAGE_METRICS_MISSING|ADV/BLK/BLK|BOUND|
|18|Quality system|A5, A6, A7, A17, B4|80/20 blocking + anti-false-green + freshness|E_WAVE_RESULT_STALE, E_BLOCKING_TOKEN_UNBOUND|ADV/BLK/BLK|BOUND|
|19|Anti-bloat|A5, A6|Process-lean + minimal blocking discipline|E_WAVE_RESULT_STALE (косвенно)|ADV/ADV/ADV|SEMI|
|20|Pain-to-Strength|A0|Product intent layer|n/a|ADV/ADV/ADV|GAP|
|21|Совпадения/риски|A2, A8, A11, A14|Risk mapping to canon constraints|n/a|ADV/ADV/ADV|SEMI|
|22|North Star|A0|Vision-only|n/a|ADV/ADV/ADV|GAP|
|23|Финальная формула|A2, A8, A11, A14|Composite architecture rule|n/a|ADV/ADV/ADV|SEMI|

---

## 2) Bridge Matrix: MAP 24–37

|**MAP ID**|**MAP Section**|**LAW Section(s)**|**Gate/Token**|**FailSignal**|**MODE**|**Binding**|
|---|---|---|---|---|---|---|
|24|Normative Tags|A7, B4|Blocking token law completeness|E_BLOCKING_TOKEN_UNBOUND|ADV/BLK/BLK|BOUND|
|25|Invariant Map|A6.1, A7, B4|Invariant -> machine-check linkage|E_BLOCKING_TOKEN_UNBOUND|ADV/BLK/BLK|BOUND|
|26|Mode Matrix|A16, A17|Canonical mode enforcement|fail by mapped class|as defined in A16|BOUND|
|27|Command Surface|A2, A7, A8|COMMAND_SURFACE_BUS_ONLY_OK + COMMAND_SURFACE_SINGLE_ENTRY_OK + COMMAND_SURFACE_BYPASS_NEGATIVE_TESTS_OK|E_COMMAND_SURFACE_BYPASS|ADV/BLK/BLK|BOUND|
|28|Gate Packs|A6, A16, B0, B4|FAST/RELEASE/AUDIT packs (mapped to canon)|inherited from pack gates|pack-dependent|SEMI|
|29|False Green Register|A5, A7, B4|Negative tests + proof binding required|E_BLOCKING_TOKEN_UNBOUND, E_WAVE_RESULT_STALE|ADV/BLK/BLK|BOUND|
|30|Cross-Platform Matrix|A9, A11, A12|Parity baseline + platform DoD + stage metrics|E_STAGE_METRICS_MISSING, E_STAGE_PROMOTION_INVALID|ADV/ADV/BLK|BOUND|
|31|Migration Safety|A3(Tier A), A6.1, A9|MIGRATIONS_POLICY_OK, MIGRATIONS_ATOMICITY_OK, RECOVERY_IO_OK|E_CORE_CHANGE_DOD_MISSING|ADV/BLK/BLK|BOUND|
|32|Race-safe Governance|A5, A10, B5, B6|WAVE hash/TTL + required-set safety + stage consistency|E_WAVE_RESULT_STALE, E_REQUIRED_TOKEN_SET_DRIFT, E_STAGE_PROMOTION_INVALID|ADV/BLK/BLK|BOUND|
|33|FailSignal Glossary|A16, B1|FailSignal registry integrity|FAILSIGNAL_REGISTRY_VALID_OK token-fail|ADV/BLK/BLK|BOUND|
|34|Process-Tax Budget|A5, A6|Single-run wave + 80/20 release blocking|E_WAVE_RESULT_STALE (косвенно)|ADV/BLK/BLK|SEMI|
|35|Red-Team Closure|A7, A17, B4|Closure only via machine-bound proofs|E_BLOCKING_TOKEN_UNBOUND|ADV/BLK/BLK|BOUND|
|36|Совместимость с концепцией|A2, A11, A14|Core fixed + shell flexible + staged collab|E_RUNTIME_WIRING_BEFORE_STAGE, E_COLLAB_TRANSPORT_FORBIDDEN_IN_MVP|ADV/BLK/BLK|SEMI|
|37|Drift Control (Bridge Ops)|A17, B0, B4|PROPOSED: BINDING_INDEX_SYNC_OK|PROPOSED: E_BINDING_INDEX_DRIFT|ADV/BLK/BLK|GAP|

---

## 3) Gap Register (что пока не переводить в blocking)

1. MAP-12B Minimal Book Plugin Track
   Статус: GAP до формализации machine-check набора.
2. MAP-34 Process-Tax Budget
   Статус: SEMI пока нет отдельного machine-check бюджета процесса.
3. MAP-37 Drift Control
   Статус: GAP до ввода BINDING_INDEX_SYNC_OK.
4. Vision-only секции (MAP-20, MAP-22)
   Статус: ADVISORY по определению, блокировать нельзя.

---

## 4) Drift Control Rules (операционные)

1. Любая правка v3.12, затрагивающая A/B/C, обязана обновить соответствующие строки этого индекса.
2. Любая правка UNIFIED MASTER SPEC, меняющая binding-класс раздела, обязана обновить индекс.
3. Если раздел в индексе имеет GAP, он не может быть release-blocking.
4. Для BOUND-строк обязательна непрерывная связка: Gate -> FailSignal -> Mode.
5. Разрешение конфликтов: при расхождении LAW и MAP источник истины только LAW (v3.12).
6. До канонизации MAP-37 drift-контроль считается обязательным процессно, но формально advisory.

---

## 5) Минимальный Bridge-guard набор (без process-tax)

1. Проверять, что у всех BOUND-строк заполнены Law/Gate/FailSignal/Mode.
2. Проверять, что GAP-строки не попали в release-blocking.
3. Проверять, что mode-класс не противоречит A16.
4. Проверять, что новые map-разделы не остаются “без строки в индексе”.
5. Проверять, что Book/Command расширения остаются advisory до отдельной канонизации.

## END PART III — BINDING_INDEX_v0 (BRIDGE, PAYLOAD-LOCKED)

---

## BEGIN PART IV — AUDIT_EXECUTION_STATUS_AND_DEBT_TRACK (STATE, PAYLOAD-LOCKED)

# AUDIT EXECUTION STATUS AND DEBT TRACK

## Snapshot:
## AUDIT_NOW_REMediation_AND_RECONFIRM_v1.0

Mode: Execution

Status: PASS

Final Decision: GO_UI_DESIGN

Stop Required: false

---

## 1) Baseline Binding

- BASE_SHA_REQUIRED: f3ab788b087f6554d2d2597696f4b4fad9e42da7
- HEAD_SHA: f3ab788b087f6554d2d2597696f4b4fad9e42da7
- ORIGIN_MAIN_SHA: f3ab788b087f6554d2d2597696f4b4fad9e42da7
- git fetch origin: PASS (0)

Conclusion: baseline binding корректный (HEAD == origin/main).

---

## 2) Fast Gates

- node scripts/doctor.mjs --strict: PASS (0)
- CHECKS_BASELINE_VERSION=v1.3 EFFECTIVE_MODE=STRICT node scripts/doctor.mjs: PASS (0)
- npm test: PASS (0)

Conclusion: строгие быстрые гейты зелёные.

---

## 3) Heavy Scans (executed)

### 3.1 SCA
- npm audit --json: executed, exit 1 (findings present)
- npm outdated --json: executed, exit 1 (outdated deps present)
- osv-scanner scan source -r . --format json: executed, exit 1 (findings present)

### 3.2 SAST
- semgrep --config auto --json: executed, exit 0
- Findings: 62
- Parser warnings: 3

### 3.3 License
- license-checker --production --json: executed, exit 0
- UNKNOWN/DENY in prod: 0

### 3.4 Dup / Architecture
- jscpd: PASS (0)
- madge --circular src: PASS (0), cycles not detected
- knip: executed, fallback --reporter json, exit 1 (findings present)
- dependency-cruiser: executed via fallback (depcruise --no-config), exit 0

---

## 4) Severity Counts

- P0: 0
- P1: 3
- P2: 2
- P3: 2

---

## 5) Active NOW (<=3) Reconfirmed

1. Dependency security remediation plan (builder/tar high chain + runtime moderate advisories).
2. CI/OPS injection hardening (workflow interpolation, shell:true spawn).
3. Centralized path-boundary guard for IPC/file operations.

---

## 6) No-Mutation Proof (audit run)

- git diff --name-status -M -C: empty
- git diff --cached --name-status -M -C: empty
- git ls-files --others --exclude-standard: only docs/AUDIT/**
- git status --porcelain --untracked-files=all: only ?? docs/AUDIT/**

---

## 7) Updated Artifacts

- docs/AUDIT/audit-meta.json
- docs/AUDIT/audit-findings.json
- docs/AUDIT/decision-log.md
- docs/AUDIT/audit-summary.md
- Raw logs: docs/AUDIT/raw/now/*

---

## 8) Execution Policy After PASS

### 8.1 UI/DESIGN permission

GO_UI_DESIGN remains valid while:
- P0 = 0
- strict fast-gates stay green
- baseline binding remains correct

### 8.2 Debt lane (parallel, non-frozen)

Close active P1 in parallel with design/menu work:
- Dependency remediation
- CI/OPS injection hardening
- Path-boundary guard

### 8.3 Hard stop conditions

Immediate stop if:
1. any new P0 appears,
2. HEAD != origin/main (baseline drift),
3. strict gates fail in confirmed rerun.

### 8.4 Short preflight before menu/design lane

Перед началом menu/design цикла обязателен короткий preflight:
- `P0=0`
- strict fast-gates green
- baseline binding ok (`HEAD == origin/main`)

---

## 9) Audit Follow-up Cadence

- Fast reconfirm: each merge window / before release cut.
- Heavy scan wave: periodic, and mandatory before promotion.
- Promotion requires: no unresolved P0 and reconciled critical P1 set.

---

## 10) Summary

Current state supports design/menu progression (GO_UI_DESIGN).

Risk is controlled if debt lane is actively burned down and strict baseline remains green.

## END PART IV — AUDIT_EXECUTION_STATUS_AND_DEBT_TRACK (STATE, PAYLOAD-LOCKED)

---

## FINAL STRUCTURE PRINCIPLE

Execution Kernel (v3.12) = LAW

Product Constitution (v1.2 FULL) = MAP

Binding Index (v0) = BRIDGE

Audit Execution Status = STATE

No Compression.

No Simplification.

No Semantic Loss.

No omissions.

## BEGIN PART V — INTEGRATED CORRECTIONS AND CLARIFICATIONS PACK (ADDITIVE, NO-LOSS)

canonClass: ADVISORY_CLARIFICATIONS_PACK

scope: LAW + MAP + BRIDGE + STATE harmonization

modificationPolicy: append_only

compressionPolicy: forbidden

---

### V0) NO-COMPRESSION LOCAL CANON (ADVISORY CLARIFICATIONS)

1. PART I–IV считаются payload-locked и не редактируются без отдельной канонической ревизии.
2. Для PART V действует принцип append-first (предпочтительно добавление, а не замена).
3. PART V допускает редакцию/консолидацию формулировок при сохранении трассируемости.
4. Любая обязательность возникает только через machine-binding в PART B.

---

### V1) TERMINOLOGY DISAMBIGUATION (A1 vs A10/A11)

1. Термин Stage зарезервирован только для X0..X4 (A10/A11).
2. A1 трактуется как LOCKED EXECUTION SEQUENCE (порядок исполнения), а не stage-модель.
3. Любые проверки дрейфа должны явно указывать тип:
   - sequence drift (A1),
   - xplat stage drift (A10/A11).

---

### V2) COLLAB SCOPE CLARIFICATION (A12 + A14)

1. Требования A14 считаются обязательными при COLLAB_SCOPE_LOCAL=1.
2. Для MVP значение по умолчанию: COLLAB_SCOPE_LOCAL=1.
3. Если COLLAB_SCOPE_LOCAL=0, comments/history контуры не являются blocking.
4. Это устраняет двусмысленность между A12 и A14.

---

### V3) RELEASE INTEGRITY VS DISTRIBUTION GATE

1. A6.3 (verify/attestation/signature) — offline release integrity.
2. Notarization/store submission — отдельный online distribution gate (stage-gated).
3. Сбой online distribution не отменяет факт offline release integrity.
4. 80/20 release blocking не расширяется автоматически за счёт distribution процедур.

---

### V4) BEHAVIORAL PROOF DEFINITION (A7/B4 HARDENING)

Behavioral proof валиден только если одновременно:
1. Выполняется сценарий, который меняет состояние/артефакт (не только schema-check).
2. Проверяется наблюдаемый результат (output/assert/hash/fixture diff).
3. Есть negative-сценарий с ожидаемым failSignal.

---

### V5) STAGE METRICS THRESHOLDS (A11 EXECUTABILITY)

1. Явные PASS/FAIL пороги обязательны только для promotion-critical метрик A11.
2. Метрика без порога трактуется как informational (metrics definition gap).
3. Informational-метрики не блокируют promotion до фикса порога в SSOT.
4. Threshold-таблица хранится и версионируется в stage-metrics SSOT.

---

### V6) E2E_CRITICAL_USER_PATH HARD LIMIT

E2E_CRITICAL_USER_PATH_OK ограничивается детерминированным минимумом:
1. create/open project,
2. edit scene,
3. save/reopen,
4. DOCX export baseline,
5. recovery smoke.
   Любые расширения сверх этого минимума — stage-gated/advisory до отдельного ROI-решения.

---

### V7) COMMAND SURFACE SINGLE-ENTRY RULE

1. command.bus — единственный runtime entrypoint выполнения команд.
2. Обязательные bypass-negative контуры:
   - hotkey bypass,
   - palette bypass,
   - direct IPC bypass,
   - context/button bypass,
   - plugin overlay bypass.
3. Machine-binding закрыт: `E_COMMAND_SURFACE_BYPASS` зарегистрирован, bypass-negative контуры и sourceBinding подтверждены.
4. Токен `COMMAND_SURFACE_BUS_ONLY_OK` tokenized и проверяем, но не включается в release required-set автоматически.

---

### V8) SSOT ANCHOR CONSISTENCY RULE (LAW ↔ REPO)

1. Все пути B1/B2 должны иметь фактическое соответствие в рабочем SSOT.
2. Несовпадение имени/версии якоря = SSOT anchor drift.
3. На drift обязателен migration-map (old path -> new path) без потери трассируемости.
4. До отдельной токенизации drift фиксируется как SSOT anchor reality-check (advisory).
5. Политика: law-имя и репо-якорь не могут расходиться длительно.

---

### V9) SECURITY FINDINGS PROMOTION/AUDIT ACCEPTANCE

1. Этот раздел не расширяет A6 release-blocking.
2. Применяется к promotion/audit, если не замаплен на существующие A6 токены.
3. Release-блокировка только через уже существующие blocking tokens.
4. Promotion/Audit acceptance по security определяется reachability + severity.
5. Минимум:
   - reachable critical/high unresolved = BLOCK,
   - non-reachable findings допускают time-bound exception.
6. Exception требует owner, expiry и mitigation-plan.

---

### V10) WAVE INPUT HASH COMPUTATION CONTRACT

1. relevant SSOT вычисляется автоматически:
   - ALWAYS_ON всегда,
   - STAGE_GATED только для активных stage/scopeFlags,
   - плюс связанные token/proofhook/config inputs.
2. TTL классы:
   - deterministic local checks: hash-driven re-run,
   - network-sensitive scans: bounded TTL class.
3. Ручной выбор “relevant SSOT” запрещён.

---

### V11) BRIDGE OPERATION MODE (ANTI-PROCESS-TAX)

1. BINDING_INDEX_SYNC на старте используется как warning-only advisory (PR/Release).
2. После стабилизации (критерий зрелости фиксируется отдельно) может стать promotion-blocking.
3. Bridge не должен блокировать L3-итерации при неизменном binding-уровне.

---

### V12) PROCESS-TAX BUDGET ENFORCEMENT

1. Строгий контур: L1/L2 и риск-классы R1/R2.
2. Быстрый контур: L3 UI/UX/menu/layout.
3. Нельзя требовать полный governance-пакет для мелких L3 изменений.
4. Любой новый governance-шаг должен иметь измеримый эффект на reliability/safety.

---

### V13) RUNTIME PERFORMANCE INVARIANTS (ANTI-LAG GUARDS)

1. Hot path ввода не ждёт disk I/O.
2. Autosave/backup работают через orchestrator (debounce/idle/change-driven).
3. Derived views (mindmap/timeline/index) — lazy/incremental/background, не full-recompute на каждый input.
4. Эти правила согласуются с PART II / 41 PERF SHARPNESS TRACK.

---

### V14) CONCEPT COMPATIBILITY ASSERTION (EXPLICIT)

Документная система (LAW+MAP+BRIDGE+STATE) совместима с целевой концепцией:
1. Ядро фиксируемо, но эволюционируемо через controlled mutability.
2. Shell/UI/меню подвижны и допускают быстрые итерации.
3. Markdown, mindmap, расширяемый экспорт — поддерживаемы.
4. XPLAT адаптация — stage-gated без ломки core invariants.
5. Comments/history local-first допустимы до network transport stage.
6. Network collab включается только в X4+.

---

### V15) INTEGRATION STATUS

1. PART V — advisory clarifications pack, а не второй закон.
2. PART V не расширяет A6 и не меняет OPS_INTEGRITY_P0 сам по себе.
3. Binding-эффект допустим только через явное добавление токена/пруфа/negative-test/failSignal в PART I/B.
4. При конфликте источником истины остаётся PART I (LAW).

---

### V16) TOKENIZATION QUEUE (NON-BLOCKING BY DEFAULT)

1. Candidate: SSOT_ANCHORS_EXIST_OK -> E_SSOT_ANCHOR_MISSING / E_SSOT_ANCHOR_DRIFT.
2. Candidate: BEHAVIORAL_PROOF_RULE_ENFORCED_OK -> validator for A7/B4.
3. Candidate: E2E_CRITICAL_PATH_SCOPE_VALID_OK -> фиксированный лимит critical-path.
4. Все кандидаты из очереди имеют статус ADVISORY и не входят в OPS_INTEGRITY_P0/A6, пока не добавлены в PART I/B отдельной канонической правкой.
5. До включения токена: SSOT anchor drift = advisory в PR; blocking в release/promotion только после явного включения в OPS_INTEGRITY_P0.

---

### V17) PROMPT_LAYER SINGLE-SOURCE ENFORCEMENT

1. `PROMPT_LAYER=RUNNER_UI` эмитится только `run-wave` и только один раз за запуск.
2. Bootstrap/assist скрипты не эмитят `PROMPT_LAYER`; они используют отдельные bootstrap-токены.
3. Контракты проверяют одновременно:
   - отсутствие `PROMPT_LAYER=REPO`,
   - single-source + one-shot для `RUNNER_UI`.
4. `E_PROMPT_LAYER_POLICY_INVALID` зарегистрирован и привязан к контрактным negative-путям.

---

### V18) STAGE AXIS LOCK (X0..X4) + X5 HANDLING

1. Binding stage-axis фиксируется как `X0..X4` (строго).
2. Любой `X5` допустим только в research/appendix контуре и не участвует в runtime schema/validator/defaults/tests.
3. Добавление стадии beyond `X4` допускается только отдельной канонической правкой PART I/B.
4. `E_STAGE_AXIS_DRIFT` зарегистрирован и привязан к runtime menu-contract negative proof.

---

### V19) EXECUTION SURFACE UNIFICATION (NO-SPLIT PATH)

1. Любой UI source (`menu`, `toolbar`, `hotkey`, `palette`, `context`, `inspector`) исполняет команды только по цепочке:
   `dispatch(cmdId,payload) -> command.bus -> runCommand`.
2. Direct execute через IPC/UI-handler для командных действий запрещён.
3. Legacy `actionId` допускается только как alias-bridge `actionId -> cmd.*`, после чего исполнение идёт через bus.
4. Цель миграции: к `UI-MENU-04` direct legacy execute paths в UI = 0.
5. Tokenization уже доступна через `COMMAND_SURFACE_BUS_ONLY_OK`, но без автоматического расширения release required-set.
6. `E_COMMAND_SURFACE_BYPASS` зарегистрирован и привязан к bypass-negative контрактам.

---

### V20) DELIVERY LANES (ANTI-PROCESS-TAX, QUALITY-PRESERVING)

1. `DEV_FAST_LANE`:
   - canonical local entrypoint: `npm run dev:fast`,
   - один проход doctor,
   - targeted tests,
   - без повторных heavy synth loops на каждый локальный цикл,
   - без auto-upgrade в `ops-current-wave`/wave-heavy контур даже при наличии guard scripts.
2. `CI_HEAVY_LANE`:
   - полный governance/wave/doctor/full-suite контур.
3. Выбор lane определяется execution profile; смешивание требований lane запрещено.
4. `DEV_FAST_LANE` не выпускает release/promotion attestations.

---

### V21) GOVERNANCE APPROVAL FLOW (ANTI-MICROTICKET LOOP)

1. Для изменений в governance-bound scope (`test/contracts/**`, `scripts/ops/**`, `doctor/ops state`) approvals-артефакт обновляется в том же PR.
2. Approvals-файл считается default companion artifact для ops/contract execution tickets.
3. Approval-only micro-ticket допускается только как аварийный rollback-исключительный случай.
4. Это правило уменьшает process-friction и не ослабляет strict release checks.

---

### V22) HOT-PATH REMEDIATION PRIORITY (P2, NON-BLOCKING UNTIL TOKENIZED)

1. Pattern `full rerender per keystroke` классифицируется как P2 perf-debt.
2. Направление исправления: incremental update path; избегать полного `innerHTML reset + full pagination` на каждый input.
3. Autosave/backup сохраняются orchestrated и change-driven.
4. До tokenization в PART I/B этот пункт остаётся advisory.

---

### V23) RUN-WAVE SAFETY EXECUTION CONTEXT

1. `run-wave` предназначен для CI/disposable execution context.
2. Локальный запуск на dirty tree должен завершаться STOP до destructive git preflight.
3. Destructive preflight шаги в локальном контуре допустимы только при явном opt-in.

---

### V24) DOCX BASELINE SCOPE CLARIFICATION

1. `DOCX baseline` остаётся release-blocking по A6.1 + V6 до отдельной канонической ревизии.
2. `X2` может расширять export modes (`PDF/MD bundle`) как stage-gated, но они не заменяют DOCX baseline в release-контуре.
3. Любая попытка сделать DOCX optional для release требует отдельного изменения PART I/B.

---

### V25) ACTIVE_CANON UPGRADE RECORD

1. `ACTIVE_CANON` подтверждён при закрытии P0 pack: stage-axis lock, prompt-layer single-source, bus-only command surface, failSignal/token wiring, dev fast lane.
2. `E_STAGE_AXIS_DRIFT`, `E_PROMPT_LAYER_POLICY_INVALID`, `E_COMMAND_SURFACE_BYPASS` считаются зарегистрированными machine-bound failSignals.
3. `E_SEQUENCE_ORDER_DRIFT` зарегистрирован как machine-bound failSignal с PR advisory и Release/Promotion blocking-семантикой.
4. SSOT anchor reality контролируется отдельным быстрым контрактом без wave/heavy execution.

## END PART V — INTEGRATED CORRECTIONS AND CLARIFICATIONS PACK (ADDITIVE, NO-LOSS)
