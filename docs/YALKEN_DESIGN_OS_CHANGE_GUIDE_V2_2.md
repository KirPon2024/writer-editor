# YALKEN_DESIGN_OS_CHANGE_GUIDE_V2_2

Это рабочий guide для человека и агента о том, как менять `Yalken Design OS` без путаницы между визуалом, привязкой интерфейса, механикой оболочки, хранением данных и docs-only контурами.

Документ не является вторым каноном и не создаёт binding law силой текста. Он помогает безопасно открывать узкие контуры поверх текущего `mainline` и не смешивать разные уровни истины.

## 1. Истина и снимок состояния

Сначала всегда различайте три вещи:

1. active canon
2. current mainline snapshot
3. current local machine state

Active canon определяет обязательный law. Current mainline snapshot говорит, что считалось правдой на конкретном `selectedBaseSha` и `bindingBaseSha`. Current local machine state может отличаться от snapshot из-за грязного worktree, локальных генераций, старой ветки или незавершённого hygiene-контура.

```text
TRUTH_ORDER_01: CANON_STATUS.json_AND_ACTIVE_CANONICAL_EXECUTION_DOCUMENT
TRUTH_ORDER_02: CANON.md
TRUTH_ORDER_03: COREX.v1.md
TRUTH_ORDER_04: BIBLE.md
TRUTH_ORDER_05: README.md
TRUTH_ORDER_06: CONTEXT.md
TRUTH_ORDER_07: PROCESS.md
TRUTH_ORDER_08: HANDOFF.md
TRUTH_RULE_01: OLD_MASTER_PLANS_ARE_DONOR_ONLY
TRUTH_RULE_02: NO_SECOND_CANON
```

Любой документ со словами `current mainline aligned` обязан быть привязан к снимку.

```text
SNAPSHOT_FIELDS_REQUIRED: SELECTED_BASE_SHA BINDING_BASE_SHA VERIFIED_AT_UTC ENV_PROFILE LOCAL_BRANCH LOCAL_WORKTREE_STATE
SNAPSHOT_RULE_01: WITHOUT_THESE_FIELDS_NO_CURRENT_MAINLINE_ALIGNED_CLAIM
SNAPSHOT_RULE_02: LOCAL_MACHINE_STATE_MAY_DIFFER_FROM_MAINLINE_SNAPSHOT
SNAPSHOT_RULE_03: DIRTY_LOCAL_WORKTREE_BLOCKS_NEW_WRITE_CONTOUR_UNLESS_HYGIENE_OR_ISOLATION_TASK
```

## 2. Что такое Yalken Design OS сейчас

`Yalken Design OS` уже существует в репо как реальная runtime-система дизайна и оболочки. Но он не является отдельным продуктом и не владеет всей истиной приложения.

Он отвечает за:

- токены
- профили интерфейса
- режимы оболочки
- видимые и доступные команды
- раскладку в разрешённых границах
- safe reset shell
- restore last stable
- design state

Он не отвечает за:

- product truth
- command truth
- recovery truth
- смысл команд
- модель сохранения

```text
SYSTEM_STATUS: FORMAL_CUTOVER_BOUND_WITH_READINESS_HOLD
SYSTEM_RULE_01: DO_NOT_PRESENT_DORMANT_OR_DEFERRED_SLICES_AS_FULLY_LIVE
SYSTEM_RULE_02: PRIMARY_EDITOR_CLOSURE_DOES_NOT_GREEN_ALL_DESIGN_OS_SLICES
```

## 3. Границы владения

Если правка лезет в правую колонку, это уже не чистый Design OS contour.

```text
CAN_CHANGE: TOKENS DESIGN_PATCH LAYOUT_PATCH_VISIBLE_COMMANDS AVAILABLE_COMMANDS SAFE_RESET_SHELL RESTORE_LAST_STABLE DESIGN_STATE
CANNOT_CHANGE: PRODUCT_TRUTH COMMAND_TRUTH RECOVERY_TRUTH COMMAND_MEANING SAVE_MODEL_WITHOUT_SEPARATE_STORAGE_CONTOUR
BOUNDARY_RULE_01: TOUCHING_CANNOT_CHANGE_ESCALATES_OUT_OF_PURE_DESIGN_OS
BOUNDARY_RULE_02: DESIGN_OS_MAY_PRESENT_COMMANDS_BUT_MUST_NOT_REDEFINE_MEANING
```

