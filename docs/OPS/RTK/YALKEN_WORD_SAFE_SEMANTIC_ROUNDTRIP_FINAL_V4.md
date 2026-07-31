```text
BLOCK_ID: YALKEN_WORD_SAFE_SEMANTIC_ROUNDTRIP_FINAL_V4
TITLE: Каноническая план-спецификация доказательного семантического переноса Yalken → Word → Yalken
STATUS_DATE: 2026-07-31
STATUS: CANDIDATE_CANONICAL_NOT_ACTIVATED
ROLE: Нормативный контракт архитектуры, реализации, безопасности, испытаний и доказательства совместимости
SUPERSEDES: V3 и V2 только после канонической интеграции, фиксации contract digest и активации владельцем
EXECUTION_BINDING: NOT_ACTIVATED; текущие задачи не перенаправляются
DESIGN_TOOL_ROUTER: NOT_APPLICABLE
CURRENT_REPO_TRUTH: C04 доставлен через PR 1274; итоговый merge head eeff6062; C05 сохранён checkpoint-коммитом 019482fe
CURRENT_NEXT_ACTION: После активации синхронизировать checkpoint C05 с фактическим origin main и завершить block-range writer

NORTH_STAR: Все поддерживаемые эффекты Word автоматически связываются с правильным местом Yalken и подготавливаются к безопасному применению либо получают доказанный типизированный outcome без скрытой записи
SCIENTIFIC_GOAL: 100 процентов EXACT внутри заранее объявленного Supported Semantic Profile и 100 процентов детерминированной классификации всей остальной входной области
SCIENTIFIC_LIMIT: Corpus подтверждает конечный профиль, но не является доказательством всей бесконечной области OOXML
CLAIM_BOUNDARY: Любой процент связывается с semantic profile, Word profile, operation family, parser, writer, Word build, operating system, corpus digest и exact Git head
SOURCE_OF_TRUTH: Единственной канонической истиной остаётся локальный проект Yalken
TRANSPORT_TRUST: Любой DOCX считается недоверенным транспортом, включая созданный самим Yalken
NO_SILENT_APPLY: Intake, parse, mapping и preview не изменяют manuscript или project truth
USER_AUTHORITY: Реальная mutation выполняется только явной пользовательской командой
ABSOLUTE_VETO: FALSE_EXACT=0; WRONG_SCENE=0; SILENT_APPLY=0; REPLAY_FAILURE=0; SILENT_COMMENT_LOSS=0; PRODUCT_NETWORK_REQUESTS=0
NON_GOALS: Побитовая идентичность DOCX; идентичная пагинация; универсальная поддержка OOXML; определение личности редактора; облачный runtime

DESIGN_OS_LAW: Фича подключается отдельно к Product Plane и Interface Plane и не создаёт частную архитектуру
FEATURE_MANIFEST: FEATURE_INTEGRATION_MANIFEST_V1 фиксирует featureId, commands, events, queries, capabilities, product ports, Design OS ports, adapters, fallbacks и recovery
PRODUCT_PORTS: ReviewCryptoPort; ReviewSecretStorePort; ReviewDocxPackagePort; ReviewParserPort; ReviewRoundStorePort; ReviewEvidenceStorePort; ProjectPersistencePort; RecoveryPort
INTERFACE_PORTS: CommandCatalogPort; CommandDispatchPort; DomainProjectionPort; DiagnosticsPort; ShellProjectionPort
PORT_AUTHORITY: Product adapters не меняют доменную семантику; Design OS ports не получают project write authority
COMMAND_AUTHORITY: Все manuscript и Review Session mutations проходят только через Command Kernel
PROJECTION_AUTHORITY: Интерфейс получает только immutable revision-bound projections
SINGLE_SPINE: Запрещены второй orchestrator, command bus, event bus, database, ledger или автономный runtime-организм
DEPENDENCY_RULE: Сначала существующий adapter, затем стандартная библиотека, затем минимальная owned implementation; новая runtime dependency требует отдельного архитектурного решения
TYPING_PATH_RULE: Parse, diff, hashing, Word analysis и evidence никогда не выполняются в typing hot path

CAPABILITY_PROFILE: Машиночитаемая матрица operationFamily, boundary, Word representation, Yalken command, preconditions, budgets, evidence level, consumer, acceptance test и kill criterion
CAPABILITY_STATES: DECLARED; COMPONENT_PROVEN; PHYSICAL_WORD_PROVEN; SATURATED; INVALIDATED; RETIRED
CAPABILITY_CLAIM: Пользовательское обещание разрешено только начиная с PHYSICAL_WORD_PROVEN
PROFILE_IMMUTABILITY: Профиль нельзя задним числом сужать ради улучшения метрики
PROFILE_VERSIONING: Изменение semantics, encoding, budgets, locator policy или EXACT predicates создаёт новую версию
AUTONOMOUS_CONTOURS: Контуры внутри активированного профиля запускаются автоматически без отдельного approval
OWNER_DECISION_BOUNDARY: Решение владельца требуется только для расширения product profile, смены архитектуры, новой зависимости, нового security boundary или live network capability

STATUS_VECTOR: intakeStatus; authorityStatus; semanticStatus; mappingStatus; conflictStatus; applyStatus; verificationStatus
TAINT_STATES: RAW_UNTRUSTED; PARSED_UNTRUSTED; ROUND_AUTHENTIC; SEMANTIC_CERTIFIED; APPLY_AUTHORIZED; CANONICAL_COMMITTED
TAINT_RULE: Производный artifact не может получить authority сильнее доказанных родителей
SHADOW_RULE: Parsed effects и comments остаются SHADOW_UNAPPLIED до canonical command
UNKNOWN_RULE: UNKNOWN не преобразуется в EMPTY, FALSE, SAFE или UNSUPPORTED без evidence
REASON_REGISTRY: Все MANUAL, BLOCKED, REJECTED и UNKNOWN outcomes используют единый versioned ReasonRegistry

CORE_MANIFEST: Immutable local truth round-а с CompileIR, фактической baseline, ExportMap, scenes, blocks, segments, marks, comments, hashes, profiles и capabilities
HASH_TREE: ROUND → SCENE → BLOCK → SEGMENT с schema version, profile version и ordered child digests
HASH_CYCLE_RULE: CoreManifest не содержит raw hash финального DOCX
FINAL_ARTIFACT_RECORD: Хранит exportArtifactId, rawDocxSha256, coreManifestDigest, finalSemanticDigest, parser profile, exporter version и publication receipt
EXPORT_PIPELINE: CompileIR → provisional DOCX → self-parse → actual baseline → ExportMap → CoreManifest → YRTK2 → final DOCX → second self-parse → semantic equivalence → atomic publication
PUBLICATION_GATE: Пользователю выдаётся только artifact, прошедший оба self-parse и semantic equivalence

YRTK2_ROLE: Компактный authenticated round locator, а не контейнер manuscript data
YRTK2_CARRIER: Один fixed-name custom document property для конкретного Word profile
YRTK2_LAYOUT: magic 4 bytes; tokenVersion 1 byte; keyId 16 bytes; roundId 16 bytes; coreManifestDigest 32 bytes; HMAC 32 bytes
YRTK2_LENGTH: 135 Base64url ASCII-символов без padding и гарантированно меньше 255 UTF-16 units
YRTK2_MAC_INPUT: Неизменяемая domain label плюс весь payload без поля MAC
KEY_MODEL: 256-bit project master key в ReviewSecretStorePort; auth key выводится через HKDF-SHA-256 с отдельной domain label
KEY_STATES: ACTIVE; VERIFY_ONLY; REVOKED; LOST
KEY_LOSS: Preview и evidence сохраняются; automatic apply запрещается с AUTHORITY_REJECT_READ_ONLY
RECOVERY_KIT: Отдельный portability profile после доказательства same-device Word profile

LOCATOR_STACK: YRTK2 round locator плюс profile-selected block locator carriers плюс локальный ExportMap плюс semantic hashes и соседние anchors
BLOCK_LOCATOR: Короткий authenticated token связывает roundId и blockId; конкретный Word carrier выбирается только после physical survival experiments
LOCATOR_CANDIDATES: Bookmarks, content controls, paragraph identities и другие Word carriers являются кандидатами, но не authority до физического доказательства
LOCATOR_SURVIVAL: Save, Save As, reopen, Track Changes, comments, move, copy and paste и compatibility conversion проверяются отдельно
LOCATOR_EXACT_GATE: EXACT требует валидный YRTK2 и единственный согласованный locator path, разрешённый данным Word profile
LOCATOR_FAILURE: Потеря, дублирование, конфликт или неизвестная версия locator переводит candidate в MANUAL или BLOCKED
SOURCE_MAP: Двунаправленная карта Word projection ↔ semantic segment ↔ canonical Yalken block
SOURCE_MAP_GATE: EXACT требует биекцию на полном operation footprint, expected block hash, expected slice hash и sourceMapDigest
REPEATED_TEXT_RULE: Quote не является authority; повторяющийся текст различается по block identity, segment identity, bounded coordinates, locators и hashes

ARTIFACT_IDENTITIES: exportArtifactId хеширует опубликованный DOCX; returnArtifactId хеширует возвращённый DOCX; semanticReturnId хеширует canonical semantic projection
EFFECT_IDENTITY: effectId хеширует нормализованные operations и footprints; applyId связывает effectId, target digest и mutationEpoch
REPLAY_RULE: Разные DOCX-байты с одним semantic effect не создают повторную mutation
ROUND_LIFECYCLE: PREPARED → ARTIFACT_WRITTEN → OPEN_FOR_RETURN → RETURN_QUARANTINED → ANALYZED → READY_FOR_DECISION → APPLY_PREPARED → TERMINAL → COLD_ARCHIVED
MULTI_ROUND: Несколько открытых rounds одной scene разрешены; каждый return сохраняется отдельной immutable branch
SERIAL_WRITER: Анализ может выполняться параллельно; manuscript writer остаётся единственным и сериализованным

PACKAGE_GATE: ZIP reconciliation, CRC, duplicate names, path containment, OPC relationships, content types, namespaces и Markup Compatibility
PACKAGE_PROHIBITIONS: DTD; external entities; macros; OLE; ActiveX; executable embedding; network fetch
PACKAGE_BUDGETS: Input 50 MiB; entries 512; part 10 MiB; compression ratio 200; XML depth 64; attributes 128; wall time 30 seconds; memory 512 MiB
SECURITY_OUTCOME: Нарушение integrity или container policy даёт PACKAGE_REJECT
COMPUTE_OUTCOME: Исчерпание diff или analysis budget даёт MANUAL_RESOURCE_LIMIT
PARSER_ISOLATION: Utility process через ReviewParserPort; no network; no child processes; watchdog; bounded IPC output; crash-to-typed-outcome
PARSER_OUTPUT: Только schema-validated ReturnEvidencePacket без raw XML, unrestricted paths, keys или executable payloads

SEMANTIC_KERNEL: Минимальная Word-модель с text, tab, break, paragraph mark, revision, comment, style reference, structural boundary и opaque atom
UNICODE_RULE: Raw source не нормализуется; NFC используется только для mapping и диагностики; EXACT сверяет исходные code points и hashes
PROJECTIONS: B является фактической baseline; O является Original; C является Current; G является revision, move, property and comment graph
EFFECT_EXTRACTION: Accepted и untracked effects вычисляются через UniqueDiff B→O; pending revisions через G и проверку O→C
UNIQUE_DIFF: EXACT требует единственный normalized optimal semantic plan; количество classes насыщается на двух
DIFF_BUDGETS: Profile обязан задать максимальные atoms, DP cells, anchors, operations, backpointers и wall time
EXACT_FORMULA: AUTHENTIC_ROUND ∧ SAFE_PACKAGE ∧ RETURN_ARTIFACT_RECORDED ∧ BASELINE_AVAILABLE ∧ LOCATOR_CONSISTENT ∧ UNIQUE_MAPPING ∧ UNIQUE_EFFECT ∧ SOURCE_MAP_BIJECTION ∧ UNDERSTOOD_INFLUENCE ∧ WRITER_SUPPORTED ∧ NO_CONFLICT ∧ NOT_APPLIED ∧ DRY_RUN_MATCH ∧ REVERSE_VERIFY
NO_CONFIDENCE_AUTHORITY: Fuzzy match, XPath, timestamps, author metadata, revision IDs, statistical model и LLM остаются advisory-only

COMMANDS_TEXT: ReplaceRangeBounded; DeleteRangeBounded; InsertAtBoundary
COMMANDS_FORMAT: SetInlineMark; SetParagraphStyle; SetListState; SetHyperlink
COMMANDS_STRUCTURE: SplitBlock; MergeBlocks; MoveBlock; InsertBlock; DeleteBlock
COMMANDS_COMMENT: ImportReviewSession; AddThread; AddReply; ResolveThread; ReopenThread; DeleteThread; ReanchorThread
TRANSACTION: Validate proof → dry-run → overlap check → checkpoint → PREPARED journal → atomic write → readback → semantic verification → COMMITTED receipt
PARTIAL_RULE: PARTIAL допустим только для явно выбранного подмножества независимых atomic groups; сбой внутри transaction не считается успешным PARTIAL
COMMENT_RULE: Comments автоматически анализируются в shadow; запись в Review Session выполняется явной Command Kernel operation и отдельным receipt
COMMENT_VETO: Любая необъяснённая потеря comment, reply, state или anchor outcome блокирует release claim
FORMAT_RULE: Сравнивается computed effective meaning после inheritance, а не наличие отдельных XML properties
REEXPORT_RULE: Re-export обязан совпасть с Current только для применённой certified projection; остальные effects перечисляются в residual report

MULTI_SCENE_ANALYSIS: Автоматический анализ, mapping и preview всей книги разрешены с первого профиля
MULTI_SCENE_APPLY_NOW: До coordinator пользователь применяет отдельные атомарные scene groups
MULTI_SCENE_FUTURE: Общий all-or-nothing apply включается только после WAL coordinator либо single-root-pointer commit и crash proof
CONFLICT_RULE: Local drift блокирует apply по умолчанию; structured merge требует unique plans, unique mappings, disjoint footprints и доказанную commutativity
RECOVERY_RULE: Completed-unrecorded, resumable, rollback-required и ambiguous-side-effect states reconciled детерминированно

WORD_LAB: Реальный Word for Mac управляется только test-only adapter и никогда не становится product dependency
WORD_SEQUENCE: Generate → export → Word mutation → save → quarantine → analyze → preview → explicit test approval → apply → readback → re-export → compare
PHYSICAL_WAVES: 10 → 40 → 100 → 300 стратифицированных rounds
SATURATION_RULE: Две последовательные утверждённые waves без нового actionable reason class; стабильный histogram; все veto равны нулю
EVIDENCE_CAPSULE: Seed, digests, profiles, Word build, operating system, exporter, parser, writer, driver, intent, returned artifact, expected effect, observed outcome и final digest
INVALIDATION: Изменение parser, writer, locator policy, semantic profile, Word build, operating system или driver инвалидирует связанное evidence
METRICS: EXACT; MANUAL; BLOCKED; UNKNOWN; FALSE_EXACT; WRONG_SCENE; SILENT_APPLY; REPLAY_FAILURE; COMMENT_LOSS; resource limits; trusted preview time; lineage completeness
PASS_RULE: PASS без numerator, denominator, profile identity, corpus digest и exact head считается UNKNOWN

EXECUTION_00: Возобновить C05 checkpoint; синхронизировать main; завершить bounded block-range writer; tests; commit; push; PR; CI; merge
EXECUTION_01: Зафиксировать Feature Integration Manifest, product ports, status vector, taint states, ReasonRegistry и capability matrix без большого предварительного рефакторинга
EXECUTION_02: Провести Locator Stack survival lab и выбрать физически доказанный block locator для Word for Mac
EXECUTION_03: Реализовать CoreManifest, ExportMap, hash tree, YRTK2, key lifecycle, artifact identities, round states и double self-parse
EXECUTION_04: Ввести isolated parser и Minimal Word Semantic Kernel с hostile package tests
EXECUTION_05: Довести SourceMap, B_O_C_G projections, UniqueDiff, accepted and untracked lane и bounded text effects
EXECUTION_06: Сертифицировать replace, delete, insert, intentional full-block replacement и multi-edit на физическом Word corpus
EXECUTION_07: Довести comments, replies, resolve, reopen, delete, tombstones, orphan outcomes и residual report
EXECUTION_08: Довести effective formatting, headings, lists и inert hyperlinks
EXECUTION_09: Довести split, merge, insert, delete и move blocks через typed structural commands
EXECUTION_10: Довести multiple rounds, immutable branches, replay, stale baseline и structured conflicts
EXECUTION_11: Реализовать multi-scene atomic coordinator и crash recovery
EXECUTION_12: Провести Unicode, adversarial, performance, crash, replay и physical waves до Word SATURATED
EXECUTION_13: После Word SATURATED открыть отдельный Yalken → Google Docs → Yalken profile
EXECUTION_DISCIPLINE: Один write contour одновременно; read-only research может готовиться параллельно; каждый contour автоматически проходит delivery chain
PROCESS_TAX_RULE: Foundation или extraction не являются самостоятельной целью и допускаются только при непосредственном consumer и acceptance test

DEFINITION_OF_DONE: Все declared capability cells имеют 100 процентов EXACT внутри declared domain; вся остальная область получает typed non-silent outcome; все veto равны нулю; каждый apply имеет proof, checkpoint, journal, readback и receipt; Word evidence физическое; claims привязаны к точному remote head
ANTI_REGRESSION: Запрещены крупный carrier, hash-cycle, Final вместо Current, один active round, exportId-only replay, blind paragraph replacement, fuzzy authority, silent comments, corpus-defined scope, второй runtime spine и direct feature writes
CANON_ACTIVATION_GATE: Зафиксировать V4 digest, встроить ссылку в действующий канон и mutable state, проверить отсутствие конкурирующего tracker
REPOSITORY_CHANGES: NONE
TESTS: NOT_RUN_SPECIFICATION_ONLY
NEXT_STEP: Оставить V4 неактивным до решения владельца; после активации начать с EXECUTION_00 и не терять сохранённый C05 checkpoint
```