### 3.1 Интеграция новых фич и процессов

Полная методика находится в
`docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md` и обязательна для
новых feature, process, worker, import, export, analysis и surface contours.

Фича не «входит целиком в Design OS». Она имеет два независимых подключения:

```text
PRODUCT_PLANE: DOMAIN COMMANDS EVENTS QUERIES PRODUCT_PORTS ADAPTERS
INTERFACE_PLANE: HOST_CONTRIBUTION DESIGN_OS_PORTS SURFACE_MANIFEST TYPED_SLOTS PROJECTION_ADAPTER
```

Product plane определяет смысл и эффекты. Interface plane определяет форму и
присутствие в оболочке. Design OS является solver формы, но не владельцем
product truth.

```text
FEATURE_RULE_01: ALL_MUTATIONS_USE_CANONICAL_COMMAND_AUTHORITY
FEATURE_RULE_02: ALL_EXTERNAL_EFFECTS_USE_PRODUCT_PORTS_AND_ADAPTERS
FEATURE_RULE_03: UI_READS_IMMUTABLE_PRODUCT_PROJECTIONS
FEATURE_RULE_04: NEW_UI_ENTERS_ONLY_THROUGH_SURFACE_MANIFEST_AND_TYPED_SLOT
FEATURE_RULE_05: PROJECT_PERSISTENCE_NEVER_MERGES_WITH_SHELL_PERSISTENCE
FEATURE_RULE_06: FEATURE_PACK_MUST_NOT_CREATE_PRIVATE_CORE_BUS_OR_STORAGE_WRITER
FEATURE_RULE_07: MISSING_PLATFORM_SURFACE_REQUIRES_EXPLICIT_FALLBACK
FEATURE_RULE_08: TARGET_MODEL_IS_NOT_LIVE_WITHOUT_MACHINE_EVIDENCE
```

Для новой фичи до UI-кода обязательны:

- `FEATURE_INTEGRATION_MANIFEST_V1`;
- authority map;
- command write path;
- projection read path;
- product ports and adapters;
- surface manifests and slots;
- fallback and accessibility;
- recovery and negative bypass checks;
- hot-path performance boundary.

Если подходящего surface или slot нет, это отдельный architecture contour. Это
не разрешение вставить функцию в случайный DOM или создать mini Design OS.

## 4. Схема сущностей

В репо нельзя смешивать пять разных классов вещей:

- required surface
- gap
- deferred test
- lane status
- blocked environment

```text
ENTITY_01: REQUIRED_SURFACE
ENTITY_02: GAP
ENTITY_03: DEFERRED_TEST
ENTITY_04: LANE_STATUS
ENTITY_05: BLOCKED_ENV
ENTITY_RULE_01: NEVER_MIX_THESE_IN_ONE_LIST
ENTITY_RULE_02: LANE_STATUS_IS_NOT_SURFACE
ENTITY_RULE_03: DEFERRED_TEST_IS_NOT_ADMITTED_SURFACE
ENTITY_RULE_04: GAP_IS_NOT_SURFACE
ENTITY_RULE_05: BLOCKED_ENV_IS_NOT_LANE_STATUS
```

## 5. Текущая опорная карта по репо

Это не вечные истины, а текущая карта, привязанная к снимку current mainline.

```text
CURRENT_MAP_SNAPSHOT_BOUND: TRUE
CURRENT_MAP_SELECTED_BASE_SHA: 023275cdc82faf4483568596a9e144fe2442bfcc
CURRENT_MAP_BINDING_BASE_SHA: f6f04b17e74cc7b9fc5185ca6dc37261886de0d5
CURRENT_MAP_REBOUND_AT_UTC: 2026-04-02T14:55:00Z
CURRENT_MAP_ARTIFACTS: CURRENT_SCOPE_PROOF_MATRIX.json OWNER_GAP_DASHBOARD.json ENVIRONMENT_READINESS_MATRIX.json FALSE_GREEN_GUARD_POLICY.json Y8_FORMAL_CUTOVER_PACKET_RECORD_V1.json
CURRENT_MAP_RULE_01: ALL_CURRENT_MAP_ROWS_MUST_TRACE_TO_CURRENT_MAP_ARTIFACTS
CURRENT_MAP_RULE_02: IF_ANY_BOUND_FIELD_CHANGES_REBIND_BEFORE_NEW_WRITE_CONTOUR
REQUIRED_SURFACES: SURFACE_EDITOR_TRUTH_AND_SAVE SURFACE_COMMAND_SURFACE SURFACE_MENU_SOURCEBINDING SURFACE_SHELL_SAFE_RESET_RESTORE SURFACE_FACTUAL_DOC_TRUTH SURFACE_PERF_TRUTH SURFACE_DEPENDENCY_TRUTH
CURRENT_GAPS: GAP_SKIP_HEAVY_CURRENT_SCOPE=LATER GAP_PERF_FALSE_GREEN=BLOCKED
CURRENT_DEFERRED_TESTS: palette-grouping.test.js sector-m-command-surface-ui-fencing.test.js sector-m-preload-ui-command-bridge.test.js sector-m-runtime-command-id-canonicalization.test.js sector-m-design-os-theme-design-state.test.js sector-m-design-os-typography-design-state.test.js sector-m-design-os-command-palette-visibility.test.js
CURRENT_LANE_STATUSES: SECURITY_AUDIT_LANE=STANDARDIZED_READY_WITH_GENERIC_SAST TEST_ELECTRON_LANE=READY_AND_EXECUTED_TWICE_ON_CURRENT_MAINLINE
CURRENT_BLOCKED_ENV: BLOCKED_BUILD_MAC=BLOCKED
```

Статусные claims должны быть привязаны к конкретным артефактам, а не пересказываться свободно.

```text
STATUS_ARTIFACT_01: CURRENT_SCOPE_PROOF_MATRIX.json_FOR_REQUIRED_SURFACES
STATUS_ARTIFACT_02: OWNER_GAP_DASHBOARD.json_FOR_GAP_CLASSIFICATION
STATUS_ARTIFACT_03: FALSE_GREEN_GUARD_POLICY.json_FOR_FALSE_GREEN_GUARDS
STATUS_ARTIFACT_04: Y8_FORMAL_CUTOVER_PACKET_RECORD_V1.json_FOR_FORMAL_CUTOVER_BOUND_WITH_READINESS_HOLD
STATUS_ARTIFACT_05: ENVIRONMENT_READINESS_MATRIX.json_FOR_LANE_READINESS_AND_BLOCKED_ENV
ARTIFACT_RULE_01: STATUS_CLAIMS_MUST_POINT_TO_ARTIFACT_CLASS
ARTIFACT_RULE_02: VERIFIED_AT_UTC_WITHOUT_ARTIFACT_CLASS_IS_NOT_ENOUGH
ARTIFACT_RULE_03: REQUIRED_SURFACE_CLAIMS_AND_LANE_STATUS_CLAIMS_MUST_NOT_SHARE_THE_SAME_SLOT
```

Свежесть snapshot проверяется не временем на глаз, а повторной сверкой фактов перед новым контуром.

```text
FRESHNESS_RULE_01: BEFORE_EACH_NEW_WRITE_CONTOUR_RERUN_git_status_short_branch
FRESHNESS_RULE_02: BEFORE_EACH_NEW_WRITE_CONTOUR_RERUN_git_rev_parse_HEAD
FRESHNESS_RULE_03: BEFORE_EACH_NEW_WRITE_CONTOUR_RERUN_git_rev_parse_origin_main
FRESHNESS_RULE_04: IF_HEAD_OR_ORIGIN_MAIN_DIFFERS_FROM_BOUND_SHA_REBIND_REQUIRED
FRESHNESS_RULE_05: VERIFIED_AT_UTC_IS_METADATA_NOT_SUBSTITUTE_FOR_REBIND
```

## 6. Реальная runtime-модель

Это не просто слой CSS. У системы есть resolver order и commit points.

Слойная модель:

base
  |
mode
  |
profile
  |
workspace
  |
platform
  |
accessibility_override
  |
runtime_fallback
  |
design_state

```text
RESOLVER_ORDER: base mode profile workspace platform accessibility_override runtime_fallback design_state
COMMIT_POINTS: apply drag_end resize_end workspace_save mode_switch safe_reset restore_last_stable app_close_debounced
FORBIDDEN_PATCH_ROOTS: product_truth command_truth recovery_truth command_availability
LAYOUT_PATCH_KEYS: left_width right_width bottom_height editor_root viewport_width viewport_height shell_mode
```

Контекст runtime тоже фиксирован:

```text
CONTEXT_DIMENSIONS: SHELL_MODE PROFILE WORKSPACE PLATFORM ACCESSIBILITY
ACTIVE_UI_PROFILES: BASELINE FOCUS COMPACT SAFE
COMPATIBILITY_PROFILES: LEGACY_MINIMAL LEGACY_PRO LEGACY_GURU
SHELL_MODES: CALM_DOCKED COMPACT_DOCKED SPATIAL_ADVANCED SAFE_RECOVERY
WORKSPACES: WRITE PLAN REVIEW
```

Порты оболочки:

```text
PORTS: PREVIEW_DESIGN COMMIT_DESIGN SAFE_RESET_SHELL RESTORE_LAST_STABLE_SHELL ON_TEXT_INPUT GET_RUNTIME_SNAPSHOT
PORT_RULE_01: SHELL_BEHAVIOR_CHANGES_GO_THROUGH_PORTS
PORT_RULE_02: SHELL_BEHAVIOR_CHANGES_BIND_TO_ALLOWED_COMMIT_POINTS
```

## 7. Как выбрать группу правки

Сначала определяешь одну проблему. Потом выбираешь ровно одну группу.

Визуал и типографика
  |
  +-> только внешний вид
      |
      +-> Group 01

Привязка интерфейса
  |
  +-> кнопка или селект подключается к уже существующему command id
      |
      +-> Group 02

Механика оболочки
  |
  +-> меняется safe reset, restore last stable, shell mode или layout behavior
      |
      +-> Group 03

Storage или recovery
  |
  +-> затронуто сохранение, atomic write, backup, recovery
      |
      +-> Group 04

Документы и статус
  |
  +-> код уже принят и нужно зафиксировать factual docs
      |
      +-> Group 05

```text
DECISION_01: PURE_VISUAL_CHANGE_TO_GROUP_01
DECISION_02: EXISTING_COMMAND_BINDING_TO_GROUP_02
DECISION_03: SHELL_BEHAVIOR_CHANGE_TO_GROUP_03
DECISION_04: STORAGE_OR_RECOVERY_CHANGE_TO_GROUP_04
DECISION_05: POST_ACCEPTANCE_DOC_CHANGE_TO_GROUP_05
DECISION_06: IF_MULTIPLE_GROUPS_ARE_TRUE_SPLIT_THE_TASK
DECISION_07: ONLY_SMALL_EXCEPTION_IS_VISUAL_PLUS_UI_BINDING
```

## 8. Group 01 — визуал и типографика

Это задачи про разметку, стили, отступы, размеры, композицию, иконки и шрифты. Если задачу можно решить без изменения механики, она должна решаться без изменения механики.

Перед исследованием, макетом и финальной шлифовкой Group 01 использовать
`docs/references/YALKEN_DESIGN_TOOL_MATRIX_V1.md`. Матрица является
рекомендательным маршрутизатором инструментов и не расширяет разрешенный набор
файлов, зависимости или исполняемые права этого гайда.

Текущая шрифтовая политика Group 01: использовать готовые лицензированные
гарнитуры с доказанным правом встраивания в desktop-приложение. Самостоятельное
редактирование шрифтов, Glyphs MCP, Fontra и шрифтовый CI не входят в текущий контур.
Наличие `Circe-Regular.ttf` в репозитории не делает Circe финальным визуальным
или лицензионным базовым шрифтом.

```text
GROUP_ID: GROUP_01_VISUAL_AND_TYPOGRAPHY
WHEN: HTML CSS SPACING SIZING TYPOGRAPHY ICONS VISUAL_COMPOSITION
TOUCH: index.html styles.css theme-config.v1.json theme-config.schema.v1.json theme-config-validator.js logo.png Circe-Regular.ttf
DEFAULT_DENYLIST: editor.js designOsRuntime.mjs designOsPortContract.mjs preload.js main.js fileManager.js backupManager.js atomicWriteFile.mjs
PATCH_SCOPE: DESIGN_PATCH_ONLY
PORT_USAGE: NONE_BY_DEFAULT
ESCALATE_IF: NEEDS_RUNTIME_BEHAVIOR OR_STORAGE OR_COMMAND_MEANING_CHANGE
PRECHECK_COMMANDS: git_status_short_branch git_rev_parse_HEAD git_rev_parse_origin_main
POSTCHECK_COMMANDS: npm_run_build_renderer git_diff_name_only
ACCEPTANCE_ARTIFACTS: SELECTED_SCREENSHOT_OR_VISUAL_COMPARISON_PLUS_CLEAN_SCOPE_DIFF
STOP_IF: ANY_RUNTIME_FILE_OUTSIDE_TOUCH_SET_IS_NEEDED
TOOL_MATRIX: docs/references/YALKEN_DESIGN_TOOL_MATRIX_V1.md
FONT_POLICY: READY_LICENSED_FONTS_ONLY_WITH_APP_EMBEDDING_PROOF
```

## 9. Group 02 — привязка интерфейса

Это задачи про то, как существующая кнопка, селект или hotkey подключается к уже существующему command id и existing handler path. Смысл команды в этом контуре не меняется.

```text
GROUP_ID: GROUP_02_INTERFACE_BINDING
WHEN: BUTTON_SELECT_MENU_HOTKEY_TO_EXISTING_COMMAND_ID
TOUCH: editor.js index.html styles.css registry.mjs runCommand.mjs commandBusGuard.mjs projectCommands.mjs palette-groups.v1.mjs
DEFAULT_DENYLIST: designOsRuntime.mjs designOsPortContract.mjs fileManager.js backupManager.js atomicWriteFile.mjs preload.js main.js
PATCH_SCOPE: DESIGN_PATCH_PLUS_MINIMAL_UI_BINDING
PORT_USAGE: EXISTING_COMMAND_SURFACE_ONLY
ESCALATE_IF: NEEDS_NEW_COMMAND_MEANING OR_NEEDS_PRELOAD_MAIN_BRIDGE_OR_STORAGE
PRECHECK_COMMANDS: git_status_short_branch git_rev_parse_HEAD git_rev_parse_origin_main
PRECHECK_PROOF: EXISTING_COMMAND_ID_EXISTING_HANDLER_PATH_NO_SEMANTIC_CHANGE
POSTCHECK_COMMANDS: npm_run_build_renderer npm_test git_diff_name_only
ACCEPTANCE_ARTIFACTS: COMMAND_ID_BINDING_NOTE_PLUS_CLEAN_SCOPE_DIFF
STOP_IF: NEW_COMMAND_MEANING_OR_PRELOAD_MAIN_BRIDGE_BECOMES_NECESSARY
```

## 10. Group 03 — механика оболочки

Это задачи про `safe reset`, `restore last stable`, `shell mode`, `layout behavior`, `design state` и другую механику оболочки. Здесь изменения идут через порты и разрешённые commit points.

```text
GROUP_ID: GROUP_03_SHELL_MECHANICS
WHEN: SAFE_RESET RESTORE_LAST_STABLE SHELL_MODE LAYOUT_BEHAVIOR DESIGN_STATE_MECHANICS
TOUCH: designOsRuntime.mjs designOsPortContract.mjs designOsShellController.mjs repoDesignOsCompat.mjs repoDesignOsBootstrap.mjs repoDesignOsAdapter.mjs editor.js runtimeBridge.js theme-config.v1.json
DEFAULT_DENYLIST: fileManager.js backupManager.js atomicWriteFile.mjs preload.js main.js UNLESS_TASK_EXPLICITLY_OPENS_BRIDGE_LEVEL_CONTOUR
PATCH_SCOPE: DESIGN_PATCH_AND_LAYOUT_PATCH_WITHIN_ALLOWED_KEYS
PORT_USAGE: PREVIEW_DESIGN COMMIT_DESIGN SAFE_RESET_SHELL RESTORE_LAST_STABLE_SHELL GET_RUNTIME_SNAPSHOT
ESCALATE_IF: TOUCHES_PRODUCT_TRUTH OR_RECOVERY_TRUTH OR_COMMAND_MEANING OR_STORAGE
PRECHECK_COMMANDS: git_status_short_branch git_rev_parse_HEAD git_rev_parse_origin_main
PRECHECK_PROOF: CHOSEN_ALLOWED_COMMIT_POINT_PLUS_EXISTING_PORT_PLUS_SHELL_SCOPE_ONLY
POSTCHECK_COMMANDS: npm_run_build_renderer npm_test npm_run_test_electron git_diff_name_only
POSTCHECK_RULE_01: RUN_npm_run_test_electron_WHEN_RUNTIME_SURFACE_CHANGED
ACCEPTANCE_ARTIFACTS: RUNTIME_NOTE_PLUS_CLEAN_SCOPE_DIFF_PLUS_TEST_OUTPUT
STOP_IF: PRODUCT_TRUTH_RECOVERY_TRUTH_COMMAND_MEANING_OR_STORAGE_BECOMES_NECESSARY
```

## 11. Group 04 — хранение и запись

Это уже не чистый Design OS contour. Если визуальная идея внезапно требует трогать `save`, `recovery`, `atomic write`, backup или storage state, нужно останавливать обычный design contour и открывать отдельный storage contour.

```text
GROUP_ID: GROUP_04_STORAGE_AND_WRITE
WHEN: SAVE RECOVERY ATOMIC_WRITE BACKUP PROJECT_STATE STORAGE_AS_TRUTH
TOUCH: fileManager.js backupManager.js atomicWriteFile.mjs snapshotFile.mjs reliabilityLog.mjs ioErrors.mjs recoveryActionCanon.mjs fsHelpers.js path-boundary.js preload.js main.js
TEST_TOUCH: atomicWrite.test.js backupManager.test.js migrationHardening.test.js pathBoundaryHelpers.test.js sector-m-m5-atomic-write.test.js sector-m-m5-snapshot.test.js sector-m-m5-corruption.test.js sector-m-m5-limits.test.js sector-m-m6-safety-config.test.js sector-m-m6-recovery-ux.test.js sector-m-m6-deterministic-log.test.js x3-recovery-smoke.contract.test.js recovery-atomic-write.contract.test.js recovery-snapshot-fallback.contract.test.js recovery-typed-errors.contract.test.js recovery-replay.contract.test.js recovery-corruption.contract.test.js recovery-action-canon.contract.test.js
FIXTURE_TOUCH: big.md corrupt.md existing.md expected-log-record.json
DEFAULT_DENYLIST: PURE_VISUAL_FILES_UNLESS_TASK_IS_EXPLICITLY_SPLIT
PATCH_SCOPE: STORAGE_ONLY_OR_STORAGE_DOMINANT
PORT_USAGE: NOT_A_PURE_DESIGN_OS_PORT_CONTOUR
ESCALATE_IF: TASK_IS_PRESENTED_AS_SMALL_VISUAL_FIX
PRECHECK_COMMANDS: git_status_short_branch git_rev_parse_HEAD git_rev_parse_origin_main
PRECHECK_PROOF: ATOMIC_WRITE_INVARIANT_PLUS_RECOVERY_INVARIANT_PLUS_ISOLATED_STORAGE_SCOPE
POSTCHECK_COMMANDS: npm_test git_diff_name_only
ACCEPTANCE_ARTIFACTS: STORAGE_NOTE_PLUS_RECOVERY_PROOF_NOTE_PLUS_CLEAN_SCOPE_DIFF
STOP_IF: TASK_IS_STILL_DESCRIBED_AS_PURE_VISUAL_OR_UI_ONLY
```

## 12. Group 05 — документы и статус

Это только factual doc refresh после уже принятого кода. Нельзя запускать новую механику через docs-only contour.

```text
GROUP_ID: GROUP_05_DOCS_AND_STATUS
WHEN: CODE_ALREADY_ACCEPTED_AND_DOCS_NEED_ALIGNMENT
TOUCH: HANDOFF.md CONTEXT.md WORKLOG.md PROCESS.md YALKEN_DESIGN_OS_CHANGE_GUIDE_V2_2.md
EXTRA_DOC_RULE: ANY_OTHER_DOC_BASENAME_MUST_BE_NAMED_EXPLICITLY_IN_TASK_PACKET
DEFAULT_DENYLIST: ALL_RUNTIME_FILES
PATCH_SCOPE: DOC_ONLY
PORT_USAGE: NONE
ESCALATE_IF: DOCS_START_DESCRIBING_UNMERGED_OR_UNPROVED_REALITY
PRECHECK_COMMANDS: git_status_short_branch git_rev_parse_HEAD git_rev_parse_origin_main
PRECHECK_PROOF: PREVIOUS_CODE_CONTOUR_ACCEPTED_PLUS_DOCS_FOLLOW_MAINLINE_TRUTH
POSTCHECK_COMMANDS: git_diff_name_only git_diff_stat
ACCEPTANCE_ARTIFACTS: DOCS_ONLY_DIFF_PLUS_MATCHING_STATUS_ARTIFACT_CLASS
STOP_IF: ANY_RUNTIME_FILE_OR_UNMERGED_REALITY_ENTERS_DOCS_CONTOUR
```

## 13. Агентный режим и ветки

Рабочий режим один:

- один основной тред
- один отдельный рабочий тред на одну write-задачу
- одна ветка на один contour

```text
AGENT_MODEL_01: MAIN_THREAD_FOR_SCOPE_AND_ACCEPTANCE
AGENT_MODEL_02: SEPARATE_WORK_THREAD_FOR_WRITE
AGENT_MODEL_03: ORCHESTRATOR_PREPARES_BRIEF_AND_ACCEPTS_RESULT
AGENT_MODEL_04: CODING_AGENT_EXECUTES
AGENT_MODEL_05: DO_NOT_USE_TWO_EQUAL_INDEPENDENT_THREADS_WITHOUT_ONE_TRUTH_CENTER
BRANCH_MODEL_01: NO_DIRECT_WORK_ON_MAIN
BRANCH_MODEL_02: ONE_BRANCH_ONE_CONTOUR
BRANCH_MODEL_03: RISKY_EXPERIMENTS_SHOULD_USE_SEPARATE_WORKTREE
BRANCH_MODEL_04: DEFAULT_DELIVERY_CHAIN_IS_COMMIT_PUSH_PR_MERGE
```

## 14. Командная матрица

Ниже даны точные команды для токенов из `PRECHECK_COMMANDS` и `POSTCHECK_COMMANDS`.

```text
CMD_git_status_short_branch: git status --short --branch
CMD_git_rev_parse_HEAD: git rev-parse HEAD
CMD_git_rev_parse_origin_main: git rev-parse origin/main
CMD_git_diff_name_only: git diff --name-only --
CMD_git_diff_stat: git diff --stat --
CMD_npm_run_build_renderer: npm run build:renderer
CMD_npm_test: npm test
CMD_npm_run_test_electron: npm run test:electron
CMD_RULE_01: TOKEN_NAMES_IN_GROUP_SECTIONS_RESOLVE_TO_THIS_MATRIX
CMD_RULE_02: IF_A_GROUP_NEEDS_EXTRA_COMMANDS_ADD_THEM_TO_TASK_PACKET_NOT_BY_IMPROVISATION
```

## 15. Обязательный входной пакет задачи

Любой агент должен получать минимум это:

```text
TASK_PACKET_01: TASK_ID
TASK_PACKET_02: CURRENT_STATE
TASK_PACKET_03: DESIRED_STATE
TASK_PACKET_04: NON_GOALS
TASK_PACKET_05: GROUP_ID
TASK_PACKET_06: DO_NOT_TOUCH
TASK_PACKET_07: DO_NOT_BREAK
TASK_PACKET_08: REUSE_RULE
TASK_PACKET_09: SELECTED_BASE_SHA
TASK_PACKET_10: BINDING_BASE_SHA
TASK_PACKET_11: VERIFIED_AT_UTC
TASK_PACKET_12: ENV_PROFILE
TASK_PACKET_13: DELIVERY_POLICY
TASK_PACKET_14: ACCEPTANCE_CHECKS
```

Лучший человеческий формат постановки:

- скрин как сейчас
- одна узкая формулировка как должно быть
- одна конкретная проблема
- два или три запрета
- короткая ручная проверка

## 16. Обязательный выходной пакет

```text
REPORT_PACKET_01: TASK_ID
REPORT_PACKET_02: HEAD_SHA_BEFORE
REPORT_PACKET_03: HEAD_SHA_AFTER
REPORT_PACKET_04: COMMIT_SHA
REPORT_PACKET_05: CHANGED_BASENAMES
REPORT_PACKET_06: STAGED_SCOPE_MATCH
REPORT_PACKET_07: GROUP_ID
REPORT_PACKET_08: SNAPSHOT_BINDING_USED
REPORT_PACKET_09: WHAT_CHANGED
REPORT_PACKET_10: WHAT_WAS_NOT_TOUCHED
REPORT_PACKET_11: ACCEPTANCE_RESULT
REPORT_PACKET_12: COMMIT_OUTCOME
REPORT_PACKET_13: PUSH_RESULT
REPORT_PACKET_14: PR_RESULT
REPORT_PACKET_15: MERGE_RESULT
REPORT_PACKET_16: NEXT_STEP
```

## 17. Общие stop-правила

```text
STOP_01: DO_NOT_READ_THIS_GUIDE_AS_SECOND_CANON
STOP_02: NO_SELECTED_BASE_SHA_OR_BINDING_BASE_SHA
STOP_03: DIRTY_WORKTREE_IGNORED_FOR_NEW_WRITE_CONTOUR
STOP_04: MULTI_GROUP_TASK_WITHOUT_SPLIT
STOP_05: VISUAL_TASK_TOUCHES_STORAGE_OR_RECOVERY
STOP_06: BINDING_TASK_CHANGES_COMMAND_MEANING
STOP_07: SHELL_MECHANICS_TASK_BYPASSES_PORTS_OR_COMMIT_POINTS
STOP_08: DOC_ONLY_TASK_DESCRIBES_UNPROVED_REALITY
STOP_09: REQUIRED_SURFACE_GAP_DEFERRED_TEST_LANE_STATUS_ARE_MIXED
STOP_10: DORMANT_DESIGN_OS_PRESENTED_AS_FULLY_LIVE
STOP_11: MAIN_USED_AS_EXPERIMENT_BRANCH
STOP_12: BOUND_SHA_IS_STALE_AGAINST_CURRENT_HEAD_OR_ORIGIN_MAIN
```

## 18. Короткая формула

Если правим визуал, не трогаем механику и storage.

Если правим привязку интерфейса, не меняем смысл команд.

Если правим механику оболочки, идём через порты и разрешённые commit points.

Если трогаем storage, это уже отдельный contour.

Если обновляем docs, делаем это только после принятого кода.

Одна проблема. Один слой. Одна ветка. Один рабочий contour. Одна приёмка.